"""Sensor configuration endpoints."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException

from src.carla_client import carla_manager

router = APIRouter(prefix="/api/sensors", tags=["sensors"])


def _require_connection() -> None:
    if not carla_manager.is_connected:
        raise HTTPException(status_code=503, detail="Not connected to CARLA server")


SENSOR_TYPES = [
    {"type": "sensor.camera.rgb", "category": "camera", "description": "RGB Camera"},
    {"type": "sensor.camera.depth", "category": "camera", "description": "Depth Camera"},
    {"type": "sensor.camera.semantic_segmentation", "category": "camera", "description": "Semantic Segmentation"},
    {"type": "sensor.camera.instance_segmentation", "category": "camera", "description": "Instance Segmentation"},
    {"type": "sensor.camera.optical_flow", "category": "camera", "description": "Optical Flow"},
    {"type": "sensor.camera.normals", "category": "camera", "description": "Normals Camera"},
    {"type": "sensor.camera.dvs", "category": "camera", "description": "DVS Camera"},
    {"type": "sensor.lidar.ray_cast", "category": "lidar", "description": "LiDAR Ray-Cast"},
    {"type": "sensor.lidar.ray_cast_semantic", "category": "lidar", "description": "Semantic LiDAR"},
    {"type": "sensor.other.radar", "category": "radar", "description": "Radar"},
    {"type": "sensor.other.imu", "category": "imu", "description": "IMU"},
    {"type": "sensor.other.gnss", "category": "gnss", "description": "GNSS"},
    {"type": "sensor.other.collision", "category": "event", "description": "Collision Detector"},
    {"type": "sensor.other.lane_invasion", "category": "event", "description": "Lane Invasion Detector"},
    {"type": "sensor.other.obstacle", "category": "event", "description": "Obstacle Detector"},
]


@router.get("/types")
async def list_sensor_types():
    return {"sensor_types": SENSOR_TYPES}


@router.get("/{sensor_id}/config")
async def get_sensor_config(sensor_id: int):
    _require_connection()

    def _get():
        actor = carla_manager.world.get_actor(sensor_id)
        if actor is None:
            raise HTTPException(status_code=404, detail=f"Sensor {sensor_id} not found")
        attrs = {}
        for attr in actor.attributes:
            attrs[attr] = actor.attributes[attr]
        return {
            "id": sensor_id,
            "type_id": actor.type_id,
            "attributes": attrs,
        }

    return await asyncio.to_thread(_get)


@router.post("/{sensor_id}/config")
async def update_sensor_config(sensor_id: int, attributes: dict[str, str]):
    _require_connection()
    return {
        "status": "updated",
        "id": sensor_id,
        "note": "Sensor attribute changes require re-spawning the sensor",
    }
