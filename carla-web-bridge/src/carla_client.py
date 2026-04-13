"""CARLA server connection manager with auto-reconnect."""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

from src.config import (
    CARLA_HOST,
    CARLA_PORT,
    CARLA_TIMEOUT,
    HEARTBEAT_INTERVAL,
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

    @property
    def is_connected(self) -> bool:
        return self._connected

    @property
    def client(self) -> carla.Client:
        if self._client is None:
            raise RuntimeError("Not connected to CARLA server")
        return self._client

    @property
    def world(self) -> carla.World:
        if self._world is None:
            raise RuntimeError("Not connected to CARLA server")
        # Refresh world reference each time — handles map reloads
        try:
            self._world = self._client.get_world()
        except Exception:
            pass
        return self._world

    async def connect(self) -> None:
        self._should_run = True
        delay = 1.0
        while self._should_run:
            try:
                self._client, self._world = await asyncio.to_thread(
                    self._connect_sync
                )
                self._connected = True
                logger.info(
                    "Connected to CARLA %s at %s:%d",
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
                logger.warning(
                    "CARLA connection failed (%s). Retrying in %.0fs…",
                    exc,
                    delay,
                )
                delay = min(delay * 2, RECONNECT_MAX_DELAY)
                await asyncio.sleep(delay)

    async def disconnect(self) -> None:
        self._should_run = False
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            self._heartbeat_task = None

        if self._connected and self._client is not None:
            try:
                await asyncio.to_thread(self._cleanup_actors_sync)
            except Exception as exc:
                logger.warning("Cleanup error: %s", exc)

        self._connected = False
        self._client = None
        self._world = None
        logger.info("Disconnected from CARLA")

    def track_actor(self, actor_id: int) -> None:
        self._spawned_actor_ids.add(actor_id)

    def untrack_actor(self, actor_id: int) -> None:
        self._spawned_actor_ids.discard(actor_id)

    def get_traffic_manager(self, port: int = 8000) -> carla.TrafficManager:
        return self.client.get_trafficmanager(port)

    def _connect_sync(self) -> tuple[carla.Client, carla.World]:
        import carla as carla_module
        client = carla_module.Client(CARLA_HOST, CARLA_PORT)
        client.set_timeout(CARLA_TIMEOUT)
        world = client.get_world()
        return client, world

    def _cleanup_actors_sync(self) -> None:
        if not self._spawned_actor_ids or self._client is None:
            return
        try:
            actors = self._client.get_world().get_actors(list(self._spawned_actor_ids))
            for actor in actors:
                if actor is not None:
                    if actor.type_id.startswith("sensor."):
                        actor.stop()
                    actor.destroy()
        except Exception:
            pass
        self._spawned_actor_ids.clear()

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
        self._client.get_server_version()
        self._world = self._client.get_world()


carla_manager = CarlaClientManager()
