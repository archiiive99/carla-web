"""Pure-Python tests for Agent D adaptive-rate control."""
from __future__ import annotations

import asyncio
import unittest

from unittest.mock import patch

import src.sensor_manager as sensor_manager_module
from src.adaptive_rate import RateController
from src.sensor_manager import SensorManager


class _FakeCarla:
    def track_actor(self, _i): ...
    def untrack_actor(self, _i): ...
    def get_actor(self, _i):
        return None


class _FakeSensor:
    def __init__(self, sensor_tick: str = "0.05") -> None:
        self.attributes = {"sensor_tick": sensor_tick, "fov": "100", "image_size_x": "1280"}

    def listen(self, _cb): ...


class _Conn:
    def __init__(self, cid: str) -> None:
        self.client_id = cid
        self.last_stats: dict | None = None


class _FakeBcast:
    def __init__(self) -> None:
        self.clients: dict[str, _Conn] = {}
        self.frames: list[tuple[bytes, set[str] | None]] = []

    def get_clients(self):
        return dict(self.clients)

    async def broadcast_raw(self, data: bytes, target_clients=None):
        self.frames.append((data, None if target_clients is None else set(target_clients)))


class _FakeImageData:
    type_id = "sensor.camera.rgb"

    def __init__(self, frame: int, timestamp: float = 0.0) -> None:
        self.frame = frame
        self.timestamp = timestamp
        self.width = 2
        self.height = 1
        # 2 pixels, BGRA
        self.raw_data = bytes([0, 0, 255, 255, 0, 255, 0, 255])


class _ImmediateLoop:
    def call_soon_threadsafe(self, fn, *args):
        fn(*args)

    def create_task(self, coro):
        return asyncio.create_task(coro)


def _make_manager(native_fps: float = 20.0) -> tuple[SensorManager, _FakeBcast, int]:
    bcast = _FakeBcast()
    sm = SensorManager(_FakeCarla(), bcast)
    sid = 7
    sensor_tick = str(1.0 / native_fps)
    sm._sensors[sid] = _FakeSensor(sensor_tick=sensor_tick)         # noqa: SLF001
    sm._sensor_type_ids[sid] = "sensor.camera.rgb"                 # noqa: SLF001
    sm._subscriptions[sid] = set()                                  # noqa: SLF001
    sm._frame_counters[sid] = 0                                     # noqa: SLF001
    sm._native_fps[sid] = native_fps                                # noqa: SLF001
    sm._spawn_params[sid] = {                                       # noqa: SLF001
        "sensor_type": "sensor.camera.rgb",
        "transform": {},
        "parent_id": 0,
        "attributes": {"sensor_tick": sensor_tick, "fov": "100", "image_size_x": "1280"},
    }
    sm._loop = _ImmediateLoop()                                     # noqa: SLF001
    sm._sensor_queues[sid] = asyncio.Queue()                        # noqa: SLF001
    return sm, bcast, sid


class TestRateController(unittest.TestCase):
    def test_set_rate_clamps_to_native(self):
        controller = RateController()
        applied = controller.set_target_fps("c1", 5, 999.0, native_fps=20.0)
        self.assertEqual(applied, 20.0)
        state = controller.get_state("c1", 5)
        self.assertIsNotNone(state)
        self.assertEqual(state.target_fps, 20.0)
        self.assertEqual(state.effective_fps, 20.0)

    def test_should_send_uses_ratio_counter(self):
        controller = RateController()
        controller.set_target_fps("slow", 3, 10.0, native_fps=30.0)
        decisions = [controller.should_send("slow", 3, 30.0) for _ in range(9)]
        self.assertEqual(decisions, [False, False, True, False, False, True, False, False, True])

    def test_viewport_inactive_forces_heartbeat_then_restores(self):
        controller = RateController()
        controller.set_target_fps("c", 1, 20.0, native_fps=20.0, now_monotonic=0.0)
        controller.ingest_connection_stats(
            "c",
            {
                "ts_client_ms": 1,
                "viewport_active": False,
                "sensors": {"1": {"queue_backlog": 0, "decode_lag_ms": 0, "frames_dropped": 0, "frames_received": 20}},
            },
        )
        with patch("src.adaptive_rate.time.monotonic", return_value=1.0):
            controller.tick()
        self.assertEqual(controller.get_state("c", 1).effective_fps, 1.0)

        controller.ingest_connection_stats(
            "c",
            {
                "ts_client_ms": 2,
                "viewport_active": True,
                "sensors": {"1": {"queue_backlog": 0, "decode_lag_ms": 0, "frames_dropped": 0, "frames_received": 20}},
            },
        )
        with patch("src.adaptive_rate.time.monotonic", return_value=2.0):
            controller.tick()
        self.assertEqual(controller.get_state("c", 1).effective_fps, 20.0)

    def test_hysteresis_blocks_repeat_downgrade_within_two_seconds(self):
        controller = RateController()
        controller.set_target_fps("slow", 5, 20.0, native_fps=20.0, now_monotonic=0.0)
        controller.ingest_connection_stats(
            "slow",
            {
                "ts_client_ms": 1,
                "viewport_active": True,
                "sensors": {"5": {"queue_backlog": 5, "decode_lag_ms": 150, "frames_dropped": 0, "frames_received": 10}},
            },
        )
        with patch("src.adaptive_rate.time.monotonic", return_value=1.0):
            controller.tick()
        first = controller.get_state("slow", 5).effective_fps

        controller.ingest_connection_stats(
            "slow",
            {
                "ts_client_ms": 2,
                "viewport_active": True,
                "sensors": {"5": {"queue_backlog": 6, "decode_lag_ms": 180, "frames_dropped": 0, "frames_received": 10}},
            },
        )
        with patch("src.adaptive_rate.time.monotonic", return_value=2.0):
            controller.tick()
        self.assertEqual(controller.get_state("slow", 5).effective_fps, first)

        controller.ingest_connection_stats(
            "slow",
            {
                "ts_client_ms": 4,
                "viewport_active": True,
                "sensors": {"5": {"queue_backlog": 7, "decode_lag_ms": 180, "frames_dropped": 0, "frames_received": 10}},
            },
        )
        with patch("src.adaptive_rate.time.monotonic", return_value=4.1):
            controller.tick()
        self.assertLess(controller.get_state("slow", 5).effective_fps, first)

    def test_healthy_window_upgrades_after_cooldown(self):
        controller = RateController()
        controller.set_target_fps("c", 9, 20.0, native_fps=20.0, now_monotonic=0.0)
        state = controller.get_state("c", 9)
        state.effective_fps = 5.0
        state.last_adjust_time = 0.0
        for idx in range(5):
            controller.ingest_connection_stats(
                "c",
                {
                    "ts_client_ms": idx,
                    "viewport_active": True,
                    "sensors": {"9": {"queue_backlog": 0, "decode_lag_ms": 10, "frames_dropped": 0, "frames_received": 20}},
                },
            )
        with patch("src.adaptive_rate.time.monotonic", return_value=11.0):
            controller.tick()
        self.assertEqual(controller.get_state("c", 9).effective_fps, 6.25)


class TestSensorManagerAdaptiveIntegration(unittest.TestCase):
    def test_subscribe_uses_default_native_target(self):
        sm, _, sid = _make_manager(native_fps=20.0)
        sm.subscribe(sid, "c1")
        state = sm.rate_controller.get_state("c1", sid)
        self.assertIsNotNone(state)
        self.assertEqual(state.target_fps, 20.0)
        self.assertEqual(state.effective_fps, 20.0)

    def test_recreate_preserves_state_but_clamps_to_new_native(self):
        async def go() -> None:
            sm, _, sid = _make_manager(native_fps=20.0)
            sm.subscribe(sid, "c1")
            sm.set_subscriber_rate(sid, "c1", 18.0)
            state = sm.rate_controller.get_state("c1", sid)
            state.effective_fps = 12.0

            async def fake_spawn(stype, transform, parent_id, attrs):
                new_id = sid + 1000
                tick = str(attrs["sensor_tick"])
                sm._sensors[new_id] = _FakeSensor(sensor_tick=tick)                 # noqa: SLF001
                sm._sensor_type_ids[new_id] = stype                                 # noqa: SLF001
                sm._subscriptions[new_id] = set()                                   # noqa: SLF001
                sm._frame_counters[new_id] = 0                                      # noqa: SLF001
                sm._native_fps[new_id] = 10.0                                       # noqa: SLF001
                sm._spawn_params[new_id] = {                                        # noqa: SLF001
                    "sensor_type": stype,
                    "transform": transform,
                    "parent_id": parent_id,
                    "attributes": dict(attrs),
                }
                return new_id

            async def fake_destroy(sensor_id: int):
                sm._subscriptions.pop(sensor_id, None)                              # noqa: SLF001
                sm._sensors.pop(sensor_id, None)                                    # noqa: SLF001
                sm.rate_controller.clear_sensor(sensor_id)

            sm.spawn_sensor = fake_spawn    # type: ignore[method-assign]
            sm.destroy_sensor = fake_destroy  # type: ignore[method-assign]

            new_id, _ = await sm.recreate_sensor_with_attributes(sid, {"sensor_tick": "0.1"})
            restored = sm.rate_controller.get_state("c1", new_id)
            self.assertIsNotNone(restored)
            self.assertEqual(restored.target_fps, 18.0)
            self.assertEqual(restored.effective_fps, 10.0)

        asyncio.run(go())

    def test_worker_filters_subscribers_independently(self):
        async def go() -> None:
            sm, bcast, sid = _make_manager(native_fps=30.0)
            sm.subscribe(sid, "fast")
            sm.subscribe(sid, "slow")
            sm.set_subscriber_rate(sid, "fast", 30.0)
            sm.set_subscriber_rate(sid, "slow", 10.0)

            packet = sm._build_packet(sid, _FakeImageData(frame=1, timestamp=1.0), {"fast", "slow"})  # noqa: SLF001
            await sm._sensor_worker_once(packet)
            packet = sm._build_packet(sid, _FakeImageData(frame=2, timestamp=2.0), {"fast", "slow"})  # noqa: SLF001
            await sm._sensor_worker_once(packet)
            packet = sm._build_packet(sid, _FakeImageData(frame=3, timestamp=3.0), {"fast", "slow"})  # noqa: SLF001
            await sm._sensor_worker_once(packet)

            recipients = [targets for _, targets in bcast.frames]
            self.assertEqual(recipients[0], {"fast"})
            self.assertEqual(recipients[1], {"fast"})
            self.assertEqual(recipients[2], {"fast", "slow"})

        asyncio.run(go())

    def test_callback_path_ignores_global_frame_skip_for_opted_in_clients(self):
        async def go() -> None:
            sm, bcast, sid = _make_manager(native_fps=30.0)
            sm.subscribe(sid, "fast")
            sm.subscribe(sid, "slow")
            sm.set_subscriber_rate(sid, "fast", 30.0)
            sm.set_subscriber_rate(sid, "slow", 10.0)

            with patch.object(sensor_manager_module, "SENSOR_FRAME_SKIP", 2):
                for frame in range(1, 4):
                    sm._on_sensor_data(sid, _FakeImageData(frame=frame, timestamp=float(frame)))  # noqa: SLF001
                    queue = sm._sensor_queues[sid]  # noqa: SLF001
                    while not queue.empty():
                        packet = queue.get_nowait()
                        await sm._sensor_worker_once(packet)

            recipients = [targets for _, targets in bcast.frames]
            self.assertEqual(recipients, [{"fast"}, {"fast"}, {"fast", "slow"}])

        asyncio.run(go())


if __name__ == "__main__":
    unittest.main()
