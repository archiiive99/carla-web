"""Parity + edge case tests for RealtimeSessionManager.

These tests run without a live CARLA connection by stubbing the
CarlaClientManager and SensorManager surfaces that RealtimeSessionManager
touches. They are the parity oracle for the SessionState refactor (B2)
and cover the B3 adoption edge cases.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

import pytest

from src.config import (
    DEFAULT_CAMERA_FOV,
    DEFAULT_CAMERA_HEIGHT,
    DEFAULT_CAMERA_SENSOR_TICK,
    DEFAULT_CAMERA_WIDTH,
)
from src.realtime_session import (
    CLEAR_DAYTIME_WEATHER,
    MANAGED_ROLE_NAME,
    RealtimeSessionManager,
    SessionState,
)


# --- stubs -----------------------------------------------------------------


class _Loc:
    def __init__(self, x: float = 0.0, y: float = 0.0, z: float = 0.0) -> None:
        self.x, self.y, self.z = x, y, z


class _Rot:
    def __init__(self, pitch: float = 0.0, yaw: float = 0.0, roll: float = 0.0) -> None:
        self.pitch, self.yaw, self.roll = pitch, yaw, roll


class _Transform:
    def __init__(self, loc: _Loc | None = None, rot: _Rot | None = None) -> None:
        self.location = loc or _Loc()
        self.rotation = rot or _Rot()


class _Waypoint:
    def __init__(self, z: float = 0.0) -> None:
        self.transform = _Transform(_Loc(z=z))


class _StubMap:
    def __init__(self, waypoint_z: float = 0.0, *, waypoint_missing: bool = False) -> None:
        self._waypoint_z = waypoint_z
        self._waypoint_missing = waypoint_missing

    def get_spawn_points(self) -> list[_Transform]:
        return [_Transform()]

    def get_waypoint(self, location: _Loc) -> _Waypoint | None:
        if self._waypoint_missing:
            return None
        return _Waypoint(z=self._waypoint_z)


class _Actor:
    def __init__(
        self,
        actor_id: int,
        type_id: str = "vehicle.tesla.model3",
        role: str = MANAGED_ROLE_NAME,
        parent: "_Actor | None" = None,
        attributes: dict[str, str] | None = None,
        transform: _Transform | None = None,
    ) -> None:
        self.id = actor_id
        self.type_id = type_id
        self.is_alive = True
        self.parent = parent
        self.attributes = attributes if attributes is not None else {"role_name": role}
        self._transform = transform or _Transform()
        self.destroyed = False
        self.stopped = False

    def get_transform(self) -> _Transform:
        return self._transform

    def destroy(self) -> None:
        self.destroyed = True
        self.is_alive = False

    def stop(self) -> None:
        self.stopped = True


class _StubCarlaClient:
    def __init__(
        self,
        actors: list[_Actor] | None = None,
        *,
        carla_map: _StubMap | None = None,
    ) -> None:
        self._actors: dict[int, _Actor] = {a.id: a for a in (actors or [])}
        self.is_connected = True
        self.connected_uptime = 10.0
        self.tracked: set[int] = set()
        self._map = carla_map or _StubMap()

    def refresh_world(self) -> "_StubWorld":
        return _StubWorld(list(self._actors.values()), self._map)

    def get_actor(self, actor_id: int) -> _Actor | None:
        actor = self._actors.get(actor_id)
        if actor is None or not actor.is_alive:
            return None
        return actor

    def track_actor(self, actor_id: int) -> None:
        self.tracked.add(actor_id)

    def untrack_actor(self, actor_id: int) -> None:
        self.tracked.discard(actor_id)

    def remove_actor(self, actor_id: int) -> None:
        actor = self._actors.get(actor_id)
        if actor is not None:
            actor.is_alive = False


class _StubWorld:
    def __init__(self, actors: list[_Actor], carla_map: _StubMap) -> None:
        self._actors = actors
        self._map = carla_map
        self.weather = None

    def get_actors(self) -> list[_Actor]:
        return list(self._actors)

    def get_map(self) -> Any:
        return self._map

    def get_blueprint_library(self) -> Any:
        return {}

    def set_weather(self, weather: Any) -> None:
        self.weather = weather


class _StubSensorManager:
    def __init__(self) -> None:
        self.adopted: list[int] = []
        self.destroyed: list[int] = []
        self.spawned: list[tuple[str, int]] = []
        self.adopt_returns: bool = True
        self._next_spawn_id = 9999
        self._carla: _StubCarlaClient | None = None

    def bind_carla(self, carla_stub: "_StubCarlaClient") -> None:
        self._carla = carla_stub

    def adopt_existing_sensor(self, sensor_id: int) -> bool:
        self.adopted.append(sensor_id)
        return self.adopt_returns

    def _adopt_existing_sensor(self, sensor_id: int) -> bool:
        return self.adopt_existing_sensor(sensor_id)

    async def destroy_sensor(self, sensor_id: int) -> None:
        self.destroyed.append(sensor_id)
        if self._carla is not None:
            self._carla.remove_actor(sensor_id)

    async def spawn_sensor(
        self,
        sensor_type: str,
        transform: dict[str, Any],
        parent_id: int,
        attributes: dict[str, Any],
    ) -> int:
        sid = self._next_spawn_id
        self._next_spawn_id += 1
        self.spawned.append((sensor_type, parent_id))
        if self._carla is not None:
            parent = self._carla.get_actor(parent_id)
            self._carla._actors[sid] = _Actor(sid, type_id=sensor_type, parent=parent)
        return sid


# --- fixtures ---------------------------------------------------------------


@pytest.fixture
def carla_stub() -> _StubCarlaClient:
    return _StubCarlaClient()


@pytest.fixture
def sensor_stub() -> _StubSensorManager:
    return _StubSensorManager()


@pytest.fixture
def manager(carla_stub, sensor_stub) -> RealtimeSessionManager:
    sensor_stub.bind_carla(carla_stub)
    return RealtimeSessionManager(carla_stub, sensor_stub)


# --- B2 parity: snapshot() contract ----------------------------------------


def test_snapshot_fresh_idle(manager):
    snap = manager.snapshot()
    assert snap["default_vehicle_id"] is None
    assert snap["default_camera_id"] is None
    assert snap["session_armed"] is False
    assert snap["camera_arm_ready"] is False
    assert snap["session_ready"] is False
    assert snap["state"] == SessionState.IDLE.name


def test_snapshot_after_arm(manager):
    manager.arm()
    snap = manager.snapshot()
    assert snap["session_armed"] is True
    assert snap["session_ready"] is False
    assert snap["state"] == SessionState.ARMING.name


def test_snapshot_vehicle_only(manager):
    # Post single-source migration: no managed camera. A live vehicle is
    # sufficient for session_ready, independent of the camera_arm_ready delay.
    manager.arm()
    manager._transition(SessionState.VEHICLE_PENDING, reason="test fixture")
    manager._vehicle_id = 1001
    manager._vehicle_ready_at_monotonic = time.monotonic()
    snap = manager.snapshot()
    assert snap["default_vehicle_id"] == 1001
    assert snap["default_camera_id"] is None
    assert snap["camera_arm_ready"] is False  # delay not yet elapsed
    assert snap["session_ready"] is True
    assert snap["state"] == SessionState.VEHICLE_PENDING.name


def test_snapshot_ready(manager):
    manager.arm()
    manager._vehicle_id = 1001
    manager._camera_id = 2002
    manager._vehicle_ready_at_monotonic = time.monotonic() - 10.0
    manager._transition(SessionState.READY, reason="test fixture")
    snap = manager.snapshot()
    assert snap["default_vehicle_id"] == 1001
    assert snap["default_camera_id"] == 2002
    assert snap["camera_arm_ready"] is True
    assert snap["session_ready"] is True
    assert snap["state"] == SessionState.READY.name


@pytest.mark.asyncio
async def test_vehicle_disappearance_clears_session(manager, carla_stub):
    manager.arm()
    vehicle = _Actor(1001)
    camera = _Actor(2002, type_id="sensor.camera.rgb", parent=vehicle)
    carla_stub._actors[1001] = vehicle
    carla_stub._actors[2002] = camera
    manager._vehicle_id = 1001
    manager._camera_id = 2002
    manager._vehicle_ready_at_monotonic = time.monotonic()
    manager._transition(SessionState.READY, reason="test fixture")
    # vehicle disappears
    carla_stub.remove_actor(1001)
    async with manager._lock:
        await manager._reconcile_managed_actors_locked()
    snap = manager.snapshot()
    assert snap["default_vehicle_id"] is None
    assert snap["default_camera_id"] is None
    assert snap["session_armed"] is True  # still armed; session cleared
    assert snap["state"] == SessionState.ARMING.name


@pytest.mark.asyncio
async def test_camera_disappearance_is_ignored_by_session_manager(manager, carla_stub):
    # Post single-source migration: the bridge no longer owns a managed camera.
    # Pre-migration sessions that persisted a camera id must not cause the
    # session manager to drop READY when that lingering actor disappears —
    # the browser is rendering its own view and the vehicle is the only
    # actor whose health the manager tracks.
    manager.arm()
    vehicle = _Actor(1001)
    stale_camera = _Actor(2002, type_id="sensor.camera.rgb", parent=vehicle)
    carla_stub._actors[1001] = vehicle
    carla_stub._actors[2002] = stale_camera
    manager._vehicle_id = 1001
    manager._camera_id = 2002  # lingering pre-migration value
    manager._vehicle_ready_at_monotonic = time.monotonic() - 10.0
    manager._transition(SessionState.READY, reason="test fixture")
    carla_stub.remove_actor(2002)
    async with manager._lock:
        await manager._reconcile_managed_actors_locked()
    snap = manager.snapshot()
    assert snap["default_vehicle_id"] == 1001
    assert snap["state"] == SessionState.READY.name


@pytest.mark.asyncio
async def test_reset_transitions_to_idle(manager):
    manager.arm()
    manager._vehicle_id = 1001
    manager._camera_id = 2002
    manager._transition(SessionState.READY, reason="test fixture")
    await manager.reset()
    snap = manager.snapshot()
    assert snap["session_armed"] is False
    assert snap["default_vehicle_id"] is None
    assert snap["default_camera_id"] is None
    assert snap["state"] == SessionState.IDLE.name


# --- B3c: manual destroy invalidation --------------------------------------


@pytest.mark.asyncio
async def test_invalidate_actor_clears_matching_vehicle(manager):
    manager.arm()
    manager._vehicle_id = 1001
    manager._camera_id = 2002
    manager._transition(SessionState.READY, reason="test fixture")
    await manager.invalidate_actor(1001, reason="user destroyed vehicle")
    snap = manager.snapshot()
    assert snap["default_vehicle_id"] is None
    assert snap["default_camera_id"] is None
    assert snap["session_armed"] is True
    assert snap["state"] == SessionState.ARMING.name


@pytest.mark.asyncio
async def test_invalidate_actor_ignores_unrelated_id(manager):
    manager.arm()
    manager._vehicle_id = 1001
    manager._camera_id = 2002
    manager._transition(SessionState.READY, reason="test fixture")
    await manager.invalidate_actor(7777)
    snap = manager.snapshot()
    assert snap["default_vehicle_id"] == 1001
    assert snap["default_camera_id"] == 2002
    assert snap["state"] == SessionState.READY.name


# --- B3a: camera config drift on adoption ----------------------------------


def test_adopted_camera_with_drifted_config_is_rejected(manager, carla_stub, sensor_stub):
    vehicle = _Actor(1001)
    # Simulate a camera whose attributes differ from DEFAULT_CAMERA_* config.
    drifted_camera = _Actor(
        2002,
        type_id="sensor.camera.rgb",
        parent=vehicle,
        attributes={
            "image_size_x": "640",
            "image_size_y": "480",
            "fov": "90",
        },
    )
    carla_stub._actors[1001] = vehicle
    carla_stub._actors[2002] = drifted_camera
    result = manager._adopt_orphan_managed_vehicle_sync()
    assert result is None
    assert vehicle.destroyed is True
    assert drifted_camera.destroyed is True


# --- B3b: invalid pose handling --------------------------------------------


def test_adopted_vehicle_below_map_is_abandoned(manager, carla_stub):
    vehicle = _Actor(1001, transform=_Transform(_Loc(z=-50.0)))
    carla_stub._actors[1001] = vehicle
    result = manager._adopt_orphan_managed_vehicle_sync()
    # Abandon: adoption returns None, vehicle is destroyed to clean up.
    assert result is None
    assert vehicle.destroyed is True


def test_adopted_vehicle_without_waypoint_is_abandoned(sensor_stub):
    carla_stub = _StubCarlaClient(carla_map=_StubMap(waypoint_missing=True))
    sensor_stub.bind_carla(carla_stub)
    manager = RealtimeSessionManager(carla_stub, sensor_stub)
    vehicle = _Actor(1001, transform=_Transform(_Loc(z=1.0)))
    carla_stub._actors[1001] = vehicle
    result = manager._adopt_orphan_managed_vehicle_sync()
    assert result is None
    assert vehicle.destroyed is True


def test_adopted_vehicle_far_from_surface_is_abandoned(sensor_stub):
    carla_stub = _StubCarlaClient(carla_map=_StubMap(waypoint_z=0.0))
    sensor_stub.bind_carla(carla_stub)
    manager = RealtimeSessionManager(carla_stub, sensor_stub)
    vehicle = _Actor(1001, transform=_Transform(_Loc(z=25.0)))
    carla_stub._actors[1001] = vehicle
    result = manager._adopt_orphan_managed_vehicle_sync()
    assert result is None
    assert vehicle.destroyed is True


# --- B3.3.5: multiple cameras, deterministic selection --------------------


def test_adopt_prefers_lowest_id_config_matching_camera(manager, carla_stub):
    vehicle = _Actor(1001)
    matching_attrs = {
        "image_size_x": str(DEFAULT_CAMERA_WIDTH),
        "image_size_y": str(DEFAULT_CAMERA_HEIGHT),
        "fov": str(DEFAULT_CAMERA_FOV),
        "sensor_tick": str(DEFAULT_CAMERA_SENSOR_TICK),
    }
    cam_high = _Actor(3003, type_id="sensor.camera.rgb", parent=vehicle, attributes=dict(matching_attrs))
    cam_low = _Actor(2002, type_id="sensor.camera.rgb", parent=vehicle, attributes=dict(matching_attrs))
    carla_stub._actors.update({1001: vehicle, 2002: cam_low, 3003: cam_high})
    result = manager._adopt_orphan_managed_vehicle_sync()
    assert result is None
    assert vehicle.destroyed is True
    assert cam_high.destroyed is True
    assert cam_low.destroyed is True


def test_adopt_prefers_best_matching_camera_even_if_not_lowest_id(manager, carla_stub):
    vehicle = _Actor(1001)
    drifted = _Actor(2002, type_id="sensor.camera.rgb", parent=vehicle, attributes={"image_size_x": "640"})
    matching = _Actor(
        3003,
        type_id="sensor.camera.rgb",
        parent=vehicle,
        attributes={
            "image_size_x": str(DEFAULT_CAMERA_WIDTH),
            "image_size_y": str(DEFAULT_CAMERA_HEIGHT),
            "fov": str(DEFAULT_CAMERA_FOV),
            "sensor_tick": str(DEFAULT_CAMERA_SENSOR_TICK),
        },
    )
    carla_stub._actors.update({1001: vehicle, 2002: drifted, 3003: matching})
    result = manager._adopt_orphan_managed_vehicle_sync()
    assert result is None
    assert vehicle.destroyed is True
    assert drifted.destroyed is True
    assert matching.destroyed is True


def test_adopt_destroys_all_cameras_when_all_drift(manager, carla_stub):
    vehicle = _Actor(1001)
    drifted_a = _Actor(2002, type_id="sensor.camera.rgb", parent=vehicle, attributes={"image_size_x": "640"})
    drifted_b = _Actor(3003, type_id="sensor.camera.rgb", parent=vehicle, attributes={"image_size_x": "1024"})
    carla_stub._actors.update({1001: vehicle, 2002: drifted_a, 3003: drifted_b})
    result = manager._adopt_orphan_managed_vehicle_sync()
    assert result is None
    assert vehicle.destroyed is True
    assert drifted_a.destroyed is True
    assert drifted_b.destroyed is True


# --- module constants ------------------------------------------------------


def test_clear_daytime_weather_is_module_constant():
    # Spec §3.1.2: literal must live in exactly one place.
    assert CLEAR_DAYTIME_WEATHER["cloudiness"] == 10.0
    assert CLEAR_DAYTIME_WEATHER["precipitation"] == 0.0
    assert CLEAR_DAYTIME_WEATHER["sun_altitude_angle"] == 60.0


# --- recovery path ---------------------------------------------------------


@pytest.mark.asyncio
async def test_recovery_from_invalidate_returns_to_arming(manager):
    manager.arm()
    manager._vehicle_id = 1001
    manager._camera_id = 2002
    manager._transition(SessionState.READY, reason="test fixture")
    # invalidate the vehicle; clear -> RECOVERING -> ARMING (still armed)
    await manager.invalidate_actor(1001)
    assert manager._state is SessionState.ARMING
    # Subsequent reset brings us back to IDLE.
    await manager.reset()
    assert manager._state is SessionState.IDLE


# --- B3d: race on ensure_running -------------------------------------------


def test_illegal_transition_warns_and_forces_recovering(manager, caplog):
    import logging

    caplog.set_level(logging.WARNING)
    # IDLE -> READY is illegal (skips arm, spawn).
    manager._transition(SessionState.READY, reason="test illegal")
    assert manager._state is SessionState.RECOVERING
    assert any("illegal state transition IDLE -> READY" in r.message for r in caplog.records)


@pytest.mark.asyncio
async def test_concurrent_ensure_running_no_double_spawn(manager, carla_stub, sensor_stub):
    # Pre-existing vehicle: first caller sees it and only spawns camera; second
    # caller serializes on the lock, re-reads state, sees vehicle set, skips spawn.
    manager.arm()
    manager._vehicle_id = 1001
    manager._vehicle_ready_at_monotonic = time.monotonic() - 10.0
    manager._weather_set = True  # skip carla import in weather helper
    manager._transition(SessionState.VEHICLE_PENDING, reason="test fixture")
    carla_stub._actors[1001] = _Actor(1001)
    carla_stub.connected_uptime = 1000.0

    results = await asyncio.gather(
        manager.ensure_running(),
        manager.ensure_running(),
    )
    # Camera was spawned at most once total across both callers.
    assert len(sensor_stub.spawned) <= 1
    # Both callers see the same vehicle id (no respawn).
    for snap in results:
        assert snap["default_vehicle_id"] == 1001
