# Agent A — Sensor Backpressure & Broadcast Concurrency

> This is a hard contract. You are responsible for the sensor data
> plane: from the CARLA C++ callback thread into the WebSocket socket.
> Nothing about the UI, the 3D renderer, the color fidelity of JPEG
> output, the session manager, or the integration test harness belongs
> to you. Other agents own those. Keep your work inside this lane.

---

## 0. Ownership and forbidden edits

### 0.1 Files you own
  - `carla-web-bridge/src/sensor_manager.py`  — ALL of it.
  - `carla-web-bridge/src/ws_broadcaster.py`  — ALL of it.
  - `carla-web-bridge/src/ws/protocol.py` — read-only reference; you
     may add **new** channel-agnostic helpers here if (and only if)
     they are strictly needed for the broadcast concurrency fix.
     Do not change existing frame format.
  - `carla-web-bridge/src/ws/channels.py` — read-only. Do not change
     channel numbers.

### 0.2 Files you may NOT edit
  - `src/realtime_session.py` (Agent B). You may change exactly one
    line there: the call site of `adopt_existing_sensor` (see §3.3).
    No other line.
  - `src/compression/image.py` (Agent C).
  - `src/config.py` — you may add new constants ONLY if strictly
    required (e.g. queue bounds). Prefer adding them at the end of
    the file with a comment linking back to this spec.
  - Every file under `src/routes/` — read-only.
  - Frontend, Unreal, docs — read-only.

### 0.3 Non-goals (will be rejected if you do them)
  - Rewriting the binary protocol.
  - Adding/removing channel types.
  - Changing encoders' output format (JPEG/palette/depth colormap).
    You may move WHERE they are called (off-thread) but not what
    they produce.
  - "Improving" the session manager or routes.
  - Cosmetic refactors in unrelated functions.

---

## 1. Context — the current data plane

```
 CARLA C++ thread (sensor.listen callback)
        |
        v
 _on_sensor_data(sensor_id, data)      [src/sensor_manager.py ~239]
        |
        +-- increments frame_counter
        +-- applies SENSOR_FRAME_SKIP (global)
        +-- looks up subscribers
        |
        v
  +---- is it a camera sensor? ---+
  |                                \
  | YES (camera/depth/seg)          NO (lidar/radar/imu/gnss/...)
  v                                  v
 _enqueue_camera_packet            self._loop.call_soon_threadsafe(
   via loop.call_soon_threadsafe    asyncio.ensure_future,
                                    self._broadcaster.broadcast_raw(
   -> Queue(maxsize=1) per sensor    self._process_sensor_data(...),
                                     set(subs)))
   -> _camera_worker task
      async worker:                 <-- no queue, no worker,
        await queue.get()               no drop policy,
        asyncio.to_thread(              unbounded task creation,
          _encode_camera_packet)        encoding runs on CARLA thread
        await broadcast_raw(payload)
```

The camera side is correct. The non-camera side is the bug.
Additionally, inside `WebSocketBroadcaster.broadcast_raw`, sends to
individual clients are awaited **sequentially** — one slow client
delays every following client by up to `WS_SEND_TIMEOUT`.

---

## 2. The four bugs — in detail

### 2.1 Bug A1: non-camera sensors have no backpressure

#### 2.1.1 Exact location
`src/sensor_manager.py::_on_sensor_data`, roughly lines 272–277.

```python
payload = self._process_sensor_data(sensor_id, data)
if payload and self._loop:
    self._loop.call_soon_threadsafe(
        asyncio.ensure_future,
        self._broadcaster.broadcast_raw(payload, set(subs)),
    )
```

#### 2.1.2 What is wrong
  1. `asyncio.ensure_future` creates a fresh Task every callback.
     With a 20 Hz LIDAR, 2 subscribers, and one subscriber behind,
     the loop accrues pending Tasks that each hold a full LIDAR
     payload (hundreds of KB). RSS climbs; eventually the loop
     starves.
  2. `_process_sensor_data` runs on the CARLA callback thread. For
     LIDAR, it copies `bytes(data.raw_data)` which for a realistic
     point cloud is ~100 KB–1 MB per frame. Blocking the CARLA
     thread introduces jitter into the simulator tick.
  3. There is no drop policy. Oldest data piles up with newest.

#### 2.1.3 Required fix
Apply the camera pattern to every non-camera sensor type. Concrete
steps:

  1. Introduce a per-sensor async queue and worker, uniform across
     all sensor types. Sketch of the shared helper:

     ```python
     # src/sensor_manager.py
     @dataclass(slots=True)
     class SensorPacket:
         sensor_id: int
         channel: int
         frame: int
         timestamp: float
         raw: bytes
         # Camera-specific fields live only on subclass or as Optional
         width: int | None = None
         height: int | None = None
         subscribers: set[str] | None = None  # snapshot at enqueue time

     def _register_sensor_pipeline(self, sensor_id: int, type_id: str) -> None:
         queue = asyncio.Queue(maxsize=self._queue_size_for(type_id))
         self._queues[sensor_id] = queue
         self._workers[sensor_id] = self._loop.create_task(
             self._sensor_worker(sensor_id, queue, type_id)
         )
     ```

  2. Queue sizing defaults — document these in `config.py` as
     named constants, do not hardcode in the manager:

     - camera.*               → 1 (latest frame wins)
     - lidar.ray_cast*        → 1 (latest full sweep wins)
     - radar                  → 2
     - imu                    → 4   (small payload, high rate)
     - gnss                   → 4
     - collision / lane_inv   → 16  (event-like, rare, must not drop)
     - dvs                    → 4

     If the actual payload size or rate makes these wrong, justify
     your replacement in the report with measurements.

  3. Workers read packets from the queue and dispatch to the
     broadcaster. CPU-heavy encoding (LIDAR point packing, DVS
     decode) goes through `asyncio.to_thread(...)` **inside the
     worker**, never on the CARLA callback thread.

  4. On queue full, drop the OLDEST element (same pattern camera
     already uses):

     ```python
     if queue.full():
         try: queue.get_nowait()
         except asyncio.QueueEmpty: pass
     queue.put_nowait(packet)
     ```

     For event-like sensors (collision, lane_invasion) you MUST NOT
     drop — these are discrete events; if the queue overflows,
     record a WARN-level log and enlarge the queue. Document the
     policy divergence clearly.

  5. Tear-down: `destroy_sensor` must cancel the worker AND drain
     the queue. Double-check nothing holds a pending Task after
     destruction.

#### 2.1.4 Unify camera and non-camera paths

Today the worker creation logic is duplicated between
`spawn_sensor` (~lines 89–94) and `_adopt_existing_sensor` (~lines
219–224). Factor both into `_register_sensor_pipeline(sensor_id,
type_id)` called from both places. No duplication allowed after
this task.

#### 2.1.5 Anti-patterns — do not ship these
  - One worker for all sensors, pulling from a shared queue
    (starvation across sensor types — a bursty lidar blocks imu).
  - Unbounded queue with a "we'll drop later" comment. Bound it now.
  - Encoding inside the worker without `asyncio.to_thread` for
    CPU-heavy encoders (blocks the loop).
  - Using `threading.Queue` instead of `asyncio.Queue` (loses
    await-ability, adds a second thread).

---

### 2.2 Bug A2: dead code — duplicated camera encoding path

#### 2.2.1 Exact location
`src/sensor_manager.py::_encode_camera` (roughly lines 383–395) vs.
`_encode_camera_packet` (roughly lines 351–379). They implement the
same logic.

#### 2.2.2 What is wrong
After A1, every camera frame flows through the worker path
(`_encode_camera_packet`). `_encode_camera` has no caller.

#### 2.2.3 Required fix
  1. After A1 lands, grep for `_encode_camera(` — expect zero
     matches.
  2. Delete `_encode_camera`. Also delete any now-unused branches
     inside `_process_sensor_data` that specifically dispatched to
     it. The `_process_sensor_data` function itself may become
     dead if nothing outside cameras enters it through the direct
     path — verify and delete accordingly.
  3. Do NOT leave a deprecated stub, a TODO comment, a
     `# kept for backwards compatibility` line, or any other
     hedging. Delete it clean.

#### 2.2.4 Verification
Include the grep output in your report:

```
$ rg '_encode_camera\b' src/
# should return only _encode_camera_packet, no _encode_camera
```

---

### 2.3 Bug A3: private API leak

#### 2.3.1 Exact location
`src/sensor_manager.py::_adopt_existing_sensor` (line ~199) —
underscore-prefixed, therefore part of the class's private surface.
Called from outside at `src/realtime_session.py:106`:

```python
if self._sensor_manager._adopt_existing_sensor(camera_id):
```

#### 2.3.2 Required fix
  1. Rename the method to `adopt_existing_sensor` (no underscore).
  2. Update the one caller in `realtime_session.py:106`. Change
     exactly that single line. Do NOT edit anything else in
     `realtime_session.py` — Agent B owns it.
  3. Do NOT add an alias (`_adopt_existing_sensor = adopt_existing_sensor`).
     Just rename.
  4. Check all other call sites in the codebase:

     ```
     $ rg '_adopt_existing_sensor' -- '*.py'
     ```

     There should be zero matches after your rename. If there are
     any outside `sensor_manager.py`, raise it in your report and
     ask before proceeding.

#### 2.3.3 Coordination note
Agent B's spec acknowledges you may edit this one line. Tell Agent
B in your report that you have done so (include file:line).

---

### 2.4 Bug A4: sequential broadcast blocks all on the slowest

#### 2.4.1 Exact location
`src/ws_broadcaster.py::broadcast_raw`, lines ~158–169:

```python
for conn in clients:
    if target_clients and conn.client_id not in target_clients:
        continue
    try:
        await asyncio.wait_for(conn.ws.send_bytes(data), timeout=WS_SEND_TIMEOUT)
    except Exception:
        stale_client_ids.append(conn.client_id)
```

Same pattern exists in `broadcast_sensor_data` (~171–191) and
`broadcast_world_tick` (~193–204).

#### 2.4.2 What is wrong
Each iteration awaits its own `send_bytes`. If client 1's send
takes `WS_SEND_TIMEOUT` (timeout drop), client 2 waited that long
before even starting. Worst-case latency for client N is
`N × WS_SEND_TIMEOUT`. Head-of-line blocking.

#### 2.4.3 Required fix
Replace with `asyncio.gather(..., return_exceptions=True)`:

```python
async def broadcast_raw(self, data: bytes,
                        target_clients: set[str] | None = None) -> None:
    clients = [c for c in self._clients.values()
               if target_clients is None or c.client_id in target_clients]
    if not clients:
        return

    async def _send(conn: ClientConnection) -> str | None:
        try:
            await asyncio.wait_for(conn.ws.send_bytes(data),
                                   timeout=WS_SEND_TIMEOUT)
            return None
        except Exception:
            return conn.client_id

    results = await asyncio.gather(*(_send(c) for c in clients),
                                   return_exceptions=False)
    stale = [cid for cid in results if cid is not None]
    if stale:
        await self._drop_clients(stale)
```

Apply the same transformation to `broadcast_sensor_data` and
`broadcast_world_tick`.

#### 2.4.4 Caveats to respect
  - `_drop_clients` mutates `self._clients` under `self._lock`.
    Multiple concurrent broadcasts calling `_drop_clients` with
    overlapping stale sets is already handled by the set union
    in `_cleanup_connection`; verify this does not regress.
  - The `clients` snapshot at the top of `broadcast_raw` is taken
    under no lock today. Keep that behavior (it is eventually
    consistent; newly-joined clients miss one frame — acceptable).
    Do not introduce new locking beyond what exists.
  - Ordering: individual clients still receive frames in arrival
    order because each client has a single `_send` coroutine per
    broadcast call. Cross-client ordering is irrelevant — no
    protocol depends on it.

---

## 3. Workflow (do them in this order)

### Step 1 — Read and audit
Read all of `sensor_manager.py` and `ws_broadcaster.py`. In your
final report, include a numbered list of every function that
creates a Task or schedules work with `call_soon_threadsafe`. The
reviewer will compare this list against your fix to confirm nothing
was missed.

### Step 2 — Extract the shared pipeline helper
Implement `_register_sensor_pipeline(sensor_id, type_id)` and call
it from both `spawn_sensor` and `_adopt_existing_sensor` WITHOUT
yet changing the non-camera path. Commit. Run the bridge; confirm
no behavior change.

### Step 3 — Queue sizing constants
Add the per-sensor-type queue sizes to `config.py` with the names
and defaults in §2.1.3 step 2. Commit.

### Step 4 — Route non-camera sensors through the helper
Modify `_on_sensor_data` so NO sensor type uses the direct
`call_soon_threadsafe(ensure_future, broadcast_raw(...))` path.
Everything enqueues a `SensorPacket` and lets workers handle it.
Commit.

### Step 5 — Delete dead `_encode_camera`
After Step 4, grep and delete per §2.2. Commit.

### Step 6 — Rename `_adopt_existing_sensor`
Rename. Update the one call site in `realtime_session.py:106`.
Commit. Notify Agent B.

### Step 7 — Gather-based broadcast
Rewrite the three broadcast methods per §2.4.3. Commit.

### Step 8 — Measurement harness
See §4.

### Step 9 — Final report
See §5.

---

## 4. Measurement — you must produce numbers

### 4.1 Test setup
Write (or extend) a small tool at
`carla-web-bridge/tools/load_test_sensor_plane.py`:

  - Connects M test WebSocket clients to the bridge.
  - Optionally injects latency into each client's decode via
    `await asyncio.sleep(D)` before acking the frame.
  - Subscribes all clients to one camera sensor AND one LIDAR
    sensor (spawn them via the REST API first if absent).
  - Records per-client per-frame arrival time.
  - Outputs a CSV: `client_id, sensor_id, frame, ts_recv`.

You may use `aiohttp` or `websockets` for the client — pick one.

### 4.2 Required scenarios

Run all four, dump each CSV, and produce summary numbers:

  1. Baseline before your changes, M=3 healthy clients, 60 s.
  2. Baseline before your changes, M=3 where client 2 has 300 ms
     injected decode delay, 60 s.
  3. After your changes, same as scenario 1.
  4. After your changes, same as scenario 2.

### 4.3 Required metrics (per scenario, per client)

  - Frame arrival jitter: stddev of inter-arrival intervals.
  - 95th percentile inter-arrival interval.
  - Dropped frames (gaps in frame sequence number).
  - Bridge process RSS at t = 0, 30, 60 s (via
    `ps -o rss= -p <pid>`).

### 4.4 Pass thresholds (your changes must clear these)

  - Scenario 4 vs Scenario 2: healthy clients' stddev improves by
    ≥ 50 %.
  - Scenario 4 vs Scenario 2: healthy clients' 95p interval
    improves by ≥ 40 %.
  - Scenario 3 vs Scenario 1: no regression worse than 5 % on any
    metric.
  - Scenario 4: bridge RSS does not grow by more than 50 MB over
    60 s (baseline scenario 2 typically grows unbounded).

If any threshold is not met, the task is incomplete — do not
claim success.

---

## 5. Final report — required format

### 5.1 Sections
  1. Audit of Task-creating / `call_soon_threadsafe` sites
     (from Step 1).
  2. Before/after table per bug: ID | file:line (before) |
     file:line (after) | evidence (diff reference or command
     output).
  3. Queue-sizing decision table with the type → size mapping
     and one-sentence rationale per row.
  4. Measurement table: 4 scenarios × per-client metrics. Attach
     CSV filenames.
  5. A subsection "Risks and limitations" listing at least three
     real edge cases your fix has NOT covered and what it would
     take to cover them. If you cannot find any, search harder —
     there are always some.
  6. Coordination log: which lines did you change in
     `realtime_session.py` (§2.3), and when. Did you notify
     Agent B?

### 5.2 Banned phrases (see
`feedback_no_unreproducible`, evidence-backed verification rules)
  - "works", "fine", "good", "improved" without numbers.
  - "approximately equivalent", "roughly matches".
  - "not reproducible" — your work is entirely reproducible. If
    you cannot reproduce a measurement, investigate.
