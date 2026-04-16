"""Simulation control endpoints."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, HTTPException

from src.carla_client import carla_manager
from src.models.schemas import (
    SimulationSettings,
    SimulationStatus,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/simulation", tags=["simulation"])

_paused = False
_pre_pause_sync_mode: bool | None = None
_pre_pause_fixed_delta: float | None = None


def _require_connection() -> None:
    if not carla_manager.is_connected:
        raise HTTPException(status_code=503, detail="Not connected to CARLA server")


@router.get("/status", response_model=SimulationStatus)
async def get_status() -> Any:
    global _paused
    if not carla_manager.is_connected:
        return SimulationStatus(connected=False)

    def _get() -> Any:
        world = carla_manager.world
        settings = world.get_settings()
        snapshot = world.get_snapshot()
        return SimulationStatus(
            connected=True,
            running=not _paused,
            paused=_paused,
            tick=snapshot.frame,
            elapsed_time=snapshot.elapsed_seconds,
            map=world.get_map().name,
            sync_mode=settings.synchronous_mode,
            fixed_delta=settings.fixed_delta_seconds,
            # Cached at connect — avoids an RPC round-trip on every 2s
            # status poll. Reset on disconnect so a reconnect to a
            # different CARLA build reflects the new version.
            server_version=carla_manager.server_version,
        )

    try:
        return await asyncio.to_thread(_get)
    except Exception as exc:
        # `server_version` is a user-visible label ("0.9.14"). Previously this
        # stuffed the exception string into it, so the Settings "Server" row
        # and StatusBar ended up showing "TimeoutError: ..." as if it were
        # the CARLA build ID. Log the real error and return an empty version
        # instead so the UI falls back to "Disconnected" cleanly.
        logger.warning("simulation.status failed: %s", exc)
        return SimulationStatus(connected=False)


@router.post("/play")
async def play() -> Any:
    global _paused, _pre_pause_sync_mode, _pre_pause_fixed_delta
    _require_connection()

    def _play() -> dict[str, Any]:
        world = carla_manager.world
        if _paused:
            settings = world.get_settings()
            settings.synchronous_mode = (
                _pre_pause_sync_mode if _pre_pause_sync_mode is not None else False
            )
            settings.fixed_delta_seconds = _pre_pause_fixed_delta
            world.apply_settings(settings)
        # Previously also called `world.tick()` when not paused but in sync
        # mode. With _world_tick_loop as the single tick source (see main.py
        # and the explicit warning in routes/actors.py apply_control), that
        # extra call just raced the loop and caused the actor control bug
        # the other comment describes.
        return {"status": "playing"}

    result = await asyncio.to_thread(_play)
    _paused = False
    return result


@router.post("/pause")
async def pause() -> Any:
    global _paused, _pre_pause_sync_mode, _pre_pause_fixed_delta
    _require_connection()

    def _pause() -> dict[str, Any]:
        world = carla_manager.world
        settings = world.get_settings()
        current_fixed_delta = settings.fixed_delta_seconds
        if current_fixed_delta is None or current_fixed_delta <= 0:
            current_fixed_delta = 0.05
        settings.synchronous_mode = True
        settings.fixed_delta_seconds = current_fixed_delta
        world.apply_settings(settings)
        return {
            "status": "paused",
            "sync_mode": settings.synchronous_mode,
            "fixed_delta": settings.fixed_delta_seconds,
        }

    world = carla_manager.world
    settings = await asyncio.to_thread(world.get_settings)
    _pre_pause_sync_mode = settings.synchronous_mode
    _pre_pause_fixed_delta = settings.fixed_delta_seconds
    result = await asyncio.to_thread(_pause)
    _paused = True
    return result


@router.post("/step")
async def step() -> Any:
    _require_connection()

    def _step() -> dict[str, Any]:
        world = carla_manager.world
        frame = world.tick()
        return {"frame": frame}

    return await asyncio.to_thread(_step)


@router.get("/tick")
async def get_tick() -> Any:
    _require_connection()

    def _get() -> dict[str, Any]:
        return {"tick": carla_manager.world.get_snapshot().frame}

    return await asyncio.to_thread(_get)


@router.post("/settings")
async def update_settings(req: SimulationSettings) -> Any:
    _require_connection()

    def _update() -> dict[str, Any]:
        world = carla_manager.world
        settings = world.get_settings()
        if req.sync_mode is not None:
            settings.synchronous_mode = req.sync_mode
        if req.fixed_delta is not None:
            settings.fixed_delta_seconds = req.fixed_delta
        if req.no_rendering is not None:
            settings.no_rendering_mode = req.no_rendering
        if req.substepping is not None:
            settings.substepping = req.substepping
        if req.max_substep_delta is not None:
            settings.max_substep_delta_time = req.max_substep_delta
        if req.max_substeps is not None:
            settings.max_substeps = req.max_substeps
        world.apply_settings(settings)
        return {"status": "updated"}

    return await asyncio.to_thread(_update)


@router.post("/reload")
async def reload_map() -> Any:
    _require_connection()
    from src.main import realtime_session, sensor_manager

    await realtime_session.reset(destroy_managed=True, reason="reload world")
    await sensor_manager.destroy_all()
    carla_manager.clear_tracked_actors()

    def _reload() -> dict[str, Any]:
        try:
            carla_manager.client.reload_world()
            # Refresh the cached world reference — see world.load_map for
            # the rationale. reload_world() replaces the world in CARLA
            # but carla_manager._world still points at the pre-reload
            # instance until the next heartbeat; ticks against the stale
            # reference error out until then.
            carla_manager.refresh_world()
            return {"status": "reloaded"}
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e)) from e

    return await asyncio.to_thread(_reload)
