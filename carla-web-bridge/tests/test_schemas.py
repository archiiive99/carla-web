"""Schema-level validation tests for the bridge's Pydantic models.

These live here (not inside test_routes) because they exercise the
validators directly — no TestClient / route plumbing needed.
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.models.schemas import (
    IgnoreRequest,
    LaneChangeRequest,
    LoadMapRequest,
    MapLayerRequest,
    SimulationSettings,
    StartRecordingRequest,
    StartReplayRequest,
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
