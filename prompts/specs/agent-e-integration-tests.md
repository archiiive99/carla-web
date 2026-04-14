# Agent E — Integration Test Harness (No-Restart Contract)

> This is a hard contract. You own end-to-end tests that exercise the
> running bridge. You do NOT write production code except for
> strictly-necessary, pre-approved instrumentation hooks. You do NOT
> restart the bridge, the CARLA server, or the tmux session — ever.
> Your tests attach to what is already running.

---

## 0. Ownership, forbidden actions, and hard constraints

### 0.1 Files / directories you own
Create a new directory:
  - `carla-web-bridge/tools/e2e/`

Inside it, you own:
  - `conftest.py`, `run_suite.py`, all `test_*.py` files.
  - A small `fixtures/` subdirectory for generated state (weather
    snapshots, expected palettes, etc.).
  - `README.md` explaining how to run the suite, what each test
    asserts, which agent's work each test guards.

Do NOT use `carla-web-bridge/tests/` unless you explicitly revive
it (it is currently in `.gitignore`). If you revive it, update
`.gitignore` and document the decision in your README.

### 0.2 Files you may NOT edit
  - Everything under `src/`. If a test needs something the bridge
    doesn't expose, raise it in your report — another agent will
    add it. Do not silently add production code.
  - `run_local.sh`, `run_carla.sh`, `start_streaming.sh`. Your
    tests do not touch the supervisor.
  - `main.py`. Do not touch initialization. The only hot-reload
    you use is the existing `touch src/main.py` trigger.

### 0.3 Hard operational constraints
  1. **No restart.** You may not `kill`, `pkill`, restart tmux,
     restart CARLA, or reboot the bridge supervisor. The only
     reload trigger you may use is:
     ```
     touch /data1/song99/carla/carla-web-bridge/src/main.py
     ```
     which the supervisor catches and hot-reloads.
  2. **No port scanning or tmux introspection beyond what the
     memory already documents.** Ports:
       - CARLA RPC: 58336
       - bridge HTTP/API: 58337  (confirm from
         `carla-web-bridge/src/config.py` if uncertain)
       - bridge WS: 58338        (same caveat)
     Read `config.py` once at suite startup to confirm.
  3. **Idempotence.** Running the suite twice back-to-back must
     leave the world in a state indistinguishable from the first
     run's starting state. Each test cleans up what it spawned.
     No "flush world" shortcuts.
  4. **No test depends on another.** Any test must pass when run
     alone (via `pytest path/to/test_foo.py::test_bar`).
  5. **Tests must not destroy managed actors** (the
     `role_name="bridge_ego"` vehicle and its camera). That state
     belongs to Agent B's session manager.
  6. **Tests must not change global weather without restoring it**
     at the end (the session manager sets clear daytime; you may
     flip temporarily then restore).

### 0.4 Non-goals
  - Browser-based end-to-end (that's a different agent's domain).
  - Load/performance testing — Agent A and Agent D own their own
    load harnesses. You may call into their tools if they expose
    them, but do not re-implement.
  - Unit tests of individual functions (they live next to the code
    they test).

---

## 1. Scope of coverage

You cover the public contract of the bridge:
  - HTTP API (REST routes under `src/routes/*`).
  - WebSocket binary protocol (`src/ws/protocol.py`, channels in
    `src/ws/channels.py`).
  - Managed session invariants (Agent B's guarantees).
  - Broadcast correctness under multi-client load (Agent A's
    guarantees).
  - Adaptive rate behavior (Agent D's guarantees) — optional if
    Agent D has not landed; document and skip if so.

You do NOT cover:
  - Color fidelity (Agent C's own harness).
  - Frontend correctness.
  - Unreal / CARLA internals.

---

## 2. Scenario catalogue — implement all of these

Each scenario is one `test_*.py` file (or one `test_*` function,
at your discretion — keep functions small enough to debug).

### 2.1 E1 — Actor lifecycle

```
spawn -> list -> destroy -> list
```

Assertions:
  - POST `/actors/spawn` with a valid blueprint & transform
    returns 200 and a JSON body containing `actor_id` (or whatever
    the actual schema in `src/models/schemas.py` says — read it,
    don't guess).
  - GET `/actors` includes the returned id.
  - DELETE `/actors/{id}` returns 200.
  - GET `/actors` excludes the id.
  - Leak invariant: total actor count BEFORE test equals total
    actor count AFTER. Count via `/actors` and exclude the
    managed session's actors.

### 2.2 E2 — Sensor subscription + binary frame round-trip

```
spawn sensor -> WS subscribe -> receive N frames -> WS unsubscribe
-> no-more-frames grace window -> destroy sensor
```

Assertions:
  - Spawn a `sensor.camera.rgb` on an existing non-managed
    vehicle (create a test vehicle if needed, clean it up after).
  - Open WS connection, send binary subscribe frame using the
    actual codec (`ws.protocol.encode_frame` + subscribe channel).
    If a helper is not publicly exposed, request that
    Agent A expose one (do not reimplement the wire format).
  - Receive ≥ 10 binary frames.
  - Decode each with the production decoder functions. Assert:
    * channel byte == CAMERA.
    * width/height match the spawn config.
    * JPEG bytes decode via Pillow/cv2 to a valid image matching
      (width, height, 3).
    * Frame numbers are monotonic (duplicates or skipped numbers
      are logged but do not fail — note the drop rate).
  - Send unsubscribe. Assert: zero additional frames for the
    camera sensor id over the next 2 s.
  - Destroy sensor.

### 2.3 E3 — Managed session adoption across hot reload

```
read snapshot -> touch main.py -> poll snapshot -> assert recovery
```

Assertions:
  - GET `/simulation/status` (or whichever route exposes the
    session snapshot — check `src/routes/simulation.py`).
    Capture `default_vehicle_id`, `default_camera_id`,
    `session_ready=true`.
  - `touch carla-web-bridge/src/main.py` via `subprocess` (this
    is allowed; it is not a restart, it is a hot-reload trigger).
  - Poll `/simulation/status` every 500 ms. Within 15 s,
    `session_ready` must return to true AND `default_vehicle_id`
    must equal the previously captured value.
  - Assert exactly one actor with `role_name="bridge_ego"` exists
    via `/actors` filtered by role.
  - Repeat this entire cycle 5× within a single test. After the
    5th cycle, assert that the total world actor count equals
    the pre-test count.
  - The test restores state by virtue of Agent B's adoption logic;
    you do not need a cleanup step.

### 2.4 E4 — Weather change broadcast

```
set weather A -> read world_tick -> assert reflects A -> restore
```

Assertions:
  - Capture current weather via the appropriate route.
  - Set weather to a distinct state (e.g. cloudiness=90,
    precipitation=80, sun_altitude_angle=30).
  - Open WS, wait for the next `WORLD_TICK` frame.
  - Decode the tick payload (confirm the format in
    `src/ws/protocol.py` — if the tick does NOT carry weather
    today, this is a finding; note it and adjust the assertion
    to whatever the tick DOES carry, asserting no regression).
  - Assert the weather state matches (tolerance on float values:
    ±0.5 on 0–100 scale).
  - Restore previous weather (or the CLEAR_DAYTIME preset Agent B
    documents).

### 2.5 E5 — Recording round-trip

```
start recording -> spawn + drive -> stop -> playback -> compare
```

Assertions:
  - Start a recording via `/recording/start` (or whatever the
    actual route expects). Record the returned filename/id.
  - Spawn a vehicle with autopilot enabled. Sample its position
    over 10 s at 10 Hz. Record the positions.
  - Stop recording.
  - Begin playback via the appropriate route.
  - Sample the played-back vehicle's position over the same 10 s
    window.
  - Assert that, frame-for-frame (or with a documented tolerance),
    the trajectory matches.
  - If exact determinism is not achievable, document the tolerance
    (e.g. max per-axis error < 0.5 m over the recorded horizon).
    Do not silently relax to an empty assertion.
  - Delete the recording file.

### 2.6 E6 — Slow-client isolation

```
open fast client + slow client -> subscribe both -> measure jitter
-> assert fast client unaffected
```

Assertions:
  - Spawn a `sensor.camera.rgb` on a non-managed vehicle.
  - Open two WS connections:
    * Fast: reads frames in a tight loop.
    * Slow: `await asyncio.sleep(0.5)` between reads.
  - Both subscribe to the camera. Run 30 s.
  - Record per-frame arrival timestamps for the Fast client.
  - Assert: stddev of Fast's inter-arrival intervals < 50 ms
    (nominal 20 fps, ±1 frame tolerance).
  - Assert: 95th-percentile Fast inter-arrival < 1.5 × mean.
  - Assert: Slow client receives ≥ some minimum (it should not be
    dropped).
  - Clean up sensor.

This test is the acceptance test for Agent A's A4. Coordinate on
the specific thresholds.

### 2.7 E7 — Sensor destruction during active stream

```
subscribe -> destroy -> assert stream stops cleanly + no exceptions
```

Assertions:
  - Subscribe to a newly-spawned sensor. Receive a few frames.
  - Destroy the sensor via DELETE.
  - Assert: no frames for this sensor id arrive in the next 2 s.
  - Assert: bridge logs contain no uncaught exception for the
    destroyed sensor (grep the log file for ERROR-level messages
    containing the sensor_id over the test window).
  - Assert: `/sensors` (or equivalent) does not list the sensor.

### 2.8 E8 — Concurrent subscribers to same sensor

```
spawn sensor -> 5 WS clients all subscribe -> each receives frames
```

Assertions:
  - Spawn one sensor.
  - Open 5 WS connections concurrently; each subscribes.
  - Over 10 s, every client must receive ≥ N frames (N depends
    on the sensor tick; compute expected min and assert).
  - All 5 frame streams match frame-for-frame on frame number
    (content bytes may differ by encoding timestamps; compare
    the `frame` field extracted from the payload header).
  - Clean up.

---

## 3. Implementation requirements

### 3.1 Framework
`pytest` + `pytest-asyncio`. Use `asyncio` WS clients (the
`websockets` package is fine) or `aiohttp`.

### 3.2 Fixtures (in `conftest.py`)
  - `bridge_urls`: reads `src/config.py` once and returns a dict
    `{ "http": "...", "ws": "..." }`.
  - `http_client`: an `aiohttp.ClientSession` scoped per-test.
  - `ws_connect`: a helper that opens a WS connection with timeouts.
  - `clean_non_managed_actors`: pre-test fixture that records the
    actor count excluding managed; post-test fixture that asserts
    the count is unchanged. Applied by default; individual tests
    can opt-out if they need to leave state (none of E1–E8 should).
  - `weather_snapshot`: captures current weather on entry, restores
    on exit.

### 3.3 Decoder helpers
Do NOT re-implement the binary frame format. Import:
  - `from src.ws.protocol import decode_frame, encode_frame`
  - `from src.ws.channels import Channel`

If these symbols are private or not exposed at module top level,
raise it in your report. Agent A or the frontend agent should
expose them.

### 3.4 No reliance on `print`
Use `logging`. The test runner captures logs. On failure, the
report must include the captured log for the failing test.

### 3.5 One command to run everything
Provide:
```
python tools/e2e/run_suite.py --base-url http://host:58337 \
       --ws-url ws://host:58338 [--tests E1,E3,E6]
```

Default runs all; `--tests` filters.

### 3.6 CI-friendly output
Emit a JUnit XML report as well as a Markdown summary. JSON is
also fine; pick one machine-readable format and one human-readable.

---

## 4. Required properties of the suite as a whole

  1. **Idempotence confirmed by re-run.** `run_suite.py` twice;
     diff actor/weather/managed snapshots before first run and
     after second run. They must match within documented tolerance.
  2. **No flakes.** Run the suite 10 times; flake rate < 5 %. If
     higher, quarantine the flaky test with a `@pytest.mark.flaky`
     and document the root cause in the README.
  3. **Fast failure.** If CARLA is not reachable, the suite exits
     with a clear error within 5 s, not a cascade of timeouts.
  4. **Readable logs.** Each test emits a `--- E3 start ---` /
     `--- E3 end: PASS in 4.2 s ---` header.

---

## 5. Acceptance criteria

  [ ] Directory `carla-web-bridge/tools/e2e/` exists with README,
      `conftest.py`, `run_suite.py`, and all 8 test files.
  [ ] All 8 scenarios implemented per §2.
  [ ] One-command runner per §3.5.
  [ ] Fixtures and decoder helpers per §3.2–§3.4.
  [ ] Idempotence property verified: re-run diff attached.
  [ ] Flake rate < 5 % over 10 sequential runs. Evidence: run log
      summary.
  [ ] No uncaught bridge exceptions during any passing run.
      Evidence: grep of bridge log.

---

## 6. Coordination log (required subsection in the report)

  - Exact symbol imports from production code; if any were private
    and needed exposing, list them and which agent should act.
  - Shared thresholds with Agent A (E6) and Agent D (frame-rate
    assertions). Record the agreed numbers.
  - Any ambiguity you discovered in `src/models/schemas.py` or
    routes (field names, response shapes). Document what you
    assumed and why.

---

## 7. Report format

  1. Scenario-by-scenario pass/fail table with per-test run time
     and evidence link (log excerpt).
  2. Idempotence re-run diff summary.
  3. Flake analysis (10-run summary, quarantine list if any).
  4. Coordination log per §6.
  5. "Limitations" section with at least three items, e.g.:
     - "Recording determinism is tolerance-based, not exact."
     - "E4 does not assert weather effects on sensor output,
       only that world_tick carries the new state."
     - "E6 thresholds assume 20 fps nominal; LIDAR scenarios
       would need different numbers."

Banned phrases: "tests pass" without the per-test evidence; "no
issues" without the log grep showing zero uncaught exceptions;
"stable" without the flake-rate number.

Per `feedback_no_unreproducible` and the verification-honesty
rules, every acceptance claim has an artifact.
