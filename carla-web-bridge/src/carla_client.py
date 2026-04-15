"""CARLA server connection manager with auto-reconnect."""

from __future__ import annotations

import asyncio
import logging
import threading
import time
from typing import TYPE_CHECKING

from src.config import (
    CARLA_HOST,
    CARLA_PORT,
    CARLA_TIMEOUT,
    HEARTBEAT_INTERVAL,
    RECONNECT_STD_EXCEPTION_DELAY,
    RECONNECT_MAX_DELAY,
)

if TYPE_CHECKING:
    import carla

logger = logging.getLogger(__name__)


class CarlaClientManager:
    """Manages connection to the CARLA server with auto-reconnect."""

    def __init__(self) -> None:
        self._client: carla.Client | None = None
        self._world: carla.World | None = None
        self._connected = False
        self._spawned_actor_ids: set[int] = set()
        self._heartbeat_task: asyncio.Task | None = None
        self._should_run = False
        self._rpc_lock = threading.RLock()
        self._connected_at_monotonic: float | None = None

    @property
    def is_connected(self) -> bool:
        return self._connected

    @property
    def client(self) -> carla.Client:
        if self._client is None:
            raise RuntimeError("Not connected to CARLA server")
        return self._client

    @property
    def connected_uptime(self) -> float:
        if not self._connected or self._connected_at_monotonic is None:
            return 0.0
        return max(0.0, time.monotonic() - self._connected_at_monotonic)

    @property
    def world(self) -> carla.World:
        if self._world is None:
            raise RuntimeError("Not connected to CARLA server")
        return self._world

    def refresh_world(self) -> carla.World:
        if self._client is None:
            raise RuntimeError("Not connected to CARLA server")
        with self._rpc_lock:
            self._world = self._client.get_world()
            return self._world

    def get_world_snapshot(self) -> carla.WorldSnapshot:
        with self._rpc_lock:
            world = self.refresh_world()
            return world.get_snapshot()

    def get_actor(self, actor_id: int) -> carla.Actor | None:
        with self._rpc_lock:
            world = self.refresh_world()
            return world.get_actor(actor_id)

    def get_server_version(self) -> str:
        if self._client is None:
            raise RuntimeError("Not connected to CARLA server")
        with self._rpc_lock:
            return self._client.get_server_version()

    async def connect(self) -> None:
        self._should_run = True
        delay = 1.0
        while self._should_run:
            try:
                self._client, self._world = await asyncio.to_thread(
                    self._connect_sync
                )
                self._connected = True
                self._connected_at_monotonic = time.monotonic()
                # Force sync mode with a fixed 0.05s timestep. The bridge
                # drives physics via world.tick() in _world_tick_loop so the
                # simulation runs deterministically at 20 Hz regardless of
                # UE5's offscreen render rate.
                await asyncio.to_thread(self._ensure_sync_mode)
                logger.info(
                    "Connected to CARLA %s at %s:%d (sync mode forced)",
                    await asyncio.to_thread(self._client.get_server_version),
                    CARLA_HOST,
                    CARLA_PORT,
                )
                delay = 1.0
                # Cancel old heartbeat if any
                if self._heartbeat_task and not self._heartbeat_task.done():
                    self._heartbeat_task.cancel()
                self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())
                return
            except Exception as exc:
                message = str(exc)
                if "std::exception" in message:
                    delay = RECONNECT_STD_EXCEPTION_DELAY
                logger.warning(
                    "CARLA connection failed (%s). Retrying in %.0fs…",
                    exc,
                    delay,
                )
                if "std::exception" not in message:
                    delay = min(delay * 2, RECONNECT_MAX_DELAY)
                await asyncio.sleep(delay)

    async def disconnect(self) -> None:
        self._should_run = False
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            self._heartbeat_task = None

        # Hot reload / reconnect must not destroy live CARLA actors. Bridge-side
        # state is rebuilt from the simulator on the next connection.
        self._spawned_actor_ids.clear()

        self._connected = False
        self._connected_at_monotonic = None
        self._client = None
        self._world = None
        logger.info("Disconnected from CARLA")

    def track_actor(self, actor_id: int) -> None:
        self._spawned_actor_ids.add(actor_id)

    def untrack_actor(self, actor_id: int) -> None:
        self._spawned_actor_ids.discard(actor_id)

    def clear_tracked_actors(self) -> None:
        self._spawned_actor_ids.clear()

    @property
    def tracked_actor_ids(self) -> frozenset[int]:
        """Read-only snapshot of all actor IDs the bridge has spawned."""
        return frozenset(self._spawned_actor_ids)

    def get_traffic_manager(self, port: int = 8000) -> carla.TrafficManager:
        with self._rpc_lock:
            return self.client.get_trafficmanager(port)

    def _connect_sync(self) -> tuple[carla.Client, carla.World]:
        import carla as carla_module
        with self._rpc_lock:
            client = carla_module.Client(CARLA_HOST, CARLA_PORT)
            client.set_timeout(CARLA_TIMEOUT)
            world = client.get_world()
        return client, world

    def _ensure_sync_mode(self) -> None:
        """Force CARLA into synchronous mode with fixed timestep.

        The bridge drives the simulation via world.tick() in the tick loop.
        This guarantees deterministic physics at 20 FPS regardless of
        the UE5 render speed (which may be as low as 1-3 FPS offscreen).
        """
        with self._rpc_lock:
            world = self._client.get_world()
            settings = world.get_settings()
            settings.synchronous_mode = True
            settings.fixed_delta_seconds = 0.05  # 20 FPS physics
            settings.substepping = True
            settings.max_substep_delta_time = 0.01
            settings.max_substeps = 10
            world.apply_settings(settings)
            logger.info("Set CARLA to synchronous mode (fixed_delta=0.05, bridge-driven ticking)")

    async def _heartbeat_loop(self) -> None:
        while self._should_run:
            await asyncio.sleep(HEARTBEAT_INTERVAL)
            try:
                # Test connection + refresh world
                await asyncio.to_thread(self._heartbeat_sync)
            except Exception as exc:
                logger.error("CARLA heartbeat failed: %s", exc)
                self._connected = False
                if self._should_run:
                    logger.info("Attempting to reconnect…")
                    await self.connect()
                return

    def _heartbeat_sync(self) -> None:
        """Check connection is alive and refresh world reference."""
        with self._rpc_lock:
            self._client.get_server_version()
            self._world = self._client.get_world()


carla_manager = CarlaClientManager()
