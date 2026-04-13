"""Simulation control endpoints."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException

from src.carla_client import carla_manager
from src.models.schemas import (
    ErrorResponse,
    SimulationSettings,
    SimulationStatus,
)
from src.utils.serialization import serialize_weather

router = APIRouter(prefix="/api/simulation", tags=["simulation"])


def _require_connection() -> None:
    if not carla_manager.is_connected:
        raise HTTPException(status_code=503, detail="Not connected to CARLA server")


@router.get("/status", response_model=SimulationStatus)
async def get_status():
    if not carla_manager.is_connected:
        return SimulationStatus(connected=False)

    def _get():
        world = carla_manager.world
        settings = world.get_settings()
        snapshot = world.get_snapshot()
        return SimulationStatus(
            connected=True,
            running=not settings.synchronous_mode or True,
            paused=False,
            tick=snapshot.frame,
            elapsed_time=snapshot.elapsed_seconds,
            map=world.get_map().name,
            sync_mode=settings.synchronous_mode,
            fixed_delta=settings.fixed_delta_seconds,
            server_version=carla_manager.client.get_server_version(),
        )

    try:
        return await asyncio.to_thread(_get)
    except Exception as exc:
        return SimulationStatus(connected=False, server_version=str(exc))


@router.post("/play")
async def play():
    _require_connection()

    def _play():
        world = carla_manager.world
        settings = world.get_settings()
        if settings.synchronous_mode:
            world.tick()
        return {"status": "playing"}

    return await asyncio.to_thread(_play)


@router.post("/pause")
async def pause():
    _require_connection()
    return {"status": "paused"}


@router.post("/step")
async def step():
    _require_connection()

    def _step():
        world = carla_manager.world
        frame = world.tick()
        return {"frame": frame}

    return await asyncio.to_thread(_step)


@router.get("/tick")
async def get_tick():
    _require_connection()

    def _get():
        return {"tick": carla_manager.world.get_snapshot().frame}

    return await asyncio.to_thread(_get)


@router.post("/settings")
async def update_settings(req: SimulationSettings):
    _require_connection()

    def _update():
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
async def reload_map():
    _require_connection()

    def _reload():
        carla_manager.client.reload_world()
        return {"status": "reloaded"}

    return await asyncio.to_thread(_reload)
