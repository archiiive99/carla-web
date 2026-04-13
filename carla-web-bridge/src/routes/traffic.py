"""Traffic Manager endpoints."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException

from src.carla_client import carla_manager
from src.models.schemas import (
    GlobalSpeedRequest,
    IgnoreRequest,
    LaneChangeRequest,
    RouteRequest,
    TrafficStatus,
    VehicleSpeedRequest,
)

router = APIRouter(prefix="/api/traffic", tags=["traffic"])


def _require_connection() -> None:
    if not carla_manager.is_connected:
        raise HTTPException(status_code=503, detail="Not connected to CARLA server")


@router.get("/status", response_model=TrafficStatus)
async def get_status():
    _require_connection()
    return TrafficStatus(port=8000, active=True)


@router.post("/global-speed")
async def set_global_speed(req: GlobalSpeedRequest):
    _require_connection()

    def _set():
        try:
            tm = carla_manager.get_traffic_manager()
            tm.global_percentage_speed_difference(req.speed_diff)
            return {"status": "global_speed_set", "speed_diff": req.speed_diff}
        except HTTPException:
            raise
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return await asyncio.to_thread(_set)


@router.post("/vehicle/{vehicle_id}/speed")
async def set_vehicle_speed(vehicle_id: int, req: VehicleSpeedRequest):
    _require_connection()

    def _set():
        try:
            import carla

            actor = carla_manager.world.get_actor(vehicle_id)
            if actor is None:
                raise HTTPException(status_code=404, detail=f"Vehicle {vehicle_id} not found")
            tm = carla_manager.get_traffic_manager()
            tm.vehicle_percentage_speed_difference(actor, req.speed_diff)
            return {"status": "speed_set", "id": vehicle_id}
        except HTTPException:
            raise
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return await asyncio.to_thread(_set)


@router.post("/vehicle/{vehicle_id}/lane")
async def set_lane_behavior(vehicle_id: int, req: LaneChangeRequest):
    _require_connection()

    def _set():
        try:
            actor = carla_manager.world.get_actor(vehicle_id)
            if actor is None:
                raise HTTPException(status_code=404, detail=f"Vehicle {vehicle_id} not found")
            tm = carla_manager.get_traffic_manager()
            tm.auto_lane_change(actor, req.auto_lane_change)
            if req.force_lane_change:
                tm.force_lane_change(actor, True)
            return {"status": "lane_set", "id": vehicle_id}
        except HTTPException:
            raise
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return await asyncio.to_thread(_set)


@router.post("/vehicle/{vehicle_id}/ignore")
async def set_ignore(vehicle_id: int, req: IgnoreRequest):
    _require_connection()

    def _set():
        try:
            actor = carla_manager.world.get_actor(vehicle_id)
            if actor is None:
                raise HTTPException(status_code=404, detail=f"Vehicle {vehicle_id} not found")
            tm = carla_manager.get_traffic_manager()
            tm.ignore_lights_percentage(actor, req.lights)
            tm.ignore_signs_percentage(actor, req.signs)
            tm.ignore_walkers_percentage(actor, req.walkers)
            tm.ignore_vehicles_percentage(actor, req.vehicles)
            return {"status": "ignore_set", "id": vehicle_id}
        except HTTPException:
            raise
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return await asyncio.to_thread(_set)


@router.post("/vehicle/{vehicle_id}/route")
async def set_route(vehicle_id: int, req: RouteRequest):
    _require_connection()

    def _set():
        try:
            import carla

            actor = carla_manager.world.get_actor(vehicle_id)
            if actor is None:
                raise HTTPException(status_code=404, detail=f"Vehicle {vehicle_id} not found")
            tm = carla_manager.get_traffic_manager()
            locs = [carla.Location(x=w.x, y=w.y, z=w.z) for w in req.waypoints]
            tm.set_path(actor, locs)
            return {"status": "route_set", "id": vehicle_id, "waypoints": len(locs)}
        except HTTPException:
            raise
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return await asyncio.to_thread(_set)
