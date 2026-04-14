# Agent B — RealtimeSessionManager Refactor & Hot-Reload Hardening

> This is a hard contract. You own the managed browser-facing CARLA
> session: a single default ego vehicle and its attached RGB camera,
> plus the logic that keeps them alive across bridge hot-reloads via
> `role_name="bridge_ego"` adoption. You do NOT own the sensor data
> plane (Agent A), color/encoding fidelity (Agent C), adaptive rate
> control (Agent D), or integration tests (Agent E).

---

## 0. Ownership and forbidden edits

### 0.1 Files you own
  - `carla-web-bridge/src/realtime_session.py` — ALL of it.
  - You may add at most ONE small helper module under `src/` if a
    clean extraction demands it (e.g. `src/session_state.py` for
    the enum in §3.2). Prefer keeping everything in one file unless
    tests force the split.

### 0.2 Files you may NOT edit
  - `src/sensor_manager.py` (Agent A).
  - `src/ws_broadcaster.py` (Agent A).
  - `src/compression/image.py` (Agent C).
  - `src/routes/*` — read-only. If a route calls a method you
    rename, raise it in your report and coordinate, do not edit.
  - `src/main.py` — read-only. If initialization changes are
    needed, document them for the user to apply manually.
  - `src/config.py` — you may ADD new constants (e.g. new timing
    knobs) but do not change existing constants' values without
    justification.
  - Frontend, Unreal — untouchable.

### 0.3 Coordination point with Agent A
Agent A is renaming `_adopt_existing_sensor` → `adopt_existing_sensor`
in `sensor_manager.py`, which affects `realtime_session.py:106`.
Per Agent A's spec, Agent A will update that single line. You must
not also edit that line. If you land your work before Agent A, leave
the underscore variant in place; Agent A will update it on their
pass. Record in your report when the rename crossed over.

### 0.4 Non-goals (rejected if done)
  - Moving sensor spawning/destruction logic into
    `RealtimeSessionManager` (that lives in `SensorManager`).
  - Changing the binary WS protocol or route contracts.
  - Adding "convenience" methods that callers don't need today.
  - Refactoring `CarlaClientManager` from the inside.

---

## 1. Context — what this class does and why it is fragile

`RealtimeSessionManager` guarantees that, as long as CARLA is up and
the bridge is armed, there is exactly ONE default ego vehicle (tagged
`role_name="bridge_ego"`) with exactly ONE RGB camera attached,
available for browser streaming.

It must survive:
  - Bridge hot reload (triggered by `touch src/main.py` per the
    supervisor in `run_local.sh`).
  - CARLA restart (the bridge supervisor loop catches this; on
    reconnect, the session manager adopts whatever it finds).
  - User-initiated "Destroy All" on the UI (managed actors can be
    destroyed out from under the manager).
  - Multiple managed vehicles appearing simultaneously (e.g. the
    previous bridge crashed before cleaning up, then the new bridge
    spawns another before adoption logic runs).

It also enforces clear daytime weather on every cold session start
so the camera feed is legible.

Today's code works for the happy path and for the first-order
hot-reload case. The second-order cases (see §3.3) are where bugs
hide.

---

## 2. Current state — required baseline understanding

Before editing anything, produce and include in your final report a
state-transition table for the CURRENT code. Suggested rows (adjust
to what you actually see):

| From                                | Trigger                     | To                             | Side effects                         |
|-------------------------------------|-----------------------------|--------------------------------|--------------------------------------|
| `_armed=False`                      | `arm()`                     | `_armed=True`                  | none                                 |
| armed, no vehicle                   | `ensure_running()` + runtime ready | vehicle spawned | weather set (first time), `_vehicle_ready_at_monotonic = now` |
| armed, vehicle, no camera, delay OK | `ensure_running()`          | camera spawned                 | sensor listener pipeline registered  |
| vehicle missing (dead)              | `_reconcile_managed_actors_locked` | no vehicle        | camera destroyed if still present    |
| camera detached / dead              | `_reconcile_managed_actors_locked` | no camera         | cleared, respawned next cycle        |
| external `/actors/destroy` on veh   | `invalidate_actor(id)`      | cleared                        | does not destroy on CARLA side       |
| `reset(destroy_managed=True)`       | external                    | `_armed=False`, managed destroyed | full teardown                     |

If your table disagrees with the code, fix your table first.

---

## 3. Bugs / required changes

### 3.1 Bug B1 — duplicated weather-setting block

#### 3.1.1 Exact duplicates
  - `_set_clear_weather_sync` (~lines 189–210):
    ```python
    weather = carla.WeatherParameters(
        cloudiness=10.0,
        precipitation=0.0,
        precipitation_deposits=0.0,
        wind_intensity=5.0,
        sun_azimuth_angle=220.0,
        sun_altitude_angle=60.0,
        fog_density=0.0,
        fog_distance=0.0,
        fog_falloff=0.0,
        wetness=0.0,
    )
    world.set_weather(weather)
    ```
  - `_ensure_vehicle_sync` (~lines 270–286): the identical block
    inlined a second time, after the vehicle spawn succeeds.

Both run on a typical first-arm sequence. Two `world.set_weather`
calls per cold start is wrong (not catastrophic, but a signal that
state ownership is unclear).

#### 3.1.2 Required fix
  1. The ONLY place weather is set lives in `_set_clear_weather_sync`.
  2. Extract the `WeatherParameters(...)` literal into a module-level
     constant (e.g. `CLEAR_DAYTIME_WEATHER`) so the values exist in
     exactly one place:
     ```python
     CLEAR_DAYTIME_WEATHER = dict(
         cloudiness=10.0, precipitation=0.0, precipitation_deposits=0.0,
         wind_intensity=5.0, sun_azimuth_angle=220.0, sun_altitude_angle=60.0,
         fog_density=0.0, fog_distance=0.0, fog_falloff=0.0, wetness=0.0,
     )
     ```
     then `carla.WeatherParameters(**CLEAR_DAYTIME_WEATHER)` inside
     `_set_clear_weather_sync`.
  3. `_ensure_vehicle_sync` MUST NOT call `world.set_weather`.
     Weather gating lives in `ensure_running` via the `_weather_set`
     flag.
  4. Verify by cold-starting the bridge and grepping logs:
     ```
     grep -c "Set .* weather" <log>   # must be exactly 1 per cold start
     ```

#### 3.1.3 Anti-patterns
  - Extracting a helper `_set_weather_if_needed` and calling it in
    both places. Still two call sites, still the same bug in spirit.
  - Leaving a commented-out copy "just in case".

---

### 3.2 Bug B2 — implicit state machine with 5 flags

#### 3.2.1 The five flags
  - `self._armed: bool`
  - `self._vehicle_id: int | None`
  - `self._camera_id: int | None`
  - `self._vehicle_ready_at_monotonic: float | None`
  - `self._weather_set: bool`

`ensure_running` reasons about combinations of these across ~80
lines. Any future edit is likely to leave an invalid combination
(e.g. camera_id set while vehicle_id is None).

#### 3.2.2 Required fix — explicit state machine

Add the enum (in this file or `src/session_state.py`):

```python
from enum import Enum, auto

class SessionState(Enum):
    IDLE              = auto()  # not armed; no managed actors
    ARMING            = auto()  # armed, waiting for CARLA runtime
    VEHICLE_PENDING   = auto()  # runtime ready, spawning/adopting vehicle
    CAMERA_PENDING    = auto()  # vehicle ready, delay before camera spawn
    READY             = auto()  # vehicle + camera live and healthy
    RECOVERING        = auto()  # managed actor disappeared; cleaning up
```

Rules:
  1. Exactly ONE place assigns to `self._state`. Helper methods like
     `_transition_to(new_state, *, reason: str)` centralize logging:
     ```python
     def _transition(self, new: SessionState, *, reason: str) -> None:
         if new is self._state:
             return
         logger.info("session %s -> %s (%s)", self._state.name, new.name, reason)
         self._state = new
     ```
  2. Every public method and internal branch in `ensure_running`
     queries `self._state` — not the 5 flag combinations.
  3. The flags REMAIN as backing storage (actor IDs, timing) but are
     no longer the source of truth for "what phase are we in."
  4. `snapshot()` output retains ALL existing keys (downstream routes
     depend on them; changing the snapshot shape is out of scope).
     ADD one key:
     ```python
     "state": self._state.name
     ```
  5. Illegal transitions (e.g. IDLE → READY) raise an internal
     invariant error; production code logs WARN and transitions to
     RECOVERING.

#### 3.2.3 Refactor safety net
Before changing code flow, write a small `tests/test_state_machine.py`
(or `tools/e2e/test_state_machine.py` if tests/ is gitignored) that
scripts the CURRENT snapshot sequence across:
  - Cold arm
  - First vehicle spawn
  - Camera spawn
  - Vehicle disappears
  - Camera disappears
  - External `reset(destroy_managed=False)`
  - External `reset(destroy_managed=True)`

Record the sequence of snapshot dicts. Then refactor; the same
sequence must produce the same dicts except for the new `state`
key. This is your refactor oracle.

---

### 3.3 Bug B3 — orphan adoption edge cases

`_adopt_orphan_managed_vehicle_sync` (~lines 397–482) handles the
standard case (find `role_name="bridge_ego"` vehicles, adopt
lowest-id, destroy duplicates). The following edge cases are
uncovered:

#### 3.3.1 Config drift between adopted camera and current defaults
Scenario: bridge v1 spawned a camera at 1280×720 fov=90. Bridge v2
has `DEFAULT_CAMERA_WIDTH=1920`, `DEFAULT_CAMERA_HEIGHT=1080`.
After adoption, the browser receives 720p frames indefinitely until
somebody respawns.

Required decision (pick one, justify):
  - **A)** Always respawn camera on adoption if attributes mismatch
    current defaults. Tolerates a brief (~CAMERA_ARM_DELAY) black
    frame window. Keeps config authoritative.
  - **B)** Keep the adopted camera as-is. Document that resolution
    changes require an explicit reset. Simpler, predictable.

Implement one. Write the rationale as a 3–5 line comment block on
the relevant function. Do not leave it ambiguous.

#### 3.3.2 Adopted vehicle in an invalid pose
Scenario: previous bridge crashed mid-teleport; vehicle ended up
under the map or inside geometry. Camera sees gray fog.

Required fix:
  - Check adopted vehicle's Z against map surface (use
    `world.get_map().get_waypoint(vehicle.location)` → `waypoint
    is None` or very far Z-delta).
  - If invalid, either (a) teleport to the first valid spawn point
    keeping same vehicle_id, or (b) destroy and respawn. Pick one,
    justify, implement. Option (a) preserves adoption guarantees;
    option (b) is simpler.

#### 3.3.3 External destroy of the managed vehicle
Scenario: user calls `/actors/destroy` via the UI on the managed
vehicle's id. Today `invalidate_actor` exists, but does it actually
fire?

Required verification + fix:
  - Trace the call path from the route through `CarlaClientManager`
    to `invalidate_actor`. Confirm with a scripted test.
  - If not fired, wire it up. The session manager must transition
    to RECOVERING within the next `ensure_running` tick and respawn.

#### 3.3.4 Concurrent `ensure_running` callers during reload
`self._lock` guards the body but `_runtime_ready_sync` check runs
outside the lock. Two overlapping callers might both pass the check
and then serialize on the lock — still correct? Trace through:

  - Caller 1 passes runtime check, acquires lock, spawns vehicle,
    releases lock. Caller 2 passes runtime check concurrently,
    waits on lock; on acquire, sees `self._vehicle_id is not None`
    and proceeds to camera branch. Safe.

If your trace shows a double-spawn path, add an in-lock re-check
of the condition. Either way, document the trace in your report.

#### 3.3.5 Multiple cameras attached to the primary vehicle
`_adopt_orphan_managed_vehicle_sync` sorts cameras by id and
adopts the lowest, destroying the rest. Confirm the sort order is
deterministic across CARLA restarts (actor IDs can be recycled).
If not, switch to selecting the one whose attributes best match
current defaults.

---

### 3.4 Bug B4 — public API coordination

Line 106 currently:
```python
if self._sensor_manager._adopt_existing_sensor(camera_id):
```

Agent A will rename the method to `adopt_existing_sensor`. Per the
cross-agent contract in §0.3, Agent A updates this line. If by the
time you start this task Agent A has already landed the rename,
the line will already read `adopt_existing_sensor` — leave it.

If Agent A has NOT landed it and you see the underscore variant,
leave it too and note it in your report. Do not update it
yourself.

---

## 4. Workflow (do them in this order)

### Step 1 — Baseline understanding
  - Read the full file.
  - Build the state-transition table in §2.
  - Write the refactor-safety-net test in §3.2.3. Run it on the
    CURRENT unmodified code to capture the baseline snapshot
    sequence.

### Step 2 — Weather deduplication (B1)
  - Extract `CLEAR_DAYTIME_WEATHER` constant.
  - Remove the inline copy in `_ensure_vehicle_sync`.
  - Rerun the safety-net test. Expect identical sequence (except
    perhaps one fewer log line).

### Step 3 — State machine introduction (B2), no behavior change
  - Add `SessionState` enum.
  - Add `self._state` initialized to `IDLE`.
  - Add `_transition` helper.
  - Map every flag assignment to a state transition AT THE SAME
    MOMENT (do not remove flags yet).
  - Rerun safety-net test. Expect identical sequence plus new
    `state` key.

### Step 4 — State machine becomes source of truth
  - Rewrite `ensure_running` control flow to branch on
    `self._state` instead of flag combinations.
  - Flags still update for backing data (ids, timestamps) but
    are no longer queried for phase.
  - Rerun safety-net test.

### Step 5 — Adoption edge cases (B3)
  - Address §3.3.1 through §3.3.5 one at a time, with a commit
    per case and a scripted test per case.

### Step 6 — Coordination crossover (B4)
  - When Agent A signals rename completion, verify line 106
    uses the public name. No edits from you.

### Step 7 — Final report.

---

## 5. Acceptance criteria — every one must cite concrete evidence

  [ ] Zero duplicated `WeatherParameters(...)` literals. Evidence:
      `grep -c WeatherParameters src/realtime_session.py` → 1.
  [ ] `SessionState` enum defined; `snapshot()` contains `"state"`
      key. Evidence: diff.
  [ ] Hot-reload stress test: `touch src/main.py` × 10 over 60 s.
      Assertions:
        - After each reload, within 10 s: `session_ready == true`.
        - At no point does the world contain more than 1 alive
          vehicle with `role_name="bridge_ego"`.
        - Total vehicle count delta (start vs end) ≤ 0.
      Evidence: per-iteration measurements as a CSV or table.
  [ ] Each §3.3 edge case has a test that reproduces the pre-fix
      failure and passes post-fix. Evidence: test file + run log.
  [ ] Refactor safety-net test passes on unmodified code and on
      final code, producing matching snapshot sequences
      (modulo the new `state` key).
  [ ] Coordination with Agent A recorded in the report.

---

## 6. Risks and limitations (you MUST enumerate yours)

In your final report, a section with at least THREE real risks
your refactor does NOT eliminate. Examples of acceptable entries:

  - "If CARLA recycles an actor id immediately after destruction,
    our adoption-by-lowest-id may adopt a non-managed actor."
  - "Weather state is only reset on cold arm; if the user changes
    weather mid-session and then triggers reset(False), the
    next arm will reapply clear weather without warning."
  - "`_lock` is asyncio-level; `_adopt_orphan_managed_vehicle_sync`
    runs inside `asyncio.to_thread`, so it does not hold the lock
    on the CARLA calls — two overlapping adoption attempts could
    race on the CARLA side even if the asyncio side is serialized."

"Unknown" is not acceptable in this section. If you cannot think of
three risks, you have not thought about it enough.

---

## 7. Report format

  1. Current state-transition table (§2).
  2. Bug-by-bug before/after table with file:line references.
  3. Post-refactor state machine diagram or table.
  4. Adoption edge-case matrix: case | decision | rationale |
     test result.
  5. Hot-reload stress test results (CSV + summary).
  6. Coordination log with Agent A.
  7. §6 risks and limitations.

Banned phrases: "works", "fine", "should be correct", "handles
edge cases properly", without evidence. See
`feedback_no_unreproducible` and the verification-honesty rules.
