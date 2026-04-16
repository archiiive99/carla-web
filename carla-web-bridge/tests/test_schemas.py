"""Schema-level validation tests for the bridge's Pydantic models.

These live here (not inside test_routes) because they exercise the
validators directly — no TestClient / route plumbing needed.
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.models.schemas import (
    AutopilotRequest,
    GlobalSpeedRequest,
    IgnoreRequest,
    LaneChangeRequest,
    LightStateRequest,
    LoadMapRequest,
    MapLayerRequest,
    RouteRequest,
    SimulationSettings,
    SpawnSensorRequest,
    StartRecordingRequest,
    StartReplayRequest,
    Vector3,
    VehicleControl,
    VehicleSpeedRequest,
)


# --- Recording filename + map name validators ---------------------------


@pytest.mark.parametrize(
    "bad_name",
    [
        "",
        "../etc/passwd",
        "/absolute/path",
        "nested/subdir/file.log",
        "C:\\Windows\\System32\\config",
        "parent/..inner",
    ],
)
def test_start_recording_rejects_path_like_filenames(bad_name: str) -> None:
    with pytest.raises(ValidationError):
        StartRecordingRequest(filename=bad_name)


@pytest.mark.parametrize(
    "good_name",
    [
        "recording.log",
        "my_scenario_01.log",
        "take5",
    ],
)
def test_start_recording_accepts_basenames(good_name: str) -> None:
    assert StartRecordingRequest(filename=good_name).filename == good_name


def test_start_replay_uses_same_filename_rules() -> None:
    # Same validator as StartRecordingRequest — one sanity spot-check is
    # enough to confirm it's wired up.
    with pytest.raises(ValidationError):
        StartReplayRequest(filename="../escape.log")
    ok = StartReplayRequest(filename="scene.log")
    assert ok.filename == "scene.log"


@pytest.mark.parametrize(
    "bad_map",
    [
        "",
        "Town15/Sublevels/Buildings",
        "../templates/BaseMap",
        "..hidden",
    ],
)
def test_load_map_rejects_path_like_names(bad_map: str) -> None:
    with pytest.raises(ValidationError):
        LoadMapRequest(map_name=bad_map)


def test_load_map_accepts_basenames() -> None:
    assert LoadMapRequest(map_name="Town01_Opt").map_name == "Town01_Opt"
    assert LoadMapRequest(map_name="Town15").map_name == "Town15"


# --- Numeric bounds ------------------------------------------------------


@pytest.mark.parametrize(
    "bad_value",
    [0.0, -0.1, 1.5, 999.0],
)
def test_simulation_settings_rejects_out_of_range_fixed_delta(bad_value: float) -> None:
    with pytest.raises(ValidationError):
        SimulationSettings(fixed_delta=bad_value)


def test_simulation_settings_accepts_valid_fixed_delta() -> None:
    assert SimulationSettings(fixed_delta=0.05).fixed_delta == 0.05
    assert SimulationSettings(fixed_delta=1.0).fixed_delta == 1.0


@pytest.mark.parametrize(
    "bad_value",
    [-2.0, -1.5, 1.1, 5.0],
)
def test_lane_change_rejects_out_of_range_offset(bad_value: float) -> None:
    with pytest.raises(ValidationError):
        LaneChangeRequest(lane_offset=bad_value)


def test_lane_change_accepts_valid_offset() -> None:
    assert LaneChangeRequest(lane_offset=0.0).lane_offset == 0.0
    assert LaneChangeRequest(lane_offset=-1.0).lane_offset == -1.0
    assert LaneChangeRequest(lane_offset=1.0).lane_offset == 1.0


@pytest.mark.parametrize("field", ["lights", "signs", "walkers", "vehicles"])
@pytest.mark.parametrize("bad_value", [-1.0, 150.0, 1000.0])
def test_ignore_request_bounds_percentages(field: str, bad_value: float) -> None:
    with pytest.raises(ValidationError):
        IgnoreRequest(**{field: bad_value})


# --- MapLayerRequest action Literal --------------------------------------


@pytest.mark.parametrize(
    "bad_action",
    ["", "toggle", "LOAD", "Unload", "remove", "on", "off"],
)
def test_map_layer_rejects_unknown_action(bad_action: str) -> None:
    # Literal["load", "unload"] — schema trips 422 before the route ever
    # runs. Previously `action: str` accepted any value and the route
    # itself returned a custom 400; this pins the schema-level reject
    # so frontends get a consistent error shape.
    with pytest.raises(ValidationError):
        MapLayerRequest(layer="buildings", action=bad_action)


@pytest.mark.parametrize("good_action", ["load", "unload"])
def test_map_layer_accepts_load_and_unload(good_action: str) -> None:
    assert MapLayerRequest(layer="buildings", action=good_action).action == good_action


def test_map_layer_defaults_to_load_when_action_omitted() -> None:
    assert MapLayerRequest(layer="foliage").action == "load"


# --- VehicleControl bounds ------------------------------------------------


@pytest.mark.parametrize("bad", [-0.1, 1.1, 999.0, -999.0])
def test_vehicle_control_rejects_out_of_range_throttle(bad: float) -> None:
    # CARLA passes the raw float into PhysX without validating — a typoed
    # 999 from an external caller would destabilize the solver silently.
    # Schema bound catches it with a 422 before the route ever runs.
    with pytest.raises(ValidationError):
        VehicleControl(throttle=bad)


@pytest.mark.parametrize("bad", [-0.1, 1.1, 5.0])
def test_vehicle_control_rejects_out_of_range_brake(bad: float) -> None:
    with pytest.raises(ValidationError):
        VehicleControl(brake=bad)


@pytest.mark.parametrize("bad", [-1.1, 1.1, -5.0, 5.0])
def test_vehicle_control_rejects_out_of_range_steer(bad: float) -> None:
    with pytest.raises(ValidationError):
        VehicleControl(steer=bad)


def test_vehicle_control_accepts_canonical_values() -> None:
    ctrl = VehicleControl(throttle=0.5, steer=-0.3, brake=0.0)
    assert ctrl.throttle == 0.5
    assert ctrl.steer == -0.3
    assert ctrl.brake == 0.0
    # Endpoints are legal.
    assert VehicleControl(throttle=1.0).throttle == 1.0
    assert VehicleControl(steer=1.0).steer == 1.0
    assert VehicleControl(steer=-1.0).steer == -1.0
    assert VehicleControl(brake=1.0).brake == 1.0


# --- AutopilotRequest.tm_port bounds -------------------------------------


@pytest.mark.parametrize("bad_port", [0, -1, 65536, 100000, -100])
def test_autopilot_rejects_invalid_tm_port(bad_port: int) -> None:
    # tm_port is a TCP port — out-of-range trips 422 at the schema instead
    # of reaching CARLA and failing with an opaque RPC error.
    with pytest.raises(ValidationError):
        AutopilotRequest(tm_port=bad_port)


@pytest.mark.parametrize("good_port", [1, 8000, 65535])
def test_autopilot_accepts_valid_tm_port(good_port: int) -> None:
    assert AutopilotRequest(tm_port=good_port).tm_port == good_port


# --- LightStateRequest bounds --------------------------------------------


@pytest.mark.parametrize("bad_state", [-1, -100, 0xFFFFFFFF + 1])
def test_light_state_rejects_out_of_range(bad_state: int) -> None:
    with pytest.raises(ValidationError):
        LightStateRequest(light_state=bad_state)


def test_light_state_accepts_known_bitmask_values() -> None:
    # 0 = all off, 0xFF = Position+LowBeam+HighBeam+Brake+L/R Blinker+Reverse+Fog,
    # 0xFFFFFFFF = the "All" sentinel.
    assert LightStateRequest(light_state=0).light_state == 0
    assert LightStateRequest(light_state=0xFF).light_state == 0xFF
    assert LightStateRequest(light_state=0xFFFFFFFF).light_state == 0xFFFFFFFF


# --- SpawnSensorRequest.parent_id bounds ---------------------------------


@pytest.mark.parametrize("bad_parent", [-1, -100])
def test_spawn_sensor_rejects_negative_parent_id(bad_parent: int) -> None:
    # parent_id=0 means "attach to world" in CARLA. Negative ids would
    # otherwise reach sensor_manager and raise a deep "Parent actor -1
    # not found" — bound at schema for a clean 422.
    with pytest.raises(ValidationError):
        SpawnSensorRequest(type="sensor.camera.rgb", parent_id=bad_parent)


def test_spawn_sensor_accepts_zero_and_positive_parent_id() -> None:
    assert SpawnSensorRequest(type="sensor.camera.rgb", parent_id=0).parent_id == 0
    assert SpawnSensorRequest(type="sensor.camera.rgb", parent_id=42).parent_id == 42


# --- Traffic-manager speed-diff bounds -----------------------------------


@pytest.mark.parametrize("bad", [-101.0, -9999.0, 101.0, 9999.0])
def test_global_speed_rejects_out_of_range(bad: float) -> None:
    # tm.global_percentage_speed_difference accepts any percentage; CARLA
    # doesn't clip. Bound [-100, 100] is the operationally useful range —
    # beyond that values flip to negative speed targets that no caller
    # legitimately wants.
    with pytest.raises(ValidationError):
        GlobalSpeedRequest(speed_diff=bad)


@pytest.mark.parametrize("good", [-100.0, -50.0, 0.0, 50.0, 100.0])
def test_global_speed_accepts_percentage_range(good: float) -> None:
    assert GlobalSpeedRequest(speed_diff=good).speed_diff == good


@pytest.mark.parametrize("bad", [-101.0, 101.0, 500.0])
def test_vehicle_speed_rejects_out_of_range(bad: float) -> None:
    with pytest.raises(ValidationError):
        VehicleSpeedRequest(speed_diff=bad)


def test_vehicle_speed_accepts_percentage_range() -> None:
    assert VehicleSpeedRequest(speed_diff=-100.0).speed_diff == -100.0
    assert VehicleSpeedRequest(speed_diff=0.0).speed_diff == 0.0
    assert VehicleSpeedRequest(speed_diff=100.0).speed_diff == 100.0


# --- RouteRequest waypoints cap ------------------------------------------


def test_route_request_rejects_over_sized_waypoint_list() -> None:
    # 10,001 waypoints trips 422 before the route runs — a hostile caller
    # can't OOM the bridge by shipping 1M waypoints that then get converted
    # to carla.Location objects and passed to tm.set_path.
    huge = [Vector3(x=0, y=0, z=0) for _ in range(10_001)]
    with pytest.raises(ValidationError):
        RouteRequest(waypoints=huge)


def test_route_request_accepts_realistic_waypoint_counts() -> None:
    # A typical global-planner route has ≤ a few hundred waypoints. 5000
    # exercises the upper-half of the allowed range.
    small = [Vector3(x=float(i), y=0, z=0) for i in range(5)]
    big = [Vector3(x=float(i), y=0, z=0) for i in range(5_000)]
    assert len(RouteRequest(waypoints=small).waypoints) == 5
    assert len(RouteRequest(waypoints=big).waypoints) == 5_000
    # Edge: empty list is legal — tm.set_path([]) is the route-clear call.
    assert RouteRequest(waypoints=[]).waypoints == []


# --- StartReplayRequest bounds -------------------------------------------


@pytest.mark.parametrize("bad_duration", [-0.1, -1.0, -1000.0])
def test_start_replay_rejects_negative_duration(bad_duration: float) -> None:
    # 0 = "replay to end" per CARLA; negative makes no sense.
    with pytest.raises(ValidationError):
        StartReplayRequest(filename="x.log", duration=bad_duration)


@pytest.mark.parametrize("bad_camera", [-1, -42])
def test_start_replay_rejects_negative_camera_id(bad_camera: int) -> None:
    # camera_id=0 is the CARLA sentinel for "no follow"; actor IDs are
    # always non-negative, so a negative value is a typo.
    with pytest.raises(ValidationError):
        StartReplayRequest(filename="x.log", camera_id=bad_camera)


def test_start_replay_accepts_negative_start_time() -> None:
    # CARLA's replay_file treats negative start_time as "seconds from end"
    # — preserve that semantic by NOT bounding start_time.
    req = StartReplayRequest(filename="x.log", start_time=-5.0)
    assert req.start_time == -5.0


def test_start_replay_accepts_canonical_values() -> None:
    req = StartReplayRequest(
        filename="x.log", start_time=10.0, duration=30.0, camera_id=42
    )
    assert req.start_time == 10.0
    assert req.duration == 30.0
    assert req.camera_id == 42
