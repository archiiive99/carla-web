"""Sensor lifecycle management and data callbacks."""

from __future__ import annotations

import asyncio
import logging
import struct
import time
from typing import TYPE_CHECKING, Any

import numpy as np

from src.config import JPEG_QUALITY, MAX_SENSORS, SENSOR_FRAME_SKIP
from src.compression.image import image_compressor
from src.ws.channels import Channel

if TYPE_CHECKING:
    import carla

    from src.carla_client import CarlaClientManager
    from src.ws_broadcaster import WebSocketBroadcaster

logger = logging.getLogger(__name__)


class SensorManager:
    """Manages sensor spawning, destruction, callbacks, and subscriptions."""

    def __init__(
        self,
        carla_mgr: CarlaClientManager,
        broadcaster: WebSocketBroadcaster,
    ) -> None:
        self._carla = carla_mgr
        self._broadcaster = broadcaster
        self._sensors: dict[int, carla.Actor] = {}
        self._subscriptions: dict[int, set[str]] = {}  # sensor_id -> client_ids
        self._frame_counters: dict[int, int] = {}
        self._loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    # --- public API ----------------------------------------------------------

    async def spawn_sensor(
        self,
        sensor_type: str,
        transform: dict[str, Any],
        parent_id: int,
        attributes: dict[str, Any],
    ) -> int:
        if len(self._sensors) >= MAX_SENSORS:
            raise RuntimeError(f"Maximum sensors ({MAX_SENSORS}) reached")

        sensor = await asyncio.to_thread(
            self._spawn_sync, sensor_type, transform, parent_id, attributes
        )
        sensor_id = sensor.id
        self._sensors[sensor_id] = sensor
        self._subscriptions[sensor_id] = set()
        self._frame_counters[sensor_id] = 0
        self._carla.track_actor(sensor_id)

        sensor.listen(lambda data, sid=sensor_id: self._on_sensor_data(sid, data))
        logger.info("Spawned sensor %s (id=%d)", sensor_type, sensor_id)
        return sensor_id

    async def destroy_sensor(self, sensor_id: int) -> None:
        sensor = self._sensors.pop(sensor_id, None)
        if sensor is None:
            return
        self._subscriptions.pop(sensor_id, None)
        self._frame_counters.pop(sensor_id, None)
        try:
            await asyncio.to_thread(self._destroy_sync, sensor)
        except Exception as exc:
            logger.warning("Error destroying sensor %d: %s", sensor_id, exc)
        self._carla.untrack_actor(sensor_id)
        logger.info("Destroyed sensor %d", sensor_id)

    async def destroy_all(self) -> None:
        for sid in list(self._sensors):
            await self.destroy_sensor(sid)

    def subscribe(self, sensor_id: int, client_id: str) -> None:
        if sensor_id in self._subscriptions:
            self._subscriptions[sensor_id].add(client_id)

    def unsubscribe(self, sensor_id: int, client_id: str) -> None:
        subs = self._subscriptions.get(sensor_id)
        if subs:
            subs.discard(client_id)

    def unsubscribe_client(self, client_id: str) -> None:
        for subs in self._subscriptions.values():
            subs.discard(client_id)

    def get_sensor_ids(self) -> list[int]:
        return list(self._sensors.keys())

    # --- CARLA sync helpers --------------------------------------------------

    def _spawn_sync(
        self,
        sensor_type: str,
        transform: dict[str, Any],
        parent_id: int,
        attributes: dict[str, Any],
    ) -> carla.Actor:
        import carla as carla_mod

        world = self._carla.world
        bp_lib = world.get_blueprint_library()
        bp = bp_lib.find(sensor_type)
        for key, value in attributes.items():
            if bp.has_attribute(key):
                bp.set_attribute(key, str(value))

        loc = transform.get("location", {})
        rot = transform.get("rotation", {})
        t = carla_mod.Transform(
            carla_mod.Location(
                x=float(loc.get("x", 0)),
                y=float(loc.get("y", 0)),
                z=float(loc.get("z", 0)),
            ),
            carla_mod.Rotation(
                pitch=float(rot.get("pitch", 0)),
                yaw=float(rot.get("yaw", 0)),
                roll=float(rot.get("roll", 0)),
            ),
        )

        parent = world.get_actor(parent_id) if parent_id else None
        if parent:
            return world.spawn_actor(bp, t, attach_to=parent)
        return world.spawn_actor(bp, t)

    def _destroy_sync(self, sensor: carla.Actor) -> None:
        sensor.stop()
        sensor.destroy()

    # --- data callback -------------------------------------------------------

    def _on_sensor_data(self, sensor_id: int, data: Any) -> None:
        """Called on CARLA's internal thread. Dispatch to asyncio loop."""
        self._frame_counters[sensor_id] = self._frame_counters.get(sensor_id, 0) + 1
        frame_count = self._frame_counters[sensor_id]

        if SENSOR_FRAME_SKIP > 0 and frame_count % (SENSOR_FRAME_SKIP + 1) != 0:
            return

        subs = self._subscriptions.get(sensor_id, set())
        if not subs:
            return

        try:
            payload = self._process_sensor_data(sensor_id, data)
            if payload and self._loop:
                self._loop.call_soon_threadsafe(
                    asyncio.ensure_future,
                    self._broadcaster.broadcast_raw(payload, subs),
                )
        except Exception as exc:
            logger.error("Sensor %d processing error: %s", sensor_id, exc)

    def _process_sensor_data(self, sensor_id: int, data: Any) -> bytes | None:
        """Process raw CARLA sensor data into binary wire format."""
        type_id = getattr(data, "type_id", "") if hasattr(data, "type_id") else ""
        sensor = self._sensors.get(sensor_id)
        if sensor:
            type_id = sensor.type_id

        frame = getattr(data, "frame", 0)
        timestamp = getattr(data, "timestamp", time.time())

        if "camera.rgb" in type_id or "camera.normals" in type_id:
            return self._encode_camera(sensor_id, data, frame, timestamp, Channel.CAMERA)
        elif "camera.depth" in type_id:
            return self._encode_camera(sensor_id, data, frame, timestamp, Channel.DEPTH)
        elif "camera.semantic_segmentation" in type_id or "camera.instance_segmentation" in type_id:
            return self._encode_camera(sensor_id, data, frame, timestamp, Channel.SEGMENTATION)
        elif "lidar.ray_cast_semantic" in type_id:
            return self._encode_lidar(sensor_id, data, frame, timestamp, Channel.SEMANTIC_LIDAR)
        elif "lidar.ray_cast" in type_id:
            return self._encode_lidar(sensor_id, data, frame, timestamp, Channel.LIDAR)
        elif "radar" in type_id:
            return self._encode_radar(sensor_id, data, frame, timestamp)
        elif "imu" in type_id:
            return self._encode_imu(sensor_id, data, frame, timestamp)
        elif "gnss" in type_id:
            return self._encode_gnss(sensor_id, data, frame, timestamp)
        elif "collision" in type_id:
            return self._encode_collision(sensor_id, data, frame, timestamp)
        elif "lane_invasion" in type_id:
            return self._encode_lane_invasion(sensor_id, data, frame, timestamp)
        elif "dvs" in type_id:
            return self._encode_dvs(sensor_id, data, frame, timestamp)

        return None

    # --- encoders ------------------------------------------------------------

    def _encode_camera(
        self, sensor_id: int, data: Any, frame: int, ts: float, channel: int
    ) -> bytes:
        w, h = int(data.width), int(data.height)
        raw = bytes(data.raw_data)
        jpeg = image_compressor.compress_bgra_to_jpeg(raw, w, h, JPEG_QUALITY)
        header = struct.pack("<BIIIIId", channel, 4+4+4+4+8+len(jpeg), sensor_id, w, h, frame, ts)
        return header + jpeg

    def _encode_lidar(
        self, sensor_id: int, data: Any, frame: int, ts: float, channel: int
    ) -> bytes:
        raw = bytes(data.raw_data)
        channels_per_point = 4 if channel == Channel.LIDAR else 6
        point_count = len(raw) // (channels_per_point * 4)
        header = struct.pack(
            "<BIIIId", channel, 4+4+4+8+len(raw), sensor_id, point_count, frame, ts
        )
        return header + raw

    def _encode_radar(self, sensor_id: int, data: Any, frame: int, ts: float) -> bytes:
        raw = bytes(data.raw_data)
        count = len(raw) // 16
        header = struct.pack(
            "<BIIIId", Channel.RADAR, 4+4+4+8+len(raw), sensor_id, count, frame, ts
        )
        return header + raw

    def _encode_imu(self, sensor_id: int, data: Any, frame: int, ts: float) -> bytes:
        accel = data.accelerometer
        gyro = data.gyroscope
        compass = data.compass
        payload = struct.pack(
            "<IId3f3ff",
            sensor_id, frame, ts,
            accel.x, accel.y, accel.z,
            gyro.x, gyro.y, gyro.z,
            compass,
        )
        header = struct.pack("<BI", Channel.IMU, len(payload))
        return header + payload

    def _encode_gnss(self, sensor_id: int, data: Any, frame: int, ts: float) -> bytes:
        payload = struct.pack(
            "<IId3d", sensor_id, frame, ts,
            data.latitude, data.longitude, data.altitude,
        )
        header = struct.pack("<BI", Channel.GNSS, len(payload))
        return header + payload

    def _encode_collision(self, sensor_id: int, data: Any, frame: int, ts: float) -> bytes:
        other_id = data.other_actor.id if data.other_actor else 0
        impulse = data.normal_impulse
        payload = struct.pack(
            "<IIdI3f", sensor_id, frame, ts, other_id,
            impulse.x, impulse.y, impulse.z,
        )
        header = struct.pack("<BI", Channel.COLLISION, len(payload))
        return header + payload

    def _encode_lane_invasion(self, sensor_id: int, data: Any, frame: int, ts: float) -> bytes:
        markings = data.crossed_lane_markings
        count = len(markings)
        payload = struct.pack("<IIdI", sensor_id, frame, ts, count)
        for m in markings:
            payload += struct.pack("<I", int(m.type))
        header = struct.pack("<BI", Channel.LANE_INVASION, len(payload))
        return header + payload

    def _encode_dvs(self, sensor_id: int, data: Any, frame: int, ts: float) -> bytes:
        raw = bytes(data.raw_data)
        event_count = len(raw) // 8  # each event: x(u16), y(u16), t(i64/f64), pol(i8) varies
        payload = struct.pack("<IIId", sensor_id, event_count, frame, ts)
        payload += raw
        header = struct.pack("<BI", Channel.DVS, len(payload))
        return header + payload
