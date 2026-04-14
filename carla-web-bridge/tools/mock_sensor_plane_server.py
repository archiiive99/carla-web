"""Synthetic sensor-plane server for Agent A measurements.

This server exercises the owned data plane end-to-end without depending on a
live CARLA runtime. It mounts the production SensorManager and
WebSocketBroadcaster implementations under test, exposes a tiny subset of the
REST/WebSocket surface used by ``tools.load_test_sensor_plane``, and drives
fake camera/lidar callbacks from dedicated background threads.
"""

from __future__ import annotations

import argparse
import asyncio
import random
import sys
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from fastapi import FastAPI, WebSocket
import uvicorn


def _load_bridge_modules(module_root: str) -> tuple[Any, Any]:
    root = str(Path(module_root).resolve())
    if root not in sys.path:
        sys.path.insert(0, root)
    from src.sensor_manager import SensorManager  # type: ignore
    from src.ws_broadcaster import WebSocketBroadcaster  # type: ignore

    return SensorManager, WebSocketBroadcaster


class FakeActor:
    def __init__(self, actor_id: int, type_id: str, *, attributes: dict[str, str] | None = None) -> None:
        self.id = actor_id
        self.type_id = type_id
        self.attributes = attributes or {}
        self.is_alive = True

    def stop(self) -> None:
        self.is_alive = False

    def destroy(self) -> None:
        self.is_alive = False


class FakeCameraData:
    def __init__(self, width: int, height: int, frame: int, timestamp: float, raw_data: bytes) -> None:
        self.width = width
        self.height = height
        self.frame = frame
        self.timestamp = timestamp
        self.raw_data = raw_data


class FakeLidarData:
    def __init__(self, frame: int, timestamp: float, raw_data: bytes) -> None:
        self.frame = frame
        self.timestamp = timestamp
        self.raw_data = raw_data


class FakeSensor(FakeActor):
    def __init__(self, actor_id: int, type_id: str, attributes: dict[str, str]) -> None:
        super().__init__(actor_id, type_id, attributes=attributes)
        self._callback: Any = None
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._frame = 0
        self._interval = max(float(attributes.get("sensor_tick", "0.05")), 0.01)
        self._width = int(attributes.get("image_size_x", "640"))
        self._height = int(attributes.get("image_size_y", "360"))
        rng = random.Random(actor_id)
        self._camera_raw = rng.randbytes(self._width * self._height * 4)
        # 100k points/s @ 20Hz -> 5k points/frame -> 80 KB for lidar.
        points_per_second = int(attributes.get("points_per_second", "100000"))
        rotation_frequency = max(float(attributes.get("rotation_frequency", "20")), 1.0)
        point_count = max(1, int(points_per_second / rotation_frequency))
        channels_per_point = 6 if "semantic" in type_id else 4
        self._lidar_raw = bytes(point_count * channels_per_point * 4)

    def listen(self, callback: Any) -> None:
        self._callback = callback
        if self._thread is not None and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name=f"fake-sensor-{self.id}", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self.is_alive = False
        if self._thread is not None and self._thread.is_alive():
            self._thread.join(timeout=1.0)

    def destroy(self) -> None:
        self.stop()

    def _run(self) -> None:
        next_tick = time.perf_counter()
        while not self._stop.is_set():
            next_tick += self._interval
            if self._callback is not None:
                self._frame += 1
                ts = time.time()
                if "camera" in self.type_id:
                    data = FakeCameraData(
                        width=self._width,
                        height=self._height,
                        frame=self._frame,
                        timestamp=ts,
                        raw_data=self._camera_raw,
                    )
                else:
                    data = FakeLidarData(
                        frame=self._frame,
                        timestamp=ts,
                        raw_data=self._lidar_raw,
                    )
                self._callback(data)
            delay = next_tick - time.perf_counter()
            if delay > 0:
                time.sleep(delay)


class FakeCarlaManager:
    def __init__(self) -> None:
        self.actors: dict[int, FakeActor] = {}
        self._spawned_actor_ids: set[int] = set()

    def track_actor(self, actor_id: int) -> None:
        self._spawned_actor_ids.add(actor_id)

    def untrack_actor(self, actor_id: int) -> None:
        self._spawned_actor_ids.discard(actor_id)
        self.actors.pop(actor_id, None)

    def get_actor(self, actor_id: int) -> FakeActor | None:
        return self.actors.get(actor_id)


@dataclass(slots=True)
class MockState:
    next_id: int = 100

    def alloc(self) -> int:
        actor_id = self.next_id
        self.next_id += 1
        return actor_id


def _install_routes(app: FastAPI, state: MockState, carla_mgr: FakeCarlaManager, sensor_manager: Any, broadcaster: Any) -> None:
    @app.get("/health")
    async def health() -> dict[str, Any]:
        return {
            "status": "ok",
            "carla_connected": True,
            "ws_clients": broadcaster.client_count,
            "active_sensors": len(sensor_manager.get_sensor_ids()),
        }

    @app.get("/api/world/spawn-points")
    async def spawn_points() -> dict[str, Any]:
        return {
            "spawn_points": [
                {
                    "location": {"x": 0.0, "y": 0.0, "z": 0.3},
                    "rotation": {"pitch": 0.0, "yaw": 0.0, "roll": 0.0},
                }
            ]
        }

    @app.post("/api/actors/spawn/vehicle", status_code=201)
    async def spawn_vehicle(payload: dict[str, Any]) -> dict[str, Any]:
        actor_id = state.alloc()
        actor = FakeActor(actor_id, payload.get("blueprint", "vehicle.mock"))
        carla_mgr.actors[actor_id] = actor
        carla_mgr.track_actor(actor_id)
        return {"id": actor_id, "type": actor.type_id}

    @app.post("/api/actors/spawn/sensor", status_code=201)
    async def spawn_sensor(payload: dict[str, Any]) -> dict[str, Any]:
        actor_id = state.alloc()
        sensor_type = str(payload["type"])
        attributes = {k: str(v) for k, v in dict(payload.get("attributes", {})).items()}
        sensor = FakeSensor(actor_id, sensor_type, attributes)
        carla_mgr.actors[actor_id] = sensor
        sensor_manager._sensors[actor_id] = sensor  # noqa: SLF001
        sensor_manager._sensor_type_ids[actor_id] = sensor.type_id  # noqa: SLF001
        sensor_manager._subscriptions[actor_id] = set()  # noqa: SLF001
        sensor_manager._frame_counters[actor_id] = 0  # noqa: SLF001
        sensor_manager._native_fps[actor_id] = sensor_manager._extract_native_fps(sensor)  # noqa: SLF001
        sensor_manager._register_sensor_pipeline(actor_id, sensor.type_id)  # noqa: SLF001
        carla_mgr.track_actor(actor_id)
        return {"id": actor_id, "type": sensor_type, "parent_id": payload.get("parent_id")}

    @app.delete("/api/actors/{actor_id}")
    async def destroy_actor(actor_id: int) -> dict[str, Any]:
        actor = carla_mgr.actors.get(actor_id)
        if actor is None:
            return {"status": "missing", "id": actor_id}
        if actor.type_id.startswith("sensor."):
            await sensor_manager.destroy_sensor(actor_id)
        else:
            actor.destroy()
            carla_mgr.untrack_actor(actor_id)
        return {"status": "destroyed", "id": actor_id}

    @app.websocket("/ws")
    async def ws_endpoint(ws: WebSocket) -> None:
        def on_subscribe(sensor_id: int, client_id: str) -> None:
            sensor_manager.subscribe(sensor_id, client_id)

        def on_unsubscribe(sensor_id: int, client_id: str) -> None:
            sensor_manager.unsubscribe(sensor_id, client_id)

        def on_set_rate(sensor_id: int, client_id: str, target_fps: float) -> float:
            try:
                return float(sensor_manager.set_subscriber_rate(sensor_id, client_id, target_fps))
            except Exception:
                return target_fps

        await broadcaster.handle_connection(
            ws,
            on_subscribe=on_subscribe,
            on_unsubscribe=on_unsubscribe,
            on_set_rate=on_set_rate,
        )


def build_app(module_root: str) -> FastAPI:
    SensorManager, WebSocketBroadcaster = _load_bridge_modules(module_root)
    carla_mgr = FakeCarlaManager()
    broadcaster = WebSocketBroadcaster()
    sensor_manager = SensorManager(carla_mgr, broadcaster)

    app = FastAPI(title="Mock Sensor Plane")

    @app.on_event("startup")
    async def startup() -> None:
        sensor_manager.set_loop(asyncio.get_running_loop())

    @app.on_event("shutdown")
    async def shutdown() -> None:
        await sensor_manager.destroy_all()

    _install_routes(app, MockState(), carla_mgr, sensor_manager, broadcaster)
    return app


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--module-root", required=True, help="Bridge source root containing src/")
    args = parser.parse_args()

    app = build_app(args.module_root)
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
