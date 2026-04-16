"""Default real-time CARLA session management."""

from __future__ import annotations

import asyncio
import logging
import time
from enum import Enum, auto
from typing import TYPE_CHECKING, Any

from src.config import (
    SESSION_ARM_DELAY_SECONDS,
    CAMERA_ARM_DELAY_SECONDS,
)

if TYPE_CHECKING:
    from src.carla_client import CarlaClientManager
    from src.sensor_manager import SensorManager

logger = logging.getLogger(__name__)

DEFAULT_VEHICLE_BLUEPRINTS = (
    "vehicle.tesla.model3",
    "vehicle.lincoln.mkz_2020",
    "vehicle.audi.a2",
)

MANAGED_ROLE_NAME = "bridge_ego"

CLEAR_DAYTIME_WEATHER = dict(
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


class SessionState(Enum):
    IDLE = auto()
    ARMING = auto()
    VEHICLE_PENDING = auto()
    READY = auto()
    RECOVERING = auto()


class SessionInvariantError(RuntimeError):
    """Raised when the explicit session state machine is violated."""


# Allowed transitions for the explicit session lifecycle. Illegal hops are
# treated as invariant violations and forced into RECOVERING by _transition().
# Post single-source migration the lifecycle is
# IDLE → ARMING → VEHICLE_PENDING → READY, with RECOVERING as the recovery hub.
_ALLOWED_TRANSITIONS: dict[SessionState, set[SessionState]] = {
    SessionState.IDLE: {SessionState.ARMING, SessionState.RECOVERING},
    SessionState.ARMING: {
        SessionState.VEHICLE_PENDING,
        SessionState.READY,
        SessionState.RECOVERING,
        SessionState.IDLE,
    },
    SessionState.VEHICLE_PENDING: {
        SessionState.READY,
        SessionState.RECOVERING,
    },
    SessionState.READY: {
        SessionState.RECOVERING,
        SessionState.ARMING,
        SessionState.IDLE,
    },
    SessionState.RECOVERING: {SessionState.ARMING, SessionState.IDLE, SessionState.RECOVERING},
}


class RealtimeSessionManager:
    """Maintains one default ego vehicle + RGB camera for browser streaming."""

    def __init__(self, carla_mgr: CarlaClientManager, sensor_manager: SensorManager) -> None:
        self._carla = carla_mgr
        self._sensor_manager = sensor_manager
        self._lock = asyncio.Lock()
        self._vehicle_id: int | None = None
        self._camera_id: int | None = None
        self._armed = False
        self._vehicle_ready_at_monotonic: float | None = None
        self._weather_set = False
        self._state: SessionState = SessionState.IDLE

    def _assert_transition_allowed(self, new_state: SessionState, *, reason: str) -> None:
        allowed = _ALLOWED_TRANSITIONS.get(self._state, set())
        if new_state not in allowed:
            raise SessionInvariantError(
                f"illegal state transition {self._state.name} -> {new_state.name} ({reason})"
            )

    def _transition(self, new_state: SessionState, *, reason: str) -> None:
        if new_state is self._state:
            return
        try:
            self._assert_transition_allowed(new_state, reason=reason)
        except SessionInvariantError as exc:
            logger.warning("%s; forcing RECOVERING", exc)
            new_state = SessionState.RECOVERING
            reason = f"invariant recovery: {reason}"
        logger.info("session state %s -> %s (%s)", self._state.name, new_state.name, reason)
        self._state = new_state

    def _camera_arm_ready(self) -> bool:
        return (
            self._vehicle_ready_at_monotonic is not None
            and (time.monotonic() - self._vehicle_ready_at_monotonic) >= CAMERA_ARM_DELAY_SECONDS
        )

    def _normalize_state_locked(self, *, reason: str) -> None:
        if not self._armed:
            if self._state is not SessionState.IDLE:
                self._transition(SessionState.IDLE, reason=f"{reason}: disarmed")
            return

        if self._state is SessionState.IDLE:
            self._transition(SessionState.ARMING, reason=f"{reason}: armed")
            return

        if self._state is SessionState.RECOVERING:
            self._transition(SessionState.ARMING, reason=f"{reason}: recovery complete")
            return

        if self._vehicle_id is None:
            if self._state is SessionState.READY:
                self._transition(SessionState.RECOVERING, reason=f"{reason}: READY missing vehicle")
                self._transition(SessionState.ARMING, reason=f"{reason}: recover missing vehicle")
            elif self._state is not SessionState.ARMING:
                self._transition(SessionState.VEHICLE_PENDING, reason=f"{reason}: vehicle missing")
            return

        # Post single-source migration: `default_camera_id` stays None.
        # Vehicle-present is sufficient for READY.
        if self._state is not SessionState.READY:
            self._transition(SessionState.READY, reason=f"{reason}: vehicle ready (no managed camera)")

    @property
    def default_vehicle_id(self) -> int | None:
        return self._vehicle_id

    @property
    def default_camera_id(self) -> int | None:
        return self._camera_id

    def snapshot(self) -> dict[str, Any]:
        return {
            "default_vehicle_id": self._vehicle_id,
            "default_camera_id": self._camera_id,
            "session_armed": self._armed,
            "camera_arm_ready": self._camera_arm_ready(),
            # Post single-source migration: camera is rendered client-side,
            # default_camera_id stays None. Session readiness now depends
            # only on a live managed vehicle.
            "session_ready": self._vehicle_id is not None,
            "state": self._state.name,
        }

    def arm(self) -> None:
        self._armed = True
        if self._state is SessionState.IDLE:
            self._transition(SessionState.ARMING, reason="arm() called")

    async def ensure_running(self) -> dict[str, Any]:
        """Ensure the default browser-facing CARLA session exists."""
        if not self._carla.is_connected:
            return self.snapshot()
        if self._state is SessionState.IDLE:
            return self.snapshot()
        if self._carla.connected_uptime < SESSION_ARM_DELAY_SECONDS:
            return self.snapshot()
        runtime_ready = await asyncio.to_thread(self._runtime_ready_sync)
        if not runtime_ready:
            return self.snapshot()

        async with self._lock:
            if not self._carla.is_connected:
                return self.snapshot()
            try:
                runtime_ready = await asyncio.to_thread(self._runtime_ready_sync)
                if not runtime_ready:
                    return self.snapshot()

                if not self._weather_set:
                    await asyncio.to_thread(self._set_clear_weather_sync)
                    self._weather_set = True

                await self._reconcile_managed_actors_locked()
                self._normalize_state_locked(reason="ensure_running")

                if self._state is SessionState.ARMING:
                    self._transition(SessionState.VEHICLE_PENDING, reason="runtime ready")

                if self._state is SessionState.VEHICLE_PENDING:
                    # Destroy any orphan managed vehicles from prior bridge
                    # runs before spawning fresh. The call is side-effectful
                    # (cleanup) but always returns None — re-adopting stale
                    # actors across reloads proved unreliable, see
                    # _adopt_orphan_managed_vehicle_sync docstring. The old
                    # `if adopted is not None` branch was dead.
                    await asyncio.to_thread(self._adopt_orphan_managed_vehicle_sync)

                    self._vehicle_id = await asyncio.to_thread(self._ensure_vehicle_sync)
                    self._vehicle_ready_at_monotonic = time.monotonic()
                    self._transition(SessionState.READY, reason="fresh vehicle spawned")
                    return self.snapshot()
            except Exception as exc:
                logger.warning("Managed session arm deferred: %s", exc)
                await self._clear_session_locked(
                    destroy_managed=False,
                    reason=f"arm deferred after error: {exc}",
                )
                return self.snapshot()

            return self.snapshot()

    async def reset(self, destroy_managed: bool = False, reason: str | None = None) -> None:
        async with self._lock:
            await self._clear_session_locked(
                destroy_managed=destroy_managed,
                reason=reason or "session reset",
            )
            self._armed = False
            self._weather_set = False
            self._transition(SessionState.IDLE, reason="reset()")

    async def invalidate_actor(self, actor_id: int, reason: str | None = None) -> None:
        async with self._lock:
            if actor_id not in {self._vehicle_id, self._camera_id}:
                return
            await self._clear_session_locked(
                destroy_managed=False,
                reason=reason or f"managed actor {actor_id} invalidated",
            )

    def _set_clear_weather_sync(self) -> None:
        """Set clear daytime weather for proper camera visibility."""
        import carla

        try:
            world = self._carla.refresh_world()
            world.set_weather(carla.WeatherParameters(**CLEAR_DAYTIME_WEATHER))
            logger.info("Set clear daytime weather")
        except Exception as exc:
            logger.warning("Failed to set weather: %s", exc)

    def _ensure_vehicle_sync(self) -> int:
        import carla

        world = self._carla.refresh_world()
        blueprint_library = world.get_blueprint_library()

        vehicle_bp = None
        for blueprint_id in DEFAULT_VEHICLE_BLUEPRINTS:
            try:
                vehicle_bp = blueprint_library.find(blueprint_id)
                if vehicle_bp is not None:
                    break
            except Exception:
                continue

        if vehicle_bp is None:
            candidates = blueprint_library.filter("vehicle.*")
            if not candidates:
                raise RuntimeError("No vehicle blueprint available for default session")
            vehicle_bp = candidates[0]

        # Tag as bridge-managed so we can adopt or clean up after a reload
        try:
            if vehicle_bp.has_attribute("role_name"):
                vehicle_bp.set_attribute("role_name", MANAGED_ROLE_NAME)
        except Exception as exc:
            logger.debug("Could not set role_name on managed vehicle: %s", exc)

        spawn_points = list(world.get_map().get_spawn_points())
        if not spawn_points:
            raise RuntimeError("Map does not expose any vehicle spawn point")

        vehicle = None
        for transform in spawn_points[:50]:
            vehicle = world.try_spawn_actor(vehicle_bp, transform)
            if vehicle is not None:
                break
        if vehicle is None:
            # Second pass: retry the first N points with a small z-lift in case
            # every candidate collided with ground-level residue.
            for sp in spawn_points[:50]:
                lifted = carla.Transform(
                    carla.Location(x=sp.location.x, y=sp.location.y, z=sp.location.z + 0.5),
                    sp.rotation,
                )
                vehicle = world.try_spawn_actor(vehicle_bp, lifted)
                if vehicle is not None:
                    break

        if vehicle is None:
            raise RuntimeError("Unable to spawn default ego vehicle")

        self._carla.track_actor(vehicle.id)
        try:
            vehicle.set_autopilot(True)
        except Exception as exc:
            logger.warning("Failed to enable autopilot on default vehicle %s: %s", vehicle.id, exc)

        logger.info("Default ego vehicle ready (id=%s, type=%s)", vehicle.id, vehicle.type_id)
        return int(vehicle.id)

    async def _reconcile_managed_actors_locked(self) -> None:
        if self._vehicle_id is not None:
            vehicle_alive = await asyncio.to_thread(self._actor_exists_sync, self._vehicle_id)
            if not vehicle_alive:
                derived_vehicle_id = await asyncio.to_thread(self._find_replacement_vehicle_sync)
                if derived_vehicle_id is not None:
                    logger.info(
                        "Recovered managed vehicle id from live world actors (%s -> %s)",
                        self._vehicle_id,
                        derived_vehicle_id,
                    )
                    self._vehicle_id = derived_vehicle_id
                else:
                    await self._clear_session_locked(
                        destroy_managed=False,
                        reason=f"default vehicle {self._vehicle_id} disappeared",
                    )
                    return

        # Post single-source migration: the bridge no longer owns a managed
        # camera. `_camera_id` stays None for fresh sessions; reconciliation
        # of any lingering pre-migration camera is handled by the normal
        # sensor lifecycle rather than this manager.

    async def _clear_session_locked(
        self,
        *,
        destroy_managed: bool,
        reason: str,
    ) -> None:
        self._transition(SessionState.RECOVERING, reason=f"clearing session: {reason}")
        old_vehicle_id = self._vehicle_id
        old_camera_id = self._camera_id
        self._vehicle_id = None
        self._camera_id = None
        self._vehicle_ready_at_monotonic = None

        if old_camera_id is not None:
            await self._sensor_manager.destroy_sensor(old_camera_id)
            self._carla.untrack_actor(old_camera_id)

        if destroy_managed and old_vehicle_id is not None:
            await asyncio.to_thread(self._destroy_vehicle_if_alive_sync, old_vehicle_id)

        if old_vehicle_id is not None:
            self._carla.untrack_actor(old_vehicle_id)

        logger.info(
            "Cleared managed real-time session (%s, vehicle=%s, camera=%s)",
            reason,
            old_vehicle_id,
            old_camera_id,
        )
        self._transition(
            SessionState.ARMING if self._armed else SessionState.IDLE,
            reason="post-clear: armed" if self._armed else "post-clear: not armed",
        )

    def _actor_exists_sync(self, actor_id: int) -> bool:
        try:
            actor = self._carla.get_actor(actor_id)
            return actor is not None and bool(getattr(actor, "is_alive", False))
        except Exception:
            return False

    def _find_replacement_vehicle_sync(self) -> int | None:
        try:
            world = self._carla.refresh_world()
            managed: list[Any] = []
            for actor in world.get_actors():
                if not getattr(actor, "is_alive", False):
                    continue
                type_id = getattr(actor, "type_id", "") or ""
                if not type_id.startswith("vehicle."):
                    continue
                attrs = getattr(actor, "attributes", None) or {}
                if attrs.get("role_name") == MANAGED_ROLE_NAME:
                    managed.append(actor)
            if not managed:
                return None
            managed.sort(key=lambda actor: int(actor.id))
            return int(managed[0].id)
        except Exception:
            return None

    def _adopt_orphan_managed_vehicle_sync(self) -> tuple[int, int | None] | None:
        """Destroy stale managed leftovers from prior bridge runs.

        Re-adopting a preserved `bridge_ego` actor across reloads has proven
        unreliable in practice: the actor can remain alive yet ignore throttle
        and never move even though control state updates appear successful.
        Rather than keep a potentially stale vehicle, we eagerly clean up any
        orphan managed vehicles/cameras and let `ensure_running()` respawn a
        fresh managed ego + camera pair.
        """
        try:
            world = self._carla.refresh_world()
            all_actors = list(world.get_actors())
        except Exception as exc:
            logger.debug("Could not query world for orphan adoption: %s", exc)
            return None

        managed_vehicles: list[Any] = []
        for actor in all_actors:
            try:
                if not getattr(actor, "is_alive", False):
                    continue
                type_id = getattr(actor, "type_id", "") or ""
                if not type_id.startswith("vehicle."):
                    continue
                attrs = getattr(actor, "attributes", None) or {}
                if attrs.get("role_name") == MANAGED_ROLE_NAME:
                    managed_vehicles.append(actor)
            except Exception:
                continue

        if not managed_vehicles:
            return None

        managed_vehicles.sort(key=lambda a: int(a.id))
        attached_cameras: dict[int, list[Any]] = {int(v.id): [] for v in managed_vehicles}
        for actor in all_actors:
            try:
                if not getattr(actor, "is_alive", False):
                    continue
                type_id = getattr(actor, "type_id", "") or ""
                if not type_id.startswith("sensor.camera."):
                    continue
                parent = getattr(actor, "parent", None)
                if parent is None:
                    continue
                pid = int(parent.id)
                if pid in attached_cameras:
                    attached_cameras[pid].append(actor)
            except Exception:
                continue

        stale_ids = [int(vehicle.id) for vehicle in managed_vehicles]
        logger.info("Destroying stale managed leftovers before fresh respawn: %s", stale_ids)
        self._destroy_all_managed(managed_vehicles, attached_cameras)
        return None

    def _destroy_all_managed(
        self,
        managed_vehicles: list[Any],
        attached_cameras: dict[int, list[Any]],
    ) -> None:
        for vehicle in managed_vehicles:
            vid = int(vehicle.id)
            for cam in attached_cameras.get(vid, []):
                try:
                    cam.stop()
                    cam.destroy()
                except Exception as exc:
                    logger.debug("Could not destroy managed camera: %s", exc)
            try:
                vehicle.destroy()
            except Exception as exc:
                logger.debug("Could not destroy managed vehicle %s: %s", vid, exc)

    def _runtime_ready_sync(self) -> bool:
        try:
            world = self._carla.refresh_world()
            world.get_map()
            world.get_blueprint_library()
            return True
        except Exception as exc:
            logger.debug("CARLA runtime not ready for managed session: %s", exc)
            return False

    def _destroy_vehicle_if_alive_sync(self, actor_id: int) -> None:
        actor = self._carla.get_actor(actor_id)
        if actor is None:
            return
        actor.destroy()
