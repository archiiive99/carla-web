"""Ordered lifecycle parity tests for RealtimeSessionManager."""

from __future__ import annotations

import time

import pytest

from src.realtime_session import RealtimeSessionManager, SessionState
from tests.test_realtime_session import _Actor, _StubCarlaClient, _StubSensorManager


def _vehicle_only_snapshot(snapshot: dict) -> dict:
    return {k: v for k, v in snapshot.items() if k != "state"}


@pytest.mark.asyncio
async def test_state_machine_snapshot_sequence() -> None:
    # Post single-source migration the manager no longer spawns or tracks a
    # camera, so the lifecycle collapses to: IDLE -> ARMING -> VEHICLE_PENDING
    # (inside ensure_running) -> READY, with camera disappearance a no-op.
    carla_stub = _StubCarlaClient()
    sensor_stub = _StubSensorManager()
    sensor_stub.bind_carla(carla_stub)
    manager = RealtimeSessionManager(carla_stub, sensor_stub)
    manager._weather_set = True

    vehicle_id = 1001

    def _spawn_vehicle() -> int:
        carla_stub._actors[vehicle_id] = _Actor(vehicle_id)
        return vehicle_id

    manager._ensure_vehicle_sync = _spawn_vehicle  # type: ignore[method-assign]

    manager.arm()
    after_arm = manager.snapshot()

    after_vehicle = await manager.ensure_running()

    carla_stub.remove_actor(vehicle_id)
    async with manager._lock:
        await manager._reconcile_managed_actors_locked()
    after_vehicle_disappears = manager.snapshot()

    # Simulate a session persisting a lingering pre-migration camera id.
    # The manager must not drop READY when that stale camera vanishes.
    manager._vehicle_id = 2002
    carla_stub._actors[2002] = _Actor(2002)
    manager._camera_id = 3003
    carla_stub._actors[3003] = _Actor(3003, type_id="sensor.camera.rgb", parent=carla_stub._actors[2002])
    manager._vehicle_ready_at_monotonic = time.monotonic() - 10.0
    manager._transition(SessionState.READY, reason="fixture camera disappearance")
    carla_stub.remove_actor(3003)
    async with manager._lock:
        await manager._reconcile_managed_actors_locked()
    after_camera_disappears = manager.snapshot()

    await manager.reset(destroy_managed=False, reason="test reset false")
    after_reset_false = manager.snapshot()

    manager.arm()
    manager._vehicle_id = 4004
    carla_stub._actors[4004] = _Actor(4004)
    manager._vehicle_ready_at_monotonic = time.monotonic() - 10.0
    manager._transition(SessionState.READY, reason="fixture reset true")
    await manager.reset(destroy_managed=True, reason="test reset true")
    after_reset_true = manager.snapshot()

    sequence = [
        after_arm,
        after_vehicle,
        after_vehicle_disappears,
        after_camera_disappears,
        after_reset_false,
        after_reset_true,
    ]

    expected_without_state = [
        {
            "default_vehicle_id": None,
            "default_camera_id": None,
            "session_armed": True,
            "camera_arm_ready": False,
            "session_ready": False,
        },
        {
            "default_vehicle_id": 1001,
            "default_camera_id": None,
            "session_armed": True,
            "camera_arm_ready": False,
            "session_ready": True,
        },
        {
            "default_vehicle_id": None,
            "default_camera_id": None,
            "session_armed": True,
            "camera_arm_ready": False,
            "session_ready": False,
        },
        {
            "default_vehicle_id": 2002,
            # Stale pre-migration camera id is intentionally not cleared by
            # the session manager — see `_reconcile_managed_actors_locked`.
            "default_camera_id": 3003,
            "session_armed": True,
            "camera_arm_ready": True,
            "session_ready": True,
        },
        {
            "default_vehicle_id": None,
            "default_camera_id": None,
            "session_armed": False,
            "camera_arm_ready": False,
            "session_ready": False,
        },
        {
            "default_vehicle_id": None,
            "default_camera_id": None,
            "session_armed": False,
            "camera_arm_ready": False,
            "session_ready": False,
        },
    ]
    expected_states = [
        SessionState.ARMING.name,
        SessionState.READY.name,
        SessionState.ARMING.name,
        SessionState.READY.name,
        SessionState.IDLE.name,
        SessionState.IDLE.name,
    ]

    assert [_vehicle_only_snapshot(snap) for snap in sequence] == expected_without_state
    assert [snap["state"] for snap in sequence] == expected_states
    assert carla_stub._actors[4004].destroyed is True
    # Camera is never spawned by the session manager post migration.
    assert sensor_stub.spawned == []


@pytest.mark.asyncio
async def test_invalidate_then_ensure_running_respawns_managed_vehicle() -> None:
    # Post single-source migration, ensure_running promotes straight from
    # VEHICLE_PENDING to READY after spawning a fresh ego — no intermediate
    # CAMERA_PENDING step and no managed camera id.
    carla_stub = _StubCarlaClient()
    sensor_stub = _StubSensorManager()
    sensor_stub.bind_carla(carla_stub)
    manager = RealtimeSessionManager(carla_stub, sensor_stub)
    manager._weather_set = True
    manager.arm()

    carla_stub._actors[1001] = _Actor(1001)
    manager._vehicle_id = 1001
    manager._vehicle_ready_at_monotonic = time.monotonic() - 10.0
    manager._transition(SessionState.READY, reason="fixture invalidation")

    carla_stub.remove_actor(1001)
    await manager.invalidate_actor(1001, reason="route destroyed managed vehicle")
    assert manager.snapshot()["state"] == SessionState.ARMING.name

    def _spawn_vehicle() -> int:
        carla_stub._actors[3003] = _Actor(3003)
        return 3003

    manager._ensure_vehicle_sync = _spawn_vehicle  # type: ignore[method-assign]
    after_respawn = await manager.ensure_running()
    assert after_respawn["default_vehicle_id"] == 3003
    assert after_respawn["default_camera_id"] is None
    assert after_respawn["state"] == SessionState.READY.name
    assert after_respawn["session_ready"] is True
    assert sensor_stub.spawned == []
