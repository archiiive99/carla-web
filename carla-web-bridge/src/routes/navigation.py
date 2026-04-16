"""Map/navigation endpoints."""

from __future__ import annotations

import asyncio
import math
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from src.carla_client import carla_manager
from src.models.schemas import RouteQueryRequest
from src.utils.serialization import carla_transform_to_dict

router = APIRouter(prefix="/api/map", tags=["navigation"])


def _require_connection() -> None:
    if not carla_manager.is_connected:
        raise HTTPException(status_code=503, detail="Not connected to CARLA server")


@router.get("/topology")
async def get_topology() -> Any:
    _require_connection()

    def _get() -> dict[str, Any]:
        try:
            world = carla_manager.world
            carla_map = world.get_map()
            topology = carla_map.get_topology()
            edges = []
            for wp_start, wp_end in topology:
                edges.append({
                    "start": {
                        "id": wp_start.id,
                        "road_id": wp_start.road_id,
                        "lane_id": wp_start.lane_id,
                        "transform": carla_transform_to_dict(wp_start.transform).model_dump(),
                    },
                    "end": {
                        "id": wp_end.id,
                        "road_id": wp_end.road_id,
                        "lane_id": wp_end.lane_id,
                        "transform": carla_transform_to_dict(wp_end.transform).model_dump(),
                    },
                })
            return {"topology": edges, "count": len(edges)}
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e)) from e

    return await asyncio.to_thread(_get)


@router.get("/waypoints")
async def get_dense_waypoints(
    # gt=0 rejects negative/zero/NaN distances at the FastAPI boundary.
    # Without this, `distance=NaN` propagates through min/max (which
    # return NaN for NaN inputs in Python) and reaches CARLA's
    # generate_waypoints as NaN — either errors opaquely or stalls.
    # The internal clamp below is preserved as a safety net and
    # also caps the legitimate upper bound at 20m (anything denser
    # than 1m floods the frontend with no perceptual benefit).
    distance: float = Query(5.0, gt=0.0, le=100.0),
) -> Any:
    """Generate waypoints along all roads at the given distance interval."""
    _require_connection()

    def _get() -> dict[str, Any]:
        try:
            # Defence-in-depth: even with the Query bound, guard against
            # inf (Query(gt=0) accepts Infinity since it's strictly > 0).
            if not math.isfinite(distance):
                raise HTTPException(status_code=422, detail="distance must be finite")
            world = carla_manager.world
            carla_map = world.get_map()
            waypoints = carla_map.generate_waypoints(max(1.0, min(distance, 20.0)))
            result = []
            for wp in waypoints:
                loc = wp.transform.location
                result.append({
                    "x": round(float(loc.x), 2),
                    "y": round(float(loc.y), 2),
                    "z": round(float(loc.z), 2),
                    "road_id": int(wp.road_id),
                    "lane_id": int(wp.lane_id),
                })
            return {"waypoints": result, "count": len(result), "distance": distance}
        except HTTPException:
            raise
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e)) from e

    return await asyncio.to_thread(_get)


@router.get("/environment")
async def get_environment_objects() -> Any:
    """Return all static environment objects for Three.js city rendering."""
    _require_connection()

    def _get() -> Any:
        try:
            import carla as carla_mod

            world = carla_manager.world
            labels = [
                ("buildings", carla_mod.CityObjectLabel.Buildings),
                ("roads", carla_mod.CityObjectLabel.Roads),
                ("sidewalks", carla_mod.CityObjectLabel.Sidewalks),
                ("vegetation", carla_mod.CityObjectLabel.Vegetation),
                ("poles", carla_mod.CityObjectLabel.Poles),
                ("walls", carla_mod.CityObjectLabel.Walls),
                ("fences", carla_mod.CityObjectLabel.Fences),
                ("traffic_lights", carla_mod.CityObjectLabel.TrafficLight),
                ("traffic_signs", carla_mod.CityObjectLabel.TrafficSigns),
                ("water", carla_mod.CityObjectLabel.Water),
                ("rocks", carla_mod.CityObjectLabel.Rock),
                ("guard_rails", carla_mod.CityObjectLabel.GuardRail),
                ("road_lines", carla_mod.CityObjectLabel.RoadLines),
            ]
            result = {}
            for key, label in labels:
                objects = world.get_environment_objects(label)
                result[key] = [
                    {
                        "name": obj.name,
                        "t": {
                            "x": round(float(obj.transform.location.x), 2),
                            "y": round(float(obj.transform.location.y), 2),
                            "z": round(float(obj.transform.location.z), 2),
                            "yaw": round(float(obj.transform.rotation.yaw), 2),
                        },
                        "b": {
                            "x": round(float(obj.bounding_box.location.x), 2),
                            "y": round(float(obj.bounding_box.location.y), 2),
                            "z": round(float(obj.bounding_box.location.z), 2),
                            "ex": round(float(obj.bounding_box.extent.x), 2),
                            "ey": round(float(obj.bounding_box.extent.y), 2),
                            "ez": round(float(obj.bounding_box.extent.z), 2),
                            "yaw": round(float(obj.bounding_box.rotation.yaw), 2),
                        },
                    }
                    for obj in objects
                ]
            return result
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e)) from e

    return await asyncio.to_thread(_get)


@router.get("/road-geometry")
async def get_road_geometry(
    # Same gt=0 + finite guard as get_dense_waypoints. The internal clamp
    # caps legitimate use at 10m (denser sampling in get_road_geometry
    # because the frontend road mesh needs closer points).
    distance: float = Query(2.0, gt=0.0, le=100.0),
) -> Any:
    """Return dense road waypoints with lane width for road surface mesh generation."""
    _require_connection()

    def _get() -> Any:
        try:
            if not math.isfinite(distance):
                raise HTTPException(status_code=422, detail="distance must be finite")
            carla_map = carla_manager.world.get_map()
            waypoints = carla_map.generate_waypoints(max(1.0, min(distance, 10.0)))
            return [
                {
                    "x": round(float(wp.transform.location.x), 2),
                    "y": round(float(wp.transform.location.y), 2),
                    "z": round(float(wp.transform.location.z), 2),
                    "yaw": round(float(wp.transform.rotation.yaw), 2),
                    "road_id": int(wp.road_id),
                    "lane_id": int(wp.lane_id),
                    "lane_width": round(float(wp.lane_width), 2),
                    "is_junction": bool(wp.is_junction),
                }
                for wp in waypoints
            ]
        except HTTPException:
            raise
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e)) from e

    return await asyncio.to_thread(_get)


@router.post("/route")
async def compute_route(req: RouteQueryRequest) -> Any:
    _require_connection()

    def _compute() -> dict[str, Any]:
        try:
            import carla

            world = carla_manager.world
            carla_map = world.get_map()

            origin_loc = carla.Location(x=req.origin.x, y=req.origin.y, z=req.origin.z)
            dest_loc = carla.Location(
                x=req.destination.x, y=req.destination.y, z=req.destination.z
            )

            wp_start = carla_map.get_waypoint(origin_loc)
            wp_end = carla_map.get_waypoint(dest_loc)

            if wp_start is None or wp_end is None:
                raise HTTPException(status_code=400, detail="Could not find waypoints")

            from agents.navigation.global_route_planner import GlobalRoutePlanner

            grp = GlobalRoutePlanner(carla_map, sampling_resolution=2.0)
            route = grp.trace_route(wp_start.transform.location, wp_end.transform.location)

            waypoints = []
            for wp, road_option in route:
                waypoints.append({
                    "transform": carla_transform_to_dict(wp.transform).model_dump(),
                    "road_option": str(road_option),
                    "road_id": wp.road_id,
                    "lane_id": wp.lane_id,
                })
            return {"route": waypoints, "count": len(waypoints)}
        except HTTPException:
            raise
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e)) from e

    return await asyncio.to_thread(_compute)


@router.get("/waypoint")
async def get_nearest_waypoint(x: float, y: float, z: float = 0.0) -> Any:
    _require_connection()

    def _get() -> dict[str, Any]:
        try:
            import carla

            carla_map = carla_manager.world.get_map()
            loc = carla.Location(x=x, y=y, z=z)
            wp = carla_map.get_waypoint(loc)
            if wp is None:
                raise HTTPException(status_code=404, detail="No waypoint found")
            return {
                "id": wp.id,
                "road_id": wp.road_id,
                "section_id": wp.section_id,
                "lane_id": wp.lane_id,
                "is_junction": wp.is_junction,
                "lane_width": wp.lane_width,
                "lane_type": str(wp.lane_type),
                "transform": carla_transform_to_dict(wp.transform).model_dump(),
            }
        except HTTPException:
            raise
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e)) from e

    return await asyncio.to_thread(_get)
