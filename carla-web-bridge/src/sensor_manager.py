"""Sensor lifecycle management and data callbacks."""

from __future__ import annotations

import asyncio
import logging
import struct
import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from src.adaptive_rate import RateController
from src.config import (
    ADAPTIVE_MAX_FPS,
    JPEG_QUALITY,
    MAX_SENSORS,
    MIN_CLIENT_FPS,
    SENSOR_EVENT_QUEUE_WARN,
    SENSOR_FRAME_SKIP,
    SENSOR_QUEUE_MAX_CAMERA,
    SENSOR_QUEUE_MAX_COLLISION,
    SENSOR_QUEUE_MAX_DVS,
    SENSOR_QUEUE_MAX_GNSS,
    SENSOR_QUEUE_MAX_IMU,
    SENSOR_QUEUE_MAX_LANE_INVASION,
    SENSOR_QUEUE_MAX_LIDAR,
    SENSOR_QUEUE_MAX_RADAR,
    SENSOR_QUEUE_MAX_SEMANTIC_LIDAR,
)
from src.compression.image import image_compressor
from src.ws.channels import Channel
from src.ws.protocol import (
    encode_camera_payload,
    encode_frame,
    encode_gnss_payload,
    encode_imu_payload,
    encode_lidar_payload,
)

if TYPE_CHECKING:
    import carla

    from src.carla_client import CarlaClientManager
    from src.ws_broadcaster import WebSocketBroadcaster

logger = logging.getLogger(__name__)


# Sensor kind tags. Strings (not enum) to keep hot-path comparisons cheap
# and to avoid an extra import in the CARLA callback thread.
KIND_CAMERA = "camera"
KIND_LIDAR = "lidar"
KIND_SEMANTIC_LIDAR = "semantic_lidar"
KIND_RADAR = "radar"
KIND_IMU = "imu"
KIND_GNSS = "gnss"
KIND_COLLISION = "collision"
KIND_LANE_INVASION = "lane_invasion"
KIND_DVS = "dvs"

# Per-sensor-kind queue bounds (see config.py + Agent A spec §2.1.3).
_QUEUE_MAX_BY_KIND: dict[str, int] = {
    KIND_CAMERA: SENSOR_QUEUE_MAX_CAMERA,
    KIND_LIDAR: SENSOR_QUEUE_MAX_LIDAR,
    KIND_SEMANTIC_LIDAR: SENSOR_QUEUE_MAX_SEMANTIC_LIDAR,
    KIND_RADAR: SENSOR_QUEUE_MAX_RADAR,
    KIND_IMU: SENSOR_QUEUE_MAX_IMU,
    KIND_GNSS: SENSOR_QUEUE_MAX_GNSS,
    KIND_DVS: SENSOR_QUEUE_MAX_DVS,
    KIND_COLLISION: SENSOR_QUEUE_MAX_COLLISION,
    KIND_LANE_INVASION: SENSOR_QUEUE_MAX_LANE_INVASION,
}

# Event sensors must not drop (see spec §2.1.3 step 4). They start with a
# bounded queue and grow on overflow so discrete collision / lane-invasion
# events are retained instead of being dropped.
_EVENT_KINDS: frozenset[str] = frozenset({KIND_COLLISION, KIND_LANE_INVASION})


@dataclass(slots=True)
class SensorPacket:
    kind: str
    sensor_id: int
    channel: int
    frame: int
    timestamp: float
    subscribers: set[str]
    raw_data: bytes = b""
    width: int = 0
    height: int = 0
    accel: tuple[float, float, float] = (0.0, 0.0, 0.0)
    gyro: tuple[float, float, float] = (0.0, 0.0, 0.0)
    compass: float = 0.0
    lat: float = 0.0
    lon: float = 0.0
    alt: float = 0.0
    other_id: int = 0
    impulse: tuple[float, float, float] = (0.0, 0.0, 0.0)
    marking_types: tuple[int, ...] = field(default_factory=tuple)


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
        self._sensor_type_ids: dict[int, str] = {}
        self._subscriptions: dict[int, set[str]] = {}  # sensor_id -> client_ids
        self._frame_counters: dict[int, int] = {}
        self._sensor_queues: dict[int, asyncio.Queue[SensorPacket]] = {}
        self._sensor_tasks: dict[int, asyncio.Task] = {}
        self._listening: set[int] = set()
        self._loop: asyncio.AbstractEventLoop | None = None

        # D1/D2 control-plane state lives in adaptive_rate.py.
        self._rate_controller = RateController()
        self._native_fps: dict[int, float] = {}

        # D3: remember spawn parameters so we can re-spawn a sensor with
        # updated attributes (CARLA does not allow set_attribute on a live
        # sensor — sensor_tick & friends are baked at spawn time).
        self._spawn_params: dict[int, dict[str, Any]] = {}

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
        self._sensor_type_ids[sensor_id] = sensor.type_id
        self._subscriptions[sensor_id] = set()
        self._frame_counters[sensor_id] = 0
        self._native_fps[sensor_id] = self._extract_native_fps(sensor)
        self._spawn_params[sensor_id] = {
            "sensor_type": sensor_type,
            "transform": transform,
            "parent_id": parent_id,
            "attributes": dict(attributes),
        }
        self._carla.track_actor(sensor_id)
        self._register_sensor_pipeline(sensor_id, sensor.type_id)

        logger.info("Spawned sensor %s (id=%d)", sensor_type, sensor_id)
        return sensor_id

    async def destroy_sensor(self, sensor_id: int) -> None:
        task = self._sensor_tasks.pop(sensor_id, None)
        queue = self._sensor_queues.pop(sensor_id, None)
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        if queue is not None:
            while not queue.empty():
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    break
        sensor = self._sensors.pop(sensor_id, None)
        if sensor is None:
            return
        self._listening.discard(sensor_id)
        self._subscriptions.pop(sensor_id, None)
        self._sensor_type_ids.pop(sensor_id, None)
        self._frame_counters.pop(sensor_id, None)
        self._native_fps.pop(sensor_id, None)
        self._spawn_params.pop(sensor_id, None)
        self._rate_controller.clear_sensor(sensor_id)
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
        if sensor_id not in self._subscriptions and not self.adopt_existing_sensor(sensor_id):
            logger.warning("Subscribe ignored for unknown sensor %d", sensor_id)
            return
        self._subscriptions[sensor_id].add(client_id)
        self._rate_controller.ensure_state(
            client_id,
            sensor_id,
            native_fps=self.get_native_fps(sensor_id),
            default_target_fps=self._default_target_fps(sensor_id),
        )
        # Client-rendered sensors (RGB) have no encoder pipeline, so `.listen()`
        # would just keep the CARLA render target producing frames that nobody
        # consumes. Skip the listener for them; transform updates still flow
        # through the world-tick actor batch.
        type_id = self._sensor_type_ids.get(sensor_id, "")
        kind, _ = self._kind_for_type(type_id)
        if kind is None:
            return
        if sensor_id not in self._listening:
            self._start_listener(sensor_id)

    def unsubscribe(self, sensor_id: int, client_id: str) -> None:
        subs = self._subscriptions.get(sensor_id)
        if subs:
            subs.discard(client_id)
        self._rate_controller.clear_subscription(client_id, sensor_id)
        # When the last subscriber drops out, pause CARLA's frame
        # production. Without this, `sensor.listen()` stays installed
        # and the engine keeps generating render-target frames that go
        # into _sensor_queues and then get discarded by
        # _sensor_worker_once's active-subscribers short-circuit — real
        # GPU/CPU cost spent on data the bridge immediately throws away.
        # A later subscribe() re-installs the listener.
        if subs is not None and len(subs) == 0:
            self._stop_listener(sensor_id)

    # --- adaptive-rate control surface (D1/D2) -------------------------------

    @property
    def rate_controller(self) -> RateController:
        return self._rate_controller

    def set_subscriber_rate(
        self,
        sensor_id: int,
        client_id: str,
        target_fps: float,
        *,
        is_ceiling: bool = True,
    ) -> float:
        """Set per-(client, sensor) target fps. Returns the clamped value.

        ``is_ceiling`` is kept only for compatibility with the current
        ws-handler callsite and Agent A's in-flight branch; Agent D's
        controller keeps ``target_fps`` as the client-requested ceiling
        and tracks the adaptive current value separately as
        ``effective_fps``.
        """
        if sensor_id not in self._subscriptions:
            logger.warning("set_subscriber_rate ignored: unknown sensor %d", sensor_id)
            return 0.0
        return self._rate_controller.set_target_fps(
            client_id,
            sensor_id,
            float(target_fps),
            native_fps=self._native_fps.get(sensor_id) or ADAPTIVE_MAX_FPS,
        )

    def get_subscriber_rate(self, sensor_id: int, client_id: str) -> float | None:
        return self._rate_controller.get_target_fps(client_id, sensor_id)

    def get_native_fps(self, sensor_id: int) -> float:
        return self._native_fps.get(sensor_id) or ADAPTIVE_MAX_FPS

    def get_sensor_attributes(self, sensor_id: int) -> dict[str, str]:
        sensor = self._sensors.get(sensor_id)
        if sensor is None:
            raise KeyError(sensor_id)
        attrs = getattr(sensor, "attributes", None)
        if attrs is None:
            return {}
        return {str(key): str(value) for key, value in attrs.items()}

    async def recreate_sensor_with_attributes(
        self,
        sensor_id: int,
        attribute_overrides: dict[str, Any],
        on_announce: "Callable[[int, int, dict, set[str]], Awaitable[None]] | None" = None,
    ) -> tuple[int, dict[str, Any]]:
        """D3: destroy + respawn `sensor_id` with merged attributes.

        CARLA bakes attributes (sensor_tick, image_size_x, etc.) at spawn
        time — there is no live `set_attribute`. We respawn with the
        original blueprint + transform + parent, merging the requested
        overrides over the previous attribute set.

        Ordering (matters — see comment block):
          1. Snapshot subscriber state.
          2. Destroy old sensor (cancels worker, drains queue → no more
             frames from old id can land on a client).
          3. Spawn new sensor (creates queue + worker but NO listener
             yet — `_start_listener` is gated on `subscribe()`).
          4. `on_announce(old, new, attrs, subscribers)` — caller's hook
             to send the CONTROL frame BEFORE the new listener is armed,
             so clients always see the swap notice before any frame from
             the new sensor.
          5. Re-attach subscribers and per-(client, sensor) rate state.
             First subscribe arms the listener, frames begin flowing.

        Returns (new_sensor_id, snapshot_of_subscriber_state).
        """
        params = self._spawn_params.get(sensor_id)
        if params is None:
            raise KeyError(f"Sensor {sensor_id} has no recorded spawn params")

        # 1. Snapshot subscriber state *before* destroy() wipes it.
        old_subs = set(self._subscriptions.get(sensor_id, set()))
        old_targets = {
            cid: self._rate_controller.get_state(cid, sensor_id)
            for cid in old_subs
        }

        merged_attrs = dict(params["attributes"])
        merged_attrs.update(attribute_overrides)

        # 2. Destroy. 3. Spawn (listener stays dormant until subscribe).
        await self.destroy_sensor(sensor_id)
        new_id = await self.spawn_sensor(
            params["sensor_type"],
            params["transform"],
            params["parent_id"],
            merged_attrs,
        )

        # 4. Announce BEFORE arming listener so the control frame strictly
        # precedes any frame from the new sensor.
        if on_announce is not None:
            try:
                await on_announce(sensor_id, new_id, merged_attrs, set(old_subs))
            except Exception as exc:
                logger.warning("recreate announce hook failed: %s", exc)

        # 5. Re-attach subscribers. subscribe() arms the listener.
        for cid in old_subs:
            self.subscribe(new_id, cid)
            snapshot = old_targets.get(cid)
            if snapshot is not None:
                self._rate_controller.restore_state(
                    cid,
                    new_id,
                    snapshot,
                    native_fps=self.get_native_fps(new_id),
                )

        snapshot = {
            "old_sensor_id": sensor_id,
            "new_sensor_id": new_id,
            "subscribers": list(old_subs),
            "applied_attributes": merged_attrs,
        }
        logger.info(
            "Recreated sensor %d → %d with overrides=%s (subs=%d)",
            sensor_id, new_id, attribute_overrides, len(old_subs),
        )
        return new_id, snapshot

    LIVE_ADJUSTABLE_ATTRIBUTES: tuple[str, ...] = ()
    """Attributes CARLA supports adjusting on a live sensor.

    Empty for now: CARLA's PythonAPI exposes `Actor.attributes` as
    read-only after spawn. Every attribute change requires a recreate
    via `recreate_sensor_with_attributes`. Update this tuple if a
    future CARLA release exposes a true runtime setter.
    """

    def iter_subscriber_rates(self) -> list[tuple[str, int, float, float]]:
        """Snapshot of (client_id, sensor_id, target_fps, effective_fps)."""
        return self._rate_controller.iter_rates()

    def _drop_dead_sensor_ref(self, sensor_id: int) -> None:
        task = self._sensor_tasks.pop(sensor_id, None)
        if task is not None:
            task.cancel()
        self._sensor_queues.pop(sensor_id, None)
        self._sensors.pop(sensor_id, None)
        self._sensor_type_ids.pop(sensor_id, None)
        self._subscriptions.pop(sensor_id, None)
        self._frame_counters.pop(sensor_id, None)
        self._native_fps.pop(sensor_id, None)
        self._spawn_params.pop(sensor_id, None)
        self._listening.discard(sensor_id)
        self._rate_controller.clear_sensor(sensor_id)
        self._carla.untrack_actor(sensor_id)

    def prune_dead_sensors(self) -> list[int]:
        removed: list[int] = []
        for sensor_id, sensor in list(self._sensors.items()):
            if getattr(sensor, "is_alive", True):
                continue
            removed.append(sensor_id)
            self._drop_dead_sensor_ref(sensor_id)
        return removed

    def get_sensor_ids(self) -> list[int]:
        self.prune_dead_sensors()
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

        world = self._carla.refresh_world()
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

        parent = None
        if parent_id:
            try:
                parent = self._carla.get_actor(parent_id)
            except Exception as exc:
                logger.warning(
                    "Sensor %s parent lookup failed for actor %s: %s",
                    sensor_type,
                    parent_id,
                    exc,
                )
                parent = None
        if parent:
            return world.spawn_actor(bp, t, attach_to=parent)
        return world.spawn_actor(bp, t)

    def _destroy_sync(self, sensor: carla.Actor) -> None:
        sensor.stop()
        sensor.destroy()

    def _extract_native_fps(self, sensor: Any) -> float:
        """Best-effort native rate from a CARLA sensor actor.

        Reads `sensor_tick` (seconds per sample). Event-only sensors (collision,
        lane_invasion, obstacle) have no meaningful tick — we treat them as
        ADAPTIVE_MAX_FPS so per-subscriber gating never starves them.
        """
        try:
            tick_attr = sensor.attributes.get("sensor_tick") if hasattr(sensor, "attributes") else None
            if tick_attr is None:
                return ADAPTIVE_MAX_FPS
            tick = float(tick_attr)
            if tick <= 0:
                return ADAPTIVE_MAX_FPS
            return min(ADAPTIVE_MAX_FPS, 1.0 / tick)
        except (TypeError, ValueError, AttributeError):
            return ADAPTIVE_MAX_FPS

    def _default_target_fps(self, sensor_id: int) -> float:
        native_fps = self.get_native_fps(sensor_id)
        if SENSOR_FRAME_SKIP > 0:
            return max(MIN_CLIENT_FPS, native_fps / (SENSOR_FRAME_SKIP + 1))
        return native_fps

    def adopt_existing_sensor(self, sensor_id: int) -> bool:
        """Rehydrate a pre-existing CARLA sensor after bridge hot reload."""
        try:
            sensor = self._carla.get_actor(sensor_id)
        except Exception as exc:
            logger.warning("Could not adopt sensor %d: %s", sensor_id, exc)
            return False

        if sensor is None or not getattr(sensor, "is_alive", False):
            return False
        type_id = getattr(sensor, "type_id", "")
        if not type_id.startswith("sensor."):
            return False

        self._sensors[sensor_id] = sensor
        self._sensor_type_ids[sensor_id] = type_id
        self._subscriptions.setdefault(sensor_id, set())
        self._frame_counters.setdefault(sensor_id, 0)
        self._native_fps.setdefault(sensor_id, self._extract_native_fps(sensor))
        self._carla.track_actor(sensor_id)
        self._register_sensor_pipeline(sensor_id, type_id)

        logger.info("Adopted existing sensor %d (%s)", sensor_id, type_id)
        return True

    def _start_listener(self, sensor_id: int) -> None:
        sensor = self._sensors.get(sensor_id)
        if sensor is None or sensor_id in self._listening:
            return
        sensor.listen(lambda data, sid=sensor_id: self._on_sensor_data(sid, data))
        self._listening.add(sensor_id)
        logger.info("Started listener for sensor %d", sensor_id)

    def _stop_listener(self, sensor_id: int) -> None:
        """Pause frame production when no one is subscribed.

        subscribe() / _start_listener reinstalls the callback on the next
        viewer, so the sensor actor remains spawned — cheaper than
        destroy+respawn and preserves its CARLA id.
        """
        sensor = self._sensors.get(sensor_id)
        if sensor is None or sensor_id not in self._listening:
            return
        try:
            sensor.stop()
        except Exception as exc:
            logger.debug("sensor.stop() failed for %d: %s", sensor_id, exc)
        self._listening.discard(sensor_id)
        logger.info("Stopped listener for sensor %d (no subscribers)", sensor_id)

    # --- worker plumbing -----------------------------------------------------

    def _register_sensor_pipeline(self, sensor_id: int, type_id: str) -> None:
        """Idempotently create the per-sensor queue + worker task.

        One bounded queue and one async worker per sensor, uniform across
        all kinds. Camera and non-camera paths go through this helper so
        backpressure and drop policy are consistent. See spec §2.1.3.
        """
        if self._loop is None or sensor_id in self._sensor_queues:
            return
        kind, _ = self._kind_for_type(type_id)
        if kind is None:
            return
        maxsize = _QUEUE_MAX_BY_KIND[kind]
        queue: asyncio.Queue[SensorPacket] = asyncio.Queue(maxsize=maxsize)
        self._sensor_queues[sensor_id] = queue
        self._sensor_tasks[sensor_id] = self._loop.create_task(
            self._sensor_worker(sensor_id, queue)
        )

    async def _sensor_worker(
        self,
        sensor_id: int,
        queue: asyncio.Queue[SensorPacket],
    ) -> None:
        while True:
            packet = await queue.get()
            try:
                await self._sensor_worker_once(packet)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.error("Sensor %d worker error: %s", sensor_id, exc)

    async def _sensor_worker_once(self, packet: SensorPacket) -> None:
        # Compute the active-subscriber set BEFORE paying encode cost:
        # clients can unsubscribe between packet-build time (CARLA callback
        # thread) and worker-run time (main loop). If none of the packet's
        # original subscribers still want this sensor, or all fail the
        # per-client rate gate, skip the encode entirely — camera encode
        # is the dominant CPU cost on the hot path.
        native_fps = self._native_fps.get(packet.sensor_id)
        current_subs = self._subscriptions.get(packet.sensor_id, set())
        active_subscribers = {
            client_id
            for client_id in packet.subscribers
            if client_id in current_subs
            and self._rate_controller.should_send(
                client_id,
                packet.sensor_id,
                native_fps,
            )
        }
        if not active_subscribers:
            return
        payload = await asyncio.to_thread(self._encode_packet, packet)
        if not payload:
            return
        await self._broadcaster.broadcast_raw(payload, active_subscribers)

    # --- data callback -------------------------------------------------------

    def _on_sensor_data(self, sensor_id: int, data: Any) -> None:
        """Called on CARLA's internal thread. Extract a packet, then hand off."""
        self._frame_counters[sensor_id] = self._frame_counters.get(sensor_id, 0) + 1

        subs = self._subscriptions.get(sensor_id, set())
        if not subs or self._loop is None:
            return

        try:
            packet = self._build_packet(sensor_id, data, set(subs))
        except Exception as exc:
            logger.error("Sensor %d packet build error: %s", sensor_id, exc)
            return

        if packet is None:
            return

        self._loop.call_soon_threadsafe(self._enqueue_packet, sensor_id, packet)

    def _enqueue_packet(self, sensor_id: int, packet: SensorPacket) -> None:
        queue = self._sensor_queues.get(sensor_id)
        if queue is None:
            return

        if packet.kind in _EVENT_KINDS:
            # Event sensors must not drop. If a bounded queue fills, warn
            # and grow it before enqueuing the new event.
            if queue.full():
                new_maxsize = max(queue.maxsize * 2, queue.maxsize + 1)
                logger.warning(
                    "Event sensor %d (%s) queue full at %d; enlarging to %d",
                    sensor_id,
                    packet.kind,
                    queue.maxsize,
                    new_maxsize,
                )
                queue._maxsize = new_maxsize  # noqa: SLF001 - resize in-place to preserve waiter state
            queue.put_nowait(packet)
            depth = queue.qsize()
            if depth > SENSOR_EVENT_QUEUE_WARN:
                logger.warning(
                    "Event sensor %d (%s) queue depth=%d exceeds %d",
                    sensor_id,
                    packet.kind,
                    depth,
                    SENSOR_EVENT_QUEUE_WARN,
                )
            return

        # Regular drop-oldest policy for bounded streams.
        if queue.full():
            try:
                queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
        try:
            queue.put_nowait(packet)
        except asyncio.QueueFull:
            logger.debug(
                "Dropped %s packet for sensor %d", packet.kind, sensor_id
            )

    # --- packet build (CARLA thread) & encode (worker thread) ----------------

    def _kind_for_type(self, type_id: str) -> tuple[str | None, int]:
        # RGB is client-rendered from the shared world scene after the
        # single-source migration — the bridge no longer encodes/broadcasts
        # JPEG frames for it. The sensor actor is still spawned (transform
        # and lifecycle flow through CARLA as usual) but `_build_packet`
        # returns None for it, so no WS bytes leave the process.
        if "camera.rgb" in type_id:
            return None, 0
        if "camera.normals" in type_id:
            return KIND_CAMERA, Channel.CAMERA
        if "camera.depth" in type_id:
            return KIND_CAMERA, Channel.DEPTH
        if "camera.semantic_segmentation" in type_id or "camera.instance_segmentation" in type_id:
            return KIND_CAMERA, Channel.SEGMENTATION
        if "lidar.ray_cast_semantic" in type_id:
            return KIND_SEMANTIC_LIDAR, Channel.SEMANTIC_LIDAR
        if "lidar.ray_cast" in type_id:
            return KIND_LIDAR, Channel.LIDAR
        if "radar" in type_id:
            return KIND_RADAR, Channel.RADAR
        if "imu" in type_id:
            return KIND_IMU, Channel.IMU
        if "gnss" in type_id:
            return KIND_GNSS, Channel.GNSS
        if "collision" in type_id:
            return KIND_COLLISION, Channel.COLLISION
        if "lane_invasion" in type_id:
            return KIND_LANE_INVASION, Channel.LANE_INVASION
        if "dvs" in type_id:
            return KIND_DVS, Channel.DVS
        return None, 0

    def _build_packet(
        self, sensor_id: int, data: Any, subs: set[str]
    ) -> SensorPacket | None:
        """Build a SensorPacket from a live CARLA SensorData object.

        Runs on the CARLA callback thread, so only extract primitive fields
        (bytes, floats, ints). Any heavy CPU work belongs in the worker.
        """
        type_id = self._sensor_type_ids.get(sensor_id) or getattr(data, "type_id", "")
        kind, channel = self._kind_for_type(type_id)
        if kind is None:
            return None

        frame = int(getattr(data, "frame", 0))
        timestamp = float(getattr(data, "timestamp", time.time()))
        subscribers = set(subs)

        if kind == KIND_CAMERA:
            return SensorPacket(
                kind=kind,
                sensor_id=sensor_id,
                channel=channel,
                frame=frame,
                timestamp=timestamp,
                subscribers=subscribers,
                raw_data=bytes(data.raw_data),
                width=int(data.width),
                height=int(data.height),
            )
        if kind in (KIND_LIDAR, KIND_SEMANTIC_LIDAR, KIND_RADAR, KIND_DVS):
            return SensorPacket(
                kind=kind,
                sensor_id=sensor_id,
                channel=channel,
                frame=frame,
                timestamp=timestamp,
                subscribers=subscribers,
                raw_data=bytes(data.raw_data),
            )
        if kind == KIND_IMU:
            accel = data.accelerometer
            gyro = data.gyroscope
            return SensorPacket(
                kind=kind,
                sensor_id=sensor_id,
                channel=channel,
                frame=frame,
                timestamp=timestamp,
                subscribers=subscribers,
                accel=(float(accel.x), float(accel.y), float(accel.z)),
                gyro=(float(gyro.x), float(gyro.y), float(gyro.z)),
                compass=float(data.compass),
            )
        if kind == KIND_GNSS:
            return SensorPacket(
                kind=kind,
                sensor_id=sensor_id,
                channel=channel,
                frame=frame,
                timestamp=timestamp,
                subscribers=subscribers,
                lat=float(data.latitude),
                lon=float(data.longitude),
                alt=float(data.altitude),
            )
        if kind == KIND_COLLISION:
            other = data.other_actor
            other_id = int(other.id) if other is not None else 0
            impulse = data.normal_impulse
            return SensorPacket(
                kind=kind,
                sensor_id=sensor_id,
                channel=channel,
                frame=frame,
                timestamp=timestamp,
                subscribers=subscribers,
                other_id=other_id,
                impulse=(float(impulse.x), float(impulse.y), float(impulse.z)),
            )
        if kind == KIND_LANE_INVASION:
            marking_types = tuple(
                int(m.type) for m in data.crossed_lane_markings
            )
            return SensorPacket(
                kind=kind,
                sensor_id=sensor_id,
                channel=channel,
                frame=frame,
                timestamp=timestamp,
                subscribers=subscribers,
                marking_types=marking_types,
            )
        return None

    def _encode_packet(self, packet: SensorPacket) -> bytes | None:
        """Encode a SensorPacket into a wire frame. Runs in a worker thread."""
        kind = packet.kind
        if kind == KIND_CAMERA:
            return self._encode_camera_packet(packet)
        if kind in (KIND_LIDAR, KIND_SEMANTIC_LIDAR):
            channels_per_point = 4 if kind == KIND_LIDAR else 6
            point_count = len(packet.raw_data) // (channels_per_point * 4)
            payload = encode_lidar_payload(
                packet.sensor_id,
                point_count,
                packet.frame,
                packet.timestamp,
                packet.raw_data,
            )
            return encode_frame(packet.channel, payload)
        if kind == KIND_RADAR:
            count = len(packet.raw_data) // 16
            payload = (
                struct.pack(
                    "<IIId",
                    packet.sensor_id,
                    count,
                    packet.frame,
                    packet.timestamp,
                )
                + packet.raw_data
            )
            return encode_frame(Channel.RADAR, payload)
        if kind == KIND_IMU:
            payload = encode_imu_payload(
                packet.sensor_id,
                packet.frame,
                packet.timestamp,
                packet.accel,
                packet.gyro,
                packet.compass,
            )
            return encode_frame(Channel.IMU, payload)
        if kind == KIND_GNSS:
            payload = encode_gnss_payload(
                packet.sensor_id,
                packet.frame,
                packet.timestamp,
                packet.lat,
                packet.lon,
                packet.alt,
            )
            return encode_frame(Channel.GNSS, payload)
        if kind == KIND_COLLISION:
            payload = struct.pack(
                "<IIdI3f",
                packet.sensor_id,
                packet.frame,
                packet.timestamp,
                packet.other_id,
                packet.impulse[0],
                packet.impulse[1],
                packet.impulse[2],
            )
            return encode_frame(Channel.COLLISION, payload)
        if kind == KIND_LANE_INVASION:
            count = len(packet.marking_types)
            # Single pack call instead of a loop of `payload += struct.pack("<I", m)`
            # which was O(count) concat-allocations. marking_types is typically
            # small (1–4) but the old form still reallocated immutable bytes.
            payload = struct.pack(
                f"<IIdI{count}I",
                packet.sensor_id,
                packet.frame,
                packet.timestamp,
                count,
                *packet.marking_types,
            )
            return encode_frame(Channel.LANE_INVASION, payload)
        if kind == KIND_DVS:
            event_count = len(packet.raw_data) // 8
            payload = struct.pack(
                "<IIId",
                packet.sensor_id,
                event_count,
                packet.frame,
                packet.timestamp,
            )
            payload += packet.raw_data
            return encode_frame(Channel.DVS, payload)
        return None

    def _encode_camera_packet(self, packet: SensorPacket) -> bytes:
        if packet.channel == Channel.DEPTH:
            encoded = image_compressor.apply_depth_colormap(
                packet.raw_data,
                packet.width,
                packet.height,
            )
        elif packet.channel == Channel.SEGMENTATION:
            encoded = image_compressor.apply_segmentation_palette(
                packet.raw_data,
                packet.width,
                packet.height,
            )
        else:
            encoded = image_compressor.compress_bgra_to_jpeg(
                packet.raw_data,
                packet.width,
                packet.height,
                JPEG_QUALITY,
            )
        payload = encode_camera_payload(
            packet.sensor_id,
            packet.width,
            packet.height,
            packet.frame,
            packet.timestamp,
            encoded,
        )
        return encode_frame(packet.channel, payload)
