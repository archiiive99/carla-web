"""Blueprint listing endpoints."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException

from src.carla_client import carla_manager
from src.utils.serialization import serialize_blueprint

router = APIRouter(prefix="/api/blueprints", tags=["blueprints"])


def _require_connection() -> None:
    if not carla_manager.is_connected:
        raise HTTPException(status_code=503, detail="Not connected to CARLA server")


def _filter_blueprints(prefix: str) -> list[dict]:
    try:
        bp_lib = carla_manager.world.get_blueprint_library()
        results = []
        for bp in bp_lib.filter(f"{prefix}.*"):
            results.append(serialize_blueprint(bp).model_dump())
        return results
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/vehicles")
async def list_vehicle_blueprints():
    _require_connection()
    return {"blueprints": await asyncio.to_thread(_filter_blueprints, "vehicle")}


@router.get("/walkers")
async def list_walker_blueprints():
    _require_connection()
    return {"blueprints": await asyncio.to_thread(_filter_blueprints, "walker")}


@router.get("/sensors")
async def list_sensor_blueprints():
    _require_connection()
    return {"blueprints": await asyncio.to_thread(_filter_blueprints, "sensor")}


@router.get("/props")
async def list_prop_blueprints():
    _require_connection()
    return {"blueprints": await asyncio.to_thread(_filter_blueprints, "static")}
