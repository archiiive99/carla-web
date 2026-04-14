# Agent D — Per-Client Adaptive Sensor Rate

> This is a hard contract. You own the frame-rate decision layer —
> the logic that decides which subscriber receives which frame, at
> what cadence, based on each client's own health. You do NOT own the
> underlying queue/worker architecture (Agent A), the session manager
> (Agent B), the image encoding path (Agent C), or the integration
> test harness (Agent E).

---

## 0. Ownership and forbidden edits

### 0.1 Files you own
  - `carla-web-bridge/src/config.py` — add new constants. Do not
    change existing constants without explicit justification.
  - The frame-skip decision layer inside
    `carla-web-bridge/src/sensor_manager.py`: specifically the
    block inside `_on_sensor_data` that checks
    `SENSOR_FRAME_SKIP` and the subscriber set lookup. You may
    restructure this decision, but NOT the queue/worker plumbing
    Agent A is standardizing (coordinate with Agent A on the
    interface — see §0.3).
  - New module `carla-web-bridge/src/adaptive_rate.py` — create
    and own. This is where the control loop lives.
  - New (or extended) route file for runtime sensor attribute
    adjustment: preferred location
    `carla-web-bridge/src/routes/sensors.py` (this file already
    exists; you extend it with new PATCH endpoints). You may
    NOT add unrelated routes.
  - Stats schema documentation: a block in
    `carla-web-bridge/src/ws/protocol.py` as comments, not code.

### 0.2 Files you may NOT edit
  - `src/ws_broadcaster.py` internals — Agent A. You may add public
    accessor methods if strictly required for the control loop,
    but coordinate with Agent A first.
  - `src/realtime_session.py` — Agent B.
  - `src/compression/image.py` — Agent C.
  - Frontend client code — the frontend agent owns the client side
    of the stats schema. Coordinate on the schema, do not write
    frontend code.

### 0.3 Coordination
Your per-subscriber skip logic depends on Agent A's per-sensor
queue/worker unification. Land your code AFTER Agent A's merges,
or behind a feature flag (`ADAPTIVE_RATE_ENABLED: bool = False` in
config) that can be turned on after A lands.

### 0.4 Non-goals
  - Building a full QoS / congestion-control stack (e.g. BBR-style
    bandwidth estimation). Simple rule-based control is in scope.
    Fancier control is explicitly out of scope for this task.
  - Changing the wire protocol for sensor data frames.
  - Adding authentication, permissions, or multi-tenant quotas.
  - Server-initiated connection close on "slow" clients. Clients
    remain connected; they just receive fewer frames.

---

## 1. Context — what is missing today

### 1.1 Global `SENSOR_FRAME_SKIP`
`src/config.py` exports `SENSOR_FRAME_SKIP` (an integer). In
`src/sensor_manager.py::_on_sensor_data` (~line 244):

```python
if SENSOR_FRAME_SKIP > 0 and frame_count % (SENSOR_FRAME_SKIP + 1) != 0:
    return
```

This is a GLOBAL gate. If one client is on a slow link, every
client gets throttled. If one client is on fiber, everyone is
bottlenecked by the slowest.

### 1.2 Client stats ignored
`src/ws_broadcaster.py` accepts a `stats` message and writes it to
`conn.last_stats` (~lines 118–119 for text, 150–154 for binary).
Nothing reads `last_stats`. No feedback loop.

### 1.3 Runtime attribute changes unsupported
Sensor attributes (`sensor_tick`, `image_size_x`, `fov`, ...) are
fixed at spawn time. There is no HTTP route to change them at
runtime. The only way to alter a camera's framerate is to destroy
and respawn it, which disrupts subscriptions.

---

## 2. Bugs / required features

### 2.1 Feature D1 — per-subscriber frame-skip

#### 2.1.1 Required semantics
Each subscriber has a per-sensor target rate. Example: client A
subscribes to camera 5 at 30 fps; client B subscribes to camera 5
at 10 fps. A receives every third frame (assuming the sensor's
native rate is ~30 fps), B receives every frame that is divisible
by 3 of what A gets. No global gate involved.

#### 2.1.2 Data model
Introduce a per-(client, sensor) rate state:

```python
# src/adaptive_rate.py
from dataclasses import dataclass
from typing import Dict, Tuple

@dataclass
class SubscriberRate:
    target_fps: float          # requested by client or default
    effective_fps: float       # current rate after adaptive throttling
    frames_since_send: int     # counter driving skip decisions
    last_adjust_time: float    # monotonic seconds, for hysteresis

class RateController:
    # key: (client_id, sensor_id)
    _state: Dict[Tuple[str, int], SubscriberRate]
```

#### 2.1.3 Decision function
`should_send(client_id, sensor_id, sensor_native_fps) -> bool`:
  - Compute ratio = sensor_native_fps / state.effective_fps.
  - Increment frames_since_send; if frames_since_send ≥ ratio,
    reset counter and return True. Else return False.
  - Handle the case where native_fps is unknown (fall back to
    "send every frame"); include a log-level-DEBUG message.

#### 2.1.4 Integration with `_on_sensor_data`
After Agent A's refactor, the dispatch to subscribers is clean.
Insert the gate per subscriber inside the worker's fan-out:

```python
# inside the worker that reads a packet off the per-sensor queue
active_subs = []
for cid in packet.subscribers:
    if rate_controller.should_send(cid, packet.sensor_id, native_fps):
        active_subs.append(cid)
if not active_subs:
    return
await broadcaster.broadcast_raw(payload, set(active_subs))
```

If Agent A's exact interface is still in flux when you start,
define your own minimal adapter and mark it `# TODO: replace with
A's final API` — your change must still land cleanly once A ships.

#### 2.1.5 Client-requested target
Add a WS message (extend the text protocol and the binary protocol
branch):

```json
{ "action": "set_rate",
  "sensor_id": 5,
  "target_fps": 15 }
```

On receipt:
  - Clamp to `[MIN_CLIENT_FPS, native_fps_of_sensor]`. Define
    `MIN_CLIENT_FPS = 1` in `config.py`.
  - Update `SubscriberRate.target_fps` AND `effective_fps`
    (resetting adaptive downgrade state).
  - Log at INFO: `client X: sensor Y target_fps := Z`.

### 2.2 Feature D2 — adaptive control loop

#### 2.2.1 Stats schema (your choice; document it)

Client sends periodically (e.g. 1 Hz):
```json
{ "action": "stats",
  "ts_client_ms": 1713024000000,
  "sensors": {
    "5": { "queue_backlog": 2,
           "decode_lag_ms": 45,
           "frames_dropped": 0,
           "frames_received": 30 },
    "9": { ... }
  },
  "rtt_ms": 28,
  "viewport_active": true
}
```

Document this schema in `src/ws/protocol.py` as a comment block.
Add a dataclass in `src/adaptive_rate.py`:

```python
@dataclass
class ClientStatsSample:
    ts_monotonic_server: float
    client_id: str
    sensor_stats: Dict[int, Dict[str, float]]
    rtt_ms: float | None
    viewport_active: bool
```

Maintain a ring buffer of last N samples per (client, sensor)
(N=10 is fine).

#### 2.2.2 Control rule
Periodic task at 1 Hz (spawn as an asyncio Task in the bridge
lifecycle startup). For each (client_id, sensor_id):

Define signals:
  - BACKLOG_HIGH: last sample's queue_backlog > 3 OR rising trend
    over last 3 samples.
  - DECODE_LAG_HIGH: decode_lag_ms > 100 in last sample.
  - HEALTHY: backlog ≤ 1 AND decode_lag_ms ≤ 40 for last 5 samples.

Rule:
  - If BACKLOG_HIGH OR DECODE_LAG_HIGH: multiply effective_fps by
    0.75, clamped to MIN_CLIENT_FPS. Update last_adjust_time.
  - Else if HEALTHY AND effective_fps < target_fps AND
    time_since_last_adjust > 10s: multiply effective_fps by 1.25,
    clamped to target_fps. Update last_adjust_time.
  - Else: no change.

Log every adjustment at INFO with all inputs (backlog, lag, rtt,
old fps, new fps, reason).

Hysteresis: do NOT downgrade again within 2 s of a previous
downgrade, to avoid oscillation under bursty load.

#### 2.2.3 "Viewport not active" fast path
If the latest stats show `viewport_active=false` (tab in background
or offscreen on the client), force `effective_fps = 1.0` (once per
second, heartbeat level). On `viewport_active=true`, restore to
`target_fps`. This is a major win and a common real-world case.

### 2.3 Feature D3 — runtime `sensor_tick` and related attribute
adjustment

#### 2.3.1 Investigate CARLA support
Determine whether `carla.Actor.set_attribute` or equivalent works
on a running sensor. Two possibilities:

  - **Supported**: `sensor.stop(); sensor.set_attribute(...);
    sensor.listen(...)` path exists. Document and use.
  - **Not supported**: you must destroy and respawn. Preserve the
    sensor_id mapping from the client's perspective by maintaining
    an "external id" indirection OR by immediately updating
    subscribers with the new CARLA actor id via a control frame
    (e.g. a new channel SENSOR_ID_REMAP carrying `{old_id, new_id}`).

Record your finding with source citation.

#### 2.3.2 Route
In `src/routes/sensors.py`, add:

```
PATCH /sensors/{sensor_id}/attributes
Body: { "sensor_tick": 0.1, "fov": 100 }
```

Behavior per attribute:
  - If live-adjustable: apply in place. Return 200 with the
    effective attributes.
  - If requires recreate: invoke the recreate path, return 200
    with BOTH old and new ids and any mapping info.
  - Unknown attribute: 400 with explanation.

Handle concurrency: a PATCH in flight while frames are being
dispatched must not deliver garbled payloads to subscribers. Drain
the queue, swap, resume. Document the exact sequence.

---

## 3. Workflow

1. Wait for (or flag-gate around) Agent A's backpressure refactor.
2. Build `RateController` in `src/adaptive_rate.py` with unit
   tests (pure-python, no CARLA).
3. Integrate into the worker fan-out (D1).
4. Add `set_rate` WS action.
5. Add stats schema docs and ingest loop (D2).
6. Add periodic adjustment task, hysteresis, viewport-inactive
   fast path.
7. Investigate CARLA runtime attribute support; decide D3 path.
8. Implement PATCH route.
9. Measurement (§4).

---

## 4. Measurement — you must produce numbers

### 4.1 Two-client divergence test

Build `tools/adaptive_rate/two_client_test.py`:
  - Client "fast": reads every frame immediately, reports healthy
    stats (backlog=0, decode_lag_ms=10).
  - Client "slow": sleeps `DECODE_DELAY_MS` (configurable) before
    acking; reports growing backlog and high decode_lag.
  - Both subscribe to the same camera and the same LIDAR.
  - Both report stats at 1 Hz with realistic synthetic values.
  - Run for 60 s. Record per-client fps over time at 1 Hz
    resolution.

Expected outcome (the acceptance criterion):
  - fast client: effective_fps stays ≥ 0.9 × target_fps for ≥ 90 %
    of the run after the first 5 s.
  - slow client: effective_fps drops by ≥ 30 % from target within
    15 s, stabilizes, does not oscillate (no more than 2 crossings
    of ±10 % of its post-downgrade value over the last 30 s).

### 4.2 Viewport-inactive test

Single client, subscribed to camera at 30 fps target.
  - For the first 30 s: `viewport_active=true`. Expect ~30 fps.
  - At t=30s, flip to `viewport_active=false`. Expect effective_fps
    to drop to ~1 fps within 2 s.
  - At t=60s, flip back to `true`. Expect effective_fps to return
    to ~30 fps within 2 s.

### 4.3 Runtime PATCH test

Subscribe to camera, measure fps for 10 s.
PATCH `sensor_tick` to double the current value (halving rate).
Measure fps for next 10 s — expect ~half.
PATCH back to original — expect original.

During the PATCH, the subscription must not disconnect; no bytes
must be delivered that fail to decode.

### 4.4 Memory check
Over a 10-minute adaptive run: bridge RSS must not grow by more
than 30 MB (no leaks in the ring buffers or adjustment records).

---

## 5. Acceptance criteria

  [ ] `RateController` unit tests pass (pure python).
  [ ] Per-subscriber skip is wired; grep confirms the global
      `SENSOR_FRAME_SKIP` is either deleted or only used as the
      default for new subscribers.
  [ ] `set_rate` WS action works end-to-end; log line confirms.
  [ ] Stats schema documented in `src/ws/protocol.py`.
  [ ] Two-client divergence test meets §4.1 thresholds. Evidence:
      fps-over-time plot + summary numbers.
  [ ] Viewport-inactive test meets §4.2. Evidence: plot + numbers.
  [ ] Runtime PATCH test meets §4.3. Evidence: fps timeline + no
      decode errors in logs.
  [ ] 10-minute memory test: RSS delta ≤ 30 MB.
  [ ] Adjustment log lines include all required fields.

---

## 6. Coordination log

At the end of the report, an explicit subsection listing:
  - The exact interface you used from Agent A (function names and
    signatures), and any divergence from A's final API.
  - The stats schema you and the frontend agent agreed on. If
    you wrote it unilaterally, flag it; the frontend must
    implement the sender.
  - Any lines you considered editing in files owned by other
    agents, and why you chose not to.

---

## 7. Report format

  1. Stats schema (the authoritative version).
  2. Control rule pseudocode (exact).
  3. D1 / D2 / D3 before/after table.
  4. §4 measurement plots + tables.
  5. §6 coordination log.
  6. "Known limitations" section with at least three items, e.g.:
     - "Control rule does not use RTT yet; only backlog and
       decode_lag drive adjustments."
     - "Runtime recreate path for sensor_tick incurs a ~200 ms
       blackout window; subscribers see a visible pause."
     - "Per-client rate state is in-memory; a bridge reload resets
       all rates to defaults, requiring clients to re-issue
       `set_rate`."

Banned phrases: "adapts well", "works under load", "feels smooth"
without the backing numbers. Per
`feedback_no_unreproducible` and the verification-honesty rules,
every claim has evidence.
