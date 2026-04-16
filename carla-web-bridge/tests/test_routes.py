"""REST API endpoint tests (no CARLA connection required)."""

import sys
import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from src.main import app, sensor_manager
from src.ws.channels import Channel
from src.ws.protocol import decode_frame, encode_frame

client = TestClient(app)


class _FakeSensor:
    def __init__(self, sensor_tick: str = "0.05") -> None:
        self.attributes = {
            "sensor_tick": sensor_tick,
            "fov": "100",
            "image_size_x": "1280",
            "image_size_y": "720",
        }
        self.is_alive = True

    def listen(self, _cb): ...


def _install_sensor(sensor_id: int = 42, native_fps: float = 20.0) -> None:
    sensor_manager._sensors[sensor_id] = _FakeSensor(str(1.0 / native_fps))  # noqa: SLF001
    sensor_manager._sensor_type_ids[sensor_id] = "sensor.camera.rgb"          # noqa: SLF001
    sensor_manager._subscriptions[sensor_id] = set()                          # noqa: SLF001
    sensor_manager._frame_counters[sensor_id] = 0                             # noqa: SLF001
    sensor_manager._native_fps[sensor_id] = native_fps                        # noqa: SLF001
    sensor_manager._spawn_params[sensor_id] = {                               # noqa: SLF001
        "sensor_type": "sensor.camera.rgb",
        "transform": {},
        "parent_id": 0,
        "attributes": {
            "sensor_tick": str(1.0 / native_fps),
            "fov": "100",
            "image_size_x": "1280",
            "image_size_y": "720",
        },
    }


def _clear_sensor(sensor_id: int = 42) -> None:
    sensor_manager._subscriptions.pop(sensor_id, None)    # noqa: SLF001
    sensor_manager._sensors.pop(sensor_id, None)          # noqa: SLF001
    sensor_manager._sensor_type_ids.pop(sensor_id, None)  # noqa: SLF001
    sensor_manager._frame_counters.pop(sensor_id, None)   # noqa: SLF001
    sensor_manager._native_fps.pop(sensor_id, None)       # noqa: SLF001
    sensor_manager._spawn_params.pop(sensor_id, None)     # noqa: SLF001
    sensor_manager.rate_controller.clear_sensor(sensor_id)


def test_health_endpoint():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data
    assert data["status"] == "ok"
    assert "carla_connected" in data


def test_health_endpoint_ignores_dead_sensors():
    sensor_manager._sensors[999] = _FakeSensor()  # noqa: SLF001
    sensor_manager._sensors[999].is_alive = False  # noqa: SLF001
    try:
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert 999 not in sensor_manager._sensors  # noqa: SLF001
        assert data["active_sensors"] == len(sensor_manager.get_sensor_ids())
    finally:
        _clear_sensor(999)


def test_simulation_status_disconnected():
    resp = client.get("/api/simulation/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["connected"] is False


def test_simulation_status_does_not_leak_exception_into_server_version(monkeypatch):
    """My earlier fix (6de2e633f) stopped /api/simulation/status from
    packing str(exc) into the SimulationStatus.server_version field —
    that field is user-visible as the CARLA build label and stack traces
    showing up in "Server: TimeoutError(...)" was a confusing UI state.
    Pin behavior: any exception inside _get returns a clean connected=
    False with an empty server_version string."""
    import src.routes.simulation as sim_routes

    class _ExplodingWorld:
        def get_settings(self):
            raise RuntimeError("simulated carla rpc timeout")

    monkeypatch.setattr(
        sim_routes,
        "carla_manager",
        SimpleNamespace(
            is_connected=True,
            world=_ExplodingWorld(),
            server_version="0.10.0",
        ),
    )

    resp = client.get("/api/simulation/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["connected"] is False
    # Critical: the exception message must NOT surface in server_version.
    assert data["server_version"] == ""
    assert "timeout" not in (data.get("server_version") or "")
    assert "RuntimeError" not in (data.get("server_version") or "")


def test_simulation_play_requires_connection():
    resp = client.post("/api/simulation/play")
    assert resp.status_code == 503


def test_simulation_pause_requires_connection():
    resp = client.post("/api/simulation/pause")
    assert resp.status_code == 503


def test_simulation_step_requires_connection():
    resp = client.post("/api/simulation/step")
    assert resp.status_code == 503


def test_actors_list_requires_connection():
    resp = client.get("/api/actors")
    assert resp.status_code == 503


def test_weather_requires_connection():
    resp = client.get("/api/world/weather")
    assert resp.status_code == 503


def test_weather_presets_no_connection_needed():
    resp = client.get("/api/world/weather/presets")
    assert resp.status_code == 200
    data = resp.json()
    assert "presets" in data
    assert "ClearNoon" in data["presets"]


def test_set_weather_rejects_unknown_preset(monkeypatch):
    """Unknown weather presets must 400 with the allow-list in the detail,
    not silently fall through to the generic "Provide preset or params"."""
    import src.routes.world as world_routes

    monkeypatch.setattr(world_routes, "_require_connection", lambda: None)
    # The _set inner function does `import carla` before the preset check,
    # so a minimal stub is required even though our unknown-preset path
    # doesn't read any carla members.
    monkeypatch.setitem(sys.modules, "carla", SimpleNamespace(WeatherParameters=SimpleNamespace()))
    monkeypatch.setattr(
        world_routes,
        "carla_manager",
        SimpleNamespace(
            is_connected=True,
            world=SimpleNamespace(set_weather=lambda _w: None),
        ),
    )

    resp = client.post("/api/world/weather", json={"preset": "NotAPreset"})
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert "Unknown weather preset" in detail
    # Error message should list the valid presets so the user can see
    # what they meant to type.
    assert "ClearNoon" in detail


def test_sensor_types_no_connection_needed():
    resp = client.get("/api/sensors/types")
    assert resp.status_code == 200
    data = resp.json()
    assert "sensor_types" in data
    types = [s["type"] for s in data["sensor_types"]]
    assert "sensor.camera.rgb" in types
    assert "sensor.lidar.ray_cast" in types


def test_maps_requires_connection():
    resp = client.get("/api/world/maps")
    assert resp.status_code == 503


def test_should_skip_actor_filters_fixtures_and_scenery():
    """_should_skip_actor keeps interactable types (vehicle/walker/sensor/
    traffic_light) and drops CARLA map fixtures (traffic signs, static
    props) so /api/actors stays uncluttered."""
    from src.routes.actors import _should_skip_actor

    # Kept
    assert _should_skip_actor("vehicle.tesla.model3") is False
    assert _should_skip_actor("walker.pedestrian.0043") is False
    assert _should_skip_actor("sensor.camera.rgb") is False
    assert _should_skip_actor("traffic.traffic_light") is False
    assert _should_skip_actor("spectator") is False

    # Dropped — traffic signs
    assert _should_skip_actor("traffic.speed_limit.30") is True
    assert _should_skip_actor("traffic.stop") is True
    assert _should_skip_actor("traffic.yield") is True

    # Dropped — static scenery
    assert _should_skip_actor("static.prop.mesh") is True
    assert _should_skip_actor("static.prop.trashcan01") is True


def test_maps_filters_templates_and_town15_sublevels(monkeypatch):
    """The /api/world/maps endpoint skips CARLA-internal templates and
    Town15 streaming sublevels so the frontend dropdown only surfaces
    playable worlds."""
    import src.routes.world as world_routes

    fake_maps = [
        "/Game/Carla/Maps/Town01_Opt",
        "/Game/Carla/Maps/Town10HD_Opt",
        "/Game/Carla/Maps/Town15",
        "/Game/Carla/Maps/BaseMap",
        "/Game/Carla/Maps/DigitalTwinsTemplate",
        "/Game/Carla/Maps/MapGeneratorBaseMap",
        "/Game/Carla/Maps/Town15_Vegetation",
        "/Game/Carla/Maps/Town15_Buildings",
        "/Game/Carla/Maps/RiverPreset01",
        "/Game/Carla/Maps/LargeMap",
    ]

    monkeypatch.setattr(world_routes, "_require_connection", lambda: None)
    monkeypatch.setattr(
        world_routes,
        "carla_manager",
        SimpleNamespace(
            is_connected=True,
            client=SimpleNamespace(get_available_maps=lambda: fake_maps),
        ),
    )

    resp = client.get("/api/world/maps")
    assert resp.status_code == 200
    maps = resp.json()["maps"]

    # Playable maps kept
    assert "Town01_Opt" in maps
    assert "Town10HD_Opt" in maps
    assert "Town15" in maps
    assert "LargeMap" in maps
    # Templates skipped
    assert "BaseMap" not in maps
    assert "DigitalTwinsTemplate" not in maps
    assert "MapGeneratorBaseMap" not in maps
    assert "RiverPreset01" not in maps
    # Town15 streaming sublevels skipped, Town15 itself kept
    assert "Town15_Vegetation" not in maps
    assert "Town15_Buildings" not in maps


def test_get_spectator_returns_transform(monkeypatch):
    import src.routes.world as world_routes

    class _Spectator:
        def get_transform(self):
            return SimpleNamespace(
                location=SimpleNamespace(x=1.5, y=-2.0, z=3.25),
                rotation=SimpleNamespace(pitch=4.0, yaw=5.5, roll=-6.75),
            )

    class _World:
        def get_spectator(self):
            return _Spectator()

    monkeypatch.setattr(world_routes, "_require_connection", lambda: None)
    monkeypatch.setattr(
        world_routes,
        "carla_manager",
        SimpleNamespace(is_connected=True, world=_World()),
    )

    resp = client.get("/api/world/spectator")
    assert resp.status_code == 200
    assert resp.json() == {
        "transform": {
            "location": {"x": 1.5, "y": -2.0, "z": 3.25},
            "rotation": {"pitch": 4.0, "yaw": 5.5, "roll": -6.75},
        }
    }


def test_spawn_vehicle_requires_connection():
    resp = client.post(
        "/api/actors/spawn/vehicle",
        json={"blueprint": "vehicle.tesla.model3"},
    )
    assert resp.status_code == 503


def test_traffic_status_requires_connection():
    resp = client.get("/api/traffic/status")
    assert resp.status_code == 503


def _install_traffic_non_vehicle_stubs(monkeypatch) -> None:
    """Share the non-vehicle-actor fake across the four TM vehicle routes."""
    import src.routes.traffic as traffic_routes

    fake_manager = SimpleNamespace(
        is_connected=True,
        world=SimpleNamespace(
            get_actor=lambda _aid: SimpleNamespace(type_id="walker.pedestrian.0043")
        ),
        get_traffic_manager=lambda *_a, **_kw: (_ for _ in ()).throw(
            AssertionError("get_traffic_manager should be blocked before TM call")
        ),
    )
    monkeypatch.setattr(traffic_routes, "carla_manager", fake_manager)


def test_tm_set_speed_rejects_non_vehicle(monkeypatch):
    _install_traffic_non_vehicle_stubs(monkeypatch)
    resp = client.post("/api/traffic/vehicle/5/speed", json={"speed_diff": 10.0})
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Actor is not a vehicle"


def test_tm_set_lane_rejects_non_vehicle(monkeypatch):
    _install_traffic_non_vehicle_stubs(monkeypatch)
    resp = client.post(
        "/api/traffic/vehicle/5/lane",
        json={"auto_lane_change": True, "force_lane_change": False, "lane_offset": 0.0},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Actor is not a vehicle"


def test_tm_set_ignore_rejects_non_vehicle(monkeypatch):
    _install_traffic_non_vehicle_stubs(monkeypatch)
    resp = client.post("/api/traffic/vehicle/5/ignore", json={"lights": 0.0})
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Actor is not a vehicle"


def test_spawn_sensor_fails_loud_when_parent_gone(monkeypatch):
    """sensor_manager._spawn_sync raises RuntimeError (→ 400 via route)
    when the user's parent_id resolves to None — instead of silently
    spawning world-attached and echoing a stale parent_id."""
    import src.sensor_manager as sm_mod

    carla_stub = SimpleNamespace(Transform=lambda *_a, **_kw: None, Location=SimpleNamespace, Rotation=SimpleNamespace)

    class _BpLib:
        def find(self, type_id: str):
            return SimpleNamespace(
                has_attribute=lambda _k: False,
                set_attribute=lambda _k, _v: None,
            )

    class _World:
        def get_blueprint_library(self):
            return _BpLib()

    class _FakeCarlaMgr:
        is_connected = True
        def refresh_world(self):
            return _World()
        def get_actor(self, _aid: int):
            # Parent lookup returns None — this is the "parent destroyed
            # between the UI pick and this spawn" case the fix protects
            # against.
            return None
        def track_actor(self, _aid: int): ...
        def untrack_actor(self, _aid: int): ...

    # Build a manager bound to our stub so we can call _spawn_sync directly.
    from src.sensor_manager import SensorManager
    mgr = SensorManager(_FakeCarlaMgr(), broadcaster=SimpleNamespace())

    monkeypatch.setitem(sys.modules, "carla", carla_stub)

    with pytest.raises(RuntimeError) as exc:
        mgr._spawn_sync(  # noqa: SLF001
            "sensor.other.gnss",
            {"location": {"x": 0, "y": 0, "z": 0}, "rotation": {"pitch": 0, "yaw": 0, "roll": 0}},
            parent_id=99999,
            attributes={},
        )
    assert "Parent actor 99999 not found" in str(exc.value)
    # Ensure we didn't silently proceed: the string should flag the
    # user-facing cause so the toast is meaningful.
    assert "destroyed" in str(exc.value)


def test_blueprints_vehicles_requires_connection():
    resp = client.get("/api/blueprints/vehicles")
    assert resp.status_code == 503


def test_websocket_connect():
    with client.websocket_connect("/ws") as ws:
        # Connection should succeed
        ws.send_json({"action": "stats", "fps": 30, "processing_ms": 5})
        # Just test that it doesn't crash; no response expected for stats


def test_text_set_rate_ack():
    _install_sensor()
    try:
        with client.websocket_connect("/ws") as ws:
            ws.send_json({"action": "set_rate", "sensor_id": 42, "target_fps": 12})
            payload = ws.receive_json()
        assert payload["type"] == "rate_ack"
        assert payload["sensor_id"] == 42
        assert payload["target_fps"] == 12
    finally:
        _clear_sensor()


def test_binary_set_rate_ack():
    _install_sensor()
    try:
        with client.websocket_connect("/ws") as ws:
            frame = encode_frame(
                Channel.CONTROL,
                json.dumps({"action": "set_rate", "sensor_id": 42, "target_fps": 7}).encode("utf-8"),
            )
            ws.send_bytes(frame)
            response = ws.receive_bytes()
        channel, payload = decode_frame(response)
        assert channel == Channel.CONTROL
        parsed = json.loads(payload)
        assert parsed["type"] == "rate_ack"
        assert parsed["sensor_id"] == 42
        assert parsed["target_fps"] == 7
    finally:
        _clear_sensor()


def test_patch_sensor_attributes_rejects_unknown(monkeypatch):
    _install_sensor()
    import src.routes.sensors as sensors_routes

    monkeypatch.setattr(sensors_routes, "_require_connection", lambda: None)
    try:
        resp = client.patch("/api/sensors/42/attributes", json={"unknown_attr": "1"})
        assert resp.status_code == 400
        assert "Unknown sensor attribute" in resp.json()["detail"]
    finally:
        _clear_sensor()


def _install_destroy_guard_stubs(monkeypatch, type_id: str) -> list:
    """Shared stub harness for the destroy_actor CARLA-fixture guard.

    Returns the `events` sink so each caller can assert "no destroy
    reached the actor" after the 400 is issued. A live destroy()/
    invalidate() call would be a regression of the guard.
    """
    import src.main as main_mod
    import src.routes.actors as actors_routes

    events: list[tuple[str, object]] = []

    class _Actor:
        def __init__(self, tid: str) -> None:
            self.type_id = tid

        def destroy(self) -> None:
            events.append(("destroy", self.type_id))

    class _World:
        def get_actor(self, _aid: int):
            return _Actor(type_id)

    fake_manager = SimpleNamespace(
        is_connected=True,
        world=_World(),
        get_actor=lambda _aid: _Actor(type_id),
        untrack_actor=lambda _aid: events.append(("untrack", _aid)),
    )
    monkeypatch.setattr(actors_routes, "carla_manager", fake_manager)

    class _RealtimeSession:
        async def invalidate_actor(self, _aid: int, reason: str | None = None) -> None:
            events.append(("invalidate", _aid))

    monkeypatch.setattr(main_mod, "realtime_session", _RealtimeSession())
    return events


def test_destroy_actor_rejects_spectator(monkeypatch):
    events = _install_destroy_guard_stubs(monkeypatch, "spectator")
    resp = client.delete("/api/actors/1")
    assert resp.status_code == 400
    assert "CARLA map fixture" in resp.json()["detail"]
    assert events == []  # no destroy / invalidate slipped through


def test_destroy_actor_rejects_traffic_light(monkeypatch):
    events = _install_destroy_guard_stubs(monkeypatch, "traffic.traffic_light")
    resp = client.delete("/api/actors/58")
    assert resp.status_code == 400
    assert "CARLA map fixture" in resp.json()["detail"]
    assert events == []


def test_destroy_actor_rejects_traffic_sign(monkeypatch):
    events = _install_destroy_guard_stubs(monkeypatch, "traffic.speed_limit.30")
    resp = client.delete("/api/actors/77")
    assert resp.status_code == 400
    assert "CARLA map fixture" in resp.json()["detail"]
    assert events == []


def test_destroy_actor_calls_realtime_session_invalidate(monkeypatch):
    import src.main as main_mod
    import src.routes.actors as actors_routes

    events: list[tuple[str, int, str | None]] = []

    class _Actor:
        type_id = "vehicle.tesla.model3"

        def destroy(self):
            events.append(("destroy", 123, None))

    class _World:
        def get_actor(self, actor_id: int):
            assert actor_id == 123
            return _Actor()

    class _RealtimeSession:
        async def invalidate_actor(self, actor_id: int, reason: str | None = None):
            events.append(("invalidate", actor_id, reason))

    fake_manager = SimpleNamespace(
        is_connected=True,
        world=_World(),
        get_actor=lambda actor_id: _Actor(),
        untrack_actor=lambda actor_id: events.append(("untrack", actor_id, None)),
    )

    monkeypatch.setattr(actors_routes, "carla_manager", fake_manager)
    monkeypatch.setattr(main_mod, "realtime_session", _RealtimeSession())

    resp = client.delete("/api/actors/123")
    assert resp.status_code == 200
    assert resp.json() == {"status": "destroyed", "id": 123}
    assert ("destroy", 123, None) in events
    assert ("untrack", 123, None) in events
    assert ("invalidate", 123, "actor 123 destroyed") in events


def test_apply_control_disables_autopilot_before_vehicle_control(monkeypatch):
    import src.routes.actors as actors_routes

    events: list[tuple[str, object]] = []

    class _VehicleControl:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

    class _Actor:
        type_id = "vehicle.tesla.model3"

        def set_autopilot(self, enabled: bool):
            events.append(("autopilot", enabled))

        def apply_control(self, ctrl):
            events.append(("control", ctrl.kwargs))

    fake_manager = SimpleNamespace(
        is_connected=True,
        world=SimpleNamespace(get_actor=lambda actor_id: _Actor() if actor_id == 321 else None),
    )

    monkeypatch.setattr(actors_routes, "carla_manager", fake_manager)
    monkeypatch.setitem(sys.modules, "carla", SimpleNamespace(VehicleControl=_VehicleControl))

    resp = client.post(
        "/api/actors/321/control",
        json={
            "throttle": 0.7,
            "steer": -0.2,
            "brake": 0.0,
            "hand_brake": False,
            "reverse": False,
        },
    )

    assert resp.status_code == 200
    assert resp.json() == {"status": "control_applied", "id": 321}
    assert events == [
        ("autopilot", False),
        (
            "control",
            {
                "throttle": 0.7,
                "steer": -0.2,
                "brake": 0.0,
                "hand_brake": False,
                "reverse": False,
            },
        ),
    ]


def test_apply_control_rejects_non_vehicle_actor(monkeypatch):
    """apply_vehicle_control returns 400 when the target isn't a vehicle
    (pinned in test_control_helpers for the helper; this re-asserts the
    wiring through the route so a refactor doesn't silently drop it)."""
    import src.routes.actors as actors_routes

    fake_manager = SimpleNamespace(
        is_connected=True,
        world=SimpleNamespace(
            get_actor=lambda _aid: SimpleNamespace(type_id="walker.pedestrian.0043")
        ),
    )
    monkeypatch.setattr(actors_routes, "carla_manager", fake_manager)
    monkeypatch.setitem(
        sys.modules, "carla", SimpleNamespace(VehicleControl=lambda **kw: kw)
    )

    resp = client.post("/api/actors/5/control", json={"throttle": 0.5})
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Actor is not a vehicle"


def test_set_autopilot_rejects_non_vehicle_actor(monkeypatch):
    """set_autopilot inherits the same type guard added in commit
    8ae22fb8f — 400 instead of 500 when called on a walker/sensor."""
    import src.routes.actors as actors_routes

    fake_manager = SimpleNamespace(
        is_connected=True,
        world=SimpleNamespace(
            get_actor=lambda _aid: SimpleNamespace(
                type_id="walker.pedestrian.0043",
                set_autopilot=lambda *_a, **_kw: (_ for _ in ()).throw(
                    AssertionError("set_autopilot should be blocked before CARLA call")
                ),
            )
        ),
    )
    monkeypatch.setattr(actors_routes, "carla_manager", fake_manager)

    resp = client.post("/api/actors/5/autopilot", json={"enabled": True})
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Actor is not a vehicle"


def test_set_lights_rejects_non_vehicle_actor(monkeypatch):
    import src.routes.actors as actors_routes

    fake_manager = SimpleNamespace(
        is_connected=True,
        world=SimpleNamespace(
            get_actor=lambda _aid: SimpleNamespace(
                type_id="sensor.camera.rgb",
                set_light_state=lambda *_a, **_kw: (_ for _ in ()).throw(
                    AssertionError("set_light_state should be blocked before CARLA call")
                ),
            )
        ),
    )
    monkeypatch.setattr(actors_routes, "carla_manager", fake_manager)
    monkeypatch.setitem(
        sys.modules, "carla", SimpleNamespace(VehicleLightState=lambda x: x)
    )

    resp = client.post("/api/actors/5/lights", json={"light_state": 0})
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Actor is not a vehicle"


def test_get_actor_surfaces_runtime_error_as_400(monkeypatch):
    """VehicleDetails polls /api/actors/:id every 500ms. Without the try/except
    wrapper, a CARLA RuntimeError on a dying actor reference (transiently
    stale during a map reload) bubbled up as a bare 500 with no body and
    the frontend toast rendered as "Unknown error". Pin the 400-with-detail
    shape so the polling UI gets a real message."""
    import src.routes.actors as actors_routes

    def _raise(*_a, **_kw):
        raise RuntimeError("stale actor reference")

    fake_manager = SimpleNamespace(
        is_connected=True,
        world=SimpleNamespace(get_actor=_raise),
    )
    monkeypatch.setattr(actors_routes, "carla_manager", fake_manager)

    resp = client.get("/api/actors/5")
    assert resp.status_code == 400
    assert "stale actor reference" in resp.json()["detail"]


def test_start_recording_moves_duplicate_filename_to_front(monkeypatch):
    """Previously, starting a recording with a name already in history was a
    no-op for the history list — the re-used name stayed buried under newer
    entries. Overwrite semantics: the filename is the most-recently-used;
    surface it at the top of the dropdown so the user isn't confused when
    their "just-used" recording sits below older takes."""
    import src.routes.recording as rec_routes

    start_recorder_calls: list[str] = []

    fake_manager = SimpleNamespace(
        is_connected=True,
        client=SimpleNamespace(
            start_recorder=lambda fn: start_recorder_calls.append(fn),
        ),
    )
    monkeypatch.setattr(rec_routes, "carla_manager", fake_manager)
    # Reset history to a known state. The list is module-level so a leak from
    # another test would break this assert; seed it explicitly.
    monkeypatch.setattr(rec_routes, "_recording_history", ["older.log", "take1.log", "middle.log"])

    # Re-start recording with a filename already in the list.
    resp = client.post("/api/recording/start", json={"filename": "take1.log"})
    assert resp.status_code == 200
    assert start_recorder_calls == ["take1.log"]

    # take1.log moved to front; others keep their relative order. No duplicates.
    assert rec_routes._recording_history[0] == "take1.log"
    assert rec_routes._recording_history.count("take1.log") == 1
    assert rec_routes._recording_history == ["take1.log", "older.log", "middle.log"]
