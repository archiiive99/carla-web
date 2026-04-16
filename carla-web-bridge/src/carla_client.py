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
    RECONNECT_MAX_DELAY,
    RECONNECT_STD_EXCEPTION_DELAY,
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
        # Cache the CARLA server version at connect-time. Previously every
        # GET /api/simulation/status call (polled every 2s by the frontend)
        # round-tripped client.get_server_version() even though the value
        # never changes while a connection is live. Reset on disconnect so
        # a reconnect to a different build surfaces the new version.
        self._server_version: str = ""

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
    def server_version(self) -> str:
        return self._server_version

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

    def get_actor(self, actor_id: int) -> carla.Actor | None:
        with self._rpc_lock:
            world = self.refresh_world()
            return world.get_actor(actor_id)

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
                self._server_version = await asyncio.to_thread(
                    self._client.get_server_version
                )
                logger.info(
                    "Connected to CARLA %s at %s:%d (sync mode forced)",
                    self._server_version,
                    CARLA_HOST,
                    CARLA_PORT,
                )
                delay = 1.0
                # Cancel old heartbeat if any, and await it so a still-running
                # task doesn't linger as a pending cancel when we start the
                # new one.
                old_hb = self._heartbeat_task
                if old_hb and not old_hb.done():
                    old_hb.cancel()
                    try:
                        await old_hb
                    except asyncio.CancelledError:
                        pass
                    except Exception as exc:
                        logger.debug("Old heartbeat exited with exception: %s", exc)
                self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())
                return
            except Exception as exc:
                # Roll back partially-committed connect state. _connect_sync
                # may succeed before _ensure_sync_mode / get_server_version
                # fails — without this reset, `is_connected` would report
                # True between the failure and the next retry, letting route
                # handlers operate on a world that wasn't put into sync
                # mode yet (or with a client whose server-version probe
                # already raised, indicating a flaky connection).
                self._connected = False
                self._connected_at_monotonic = None
                self._client = None
                self._world = None
                self._server_version = ""
                message = str(exc)
                if "std::exception" in message:
                    # Hold std-exception retries at a fixed short delay
                    # — they usually clear as soon as CARLA finishes its
                    # own startup, so exponential backoff would just make
                    # the user wait longer for the simulator to come up.
                    delay = RECONNECT_STD_EXCEPTION_DELAY
                else:
                    # Exponential backoff for other failures, capped.
                    delay = min(delay * 2, RECONNECT_MAX_DELAY)
                # Log AFTER computing the final delay so the message matches
                # the actual sleep duration (previously logged the pre-double
                # value for non-std exceptions — drift the user would notice).
                logger.warning(
                    "CARLA connection failed (%s). Retrying in %.0fs…",
                    exc,
                    delay,
                )
                await asyncio.sleep(delay)

    async def disconnect(self) -> None:
        self._should_run = False
        task = self._heartbeat_task
        self._heartbeat_task = None
        if task:
            # Await the cancelled task so asyncio doesn't log
            # "Task was destroyed but it is pending!" on shutdown
            # and any unobserved exception is collected here.
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            except Exception as exc:
                logger.debug("Heartbeat task exited with exception: %s", exc)

        # Hot reload / reconnect must not destroy live CARLA actors. Bridge-side
        # state is rebuilt from the simulator on the next connection.
        self._spawned_actor_ids.clear()

        self._connected = False
        self._connected_at_monotonic = None
        self._client = None
        self._world = None
        self._server_version = ""
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
