"""Sensor configuration endpoints."""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, HTTPException

from src.carla_client import carla_manager
from src.ws.channels import Channel
from src.ws.protocol import encode_frame
from src.ws_broadcaster import ws_broadcaster

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sensors", tags=["sensors"])


def _get_sensor_manager():
    """Lazy import to avoid circular dependency."""
    from src.main import sensor_manager
    return sensor_manager


def _require_connection() -> None:
    if not carla_manager.is_connected:
        raise HTTPException(status_code=503, detail="Not connected to CARLA server")


# Only sensors with a full bridge-side encode path in _kind_for_type are
# advertised here. optical_flow / dvs / obstacle have no mapping — the
# bridge would silently drop their frames, which historically misled clients
# into spawning sensors that then rendered forever-blank panels.
SENSOR_TYPES = [
    {"type": "sensor.camera.rgb", "category": "camera", "description": "RGB Camera"},
    {"type": "sensor.camera.depth", "category": "camera", "description": "Depth Camera"},
    {"type": "sensor.camera.semantic_segmentation", "category": "camera", "description": "Semantic Segmentation"},
    {"type": "sensor.camera.instance_segmentation", "category": "camera", "description": "Instance Segmentation"},
    {"type": "sensor.camera.normals", "category": "camera", "description": "Normals Camera"},
    {"type": "sensor.lidar.ray_cast", "category": "lidar", "description": "LiDAR Ray-Cast"},
    {"type": "sensor.lidar.ray_cast_semantic", "category": "lidar", "description": "Semantic LiDAR"},
    {"type": "sensor.other.radar", "category": "radar", "description": "Radar"},
    {"type": "sensor.other.imu", "category": "imu", "description": "IMU"},
    {"type": "sensor.other.gnss", "category": "gnss", "description": "GNSS"},
    {"type": "sensor.other.collision", "category": "event", "description": "Collision Detector"},
    {"type": "sensor.other.lane_invasion", "category": "event", "description": "Lane Invasion Detector"},
]


@router.get("/types")
async def list_sensor_types():
    return {"sensor_types": SENSOR_TYPES}


@router.get("/rates")
async def list_subscriber_rates():
    """Snapshot of every active per-(client, sensor) target_fps and ceiling.

    Useful for ops dashboards and for verifying the adaptive controller
    behavior without scraping logs.
    """
    sm = _get_sensor_manager()
    rows = sm.iter_subscriber_rates()
    return {
        "rates": [
            {
                "client_id": cid,
                "sensor_id": sid,
                "target_fps": tgt,
                "effective_fps": ceil,
                "native_fps": sm.get_native_fps(sid),
            }
            for cid, sid, tgt, ceil in rows
        ],
    }


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


# --- D3: live attribute adjustment via destroy + respawn -------------------
#
# Live-adjustable attributes vs. recreate-required:
#   * CARLA's PythonAPI does NOT support set_attribute on a spawned actor.
#   * Therefore EVERY attribute (sensor_tick, image_size_x, image_size_y,
#     fov, points_per_second, channels, range, ...) requires a destroy +
#     respawn. SensorManager.LIVE_ADJUSTABLE_ATTRIBUTES is currently empty.
#   * We expose this as an explicit `recreate` semantic: PATCHing an
#     attribute returns the new sensor_id and broadcasts a CONTROL frame
#     `{"type":"sensor_recreated","old_sensor_id":N,"new_sensor_id":M,
#       "applied_attributes":{...}}` so subscribed clients can update
#     their UI references atomically.

@router.patch("/{sensor_id}/attributes")
async def patch_sensor_attributes(sensor_id: int, attributes: dict[str, str]):
    """Adjust a running sensor's attributes (e.g. sensor_tick) at runtime.

    Implementation: destroy + respawn preserving the subscriber set and
    per-(client, sensor) adaptive-rate state. Clients are notified via a
    CONTROL frame so they can rebind their internal sensor_id reference.
    """
    _require_connection()
    if not isinstance(attributes, dict) or not attributes:
        raise HTTPException(status_code=400, detail="attributes must be a non-empty object")

    sm = _get_sensor_manager()
    try:
        known_attributes = sm.get_sensor_attributes(sensor_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Sensor {sensor_id} not managed by bridge")

    unknown_attributes = sorted(set(attributes) - set(known_attributes))
    if unknown_attributes:
        raise HTTPException(
            status_code=400,
            detail=(
                "Unknown sensor attribute(s): "
                + ", ".join(unknown_attributes)
            ),
        )

    async def _announce(old_id: int, new_id: int, attrs: dict, subs: set[str]) -> None:
        # Sent BEFORE the new listener is armed so clients always see the
        # swap notice ahead of any frame carrying the new sensor_id.
        notice = json.dumps({
            "type": "sensor_recreated",
            "old_sensor_id": old_id,
            "new_sensor_id": new_id,
            "applied_attributes": attrs,
        }).encode("utf-8")
        await ws_broadcaster.broadcast_raw(encode_frame(Channel.CONTROL, notice), subs)

    try:
        new_id, snapshot = await sm.recreate_sensor_with_attributes(
            sensor_id, {k: str(v) for k, v in attributes.items()}, on_announce=_announce
        )
    except KeyError:
        raise HTTPException(
            status_code=404,
            detail=f"Sensor {sensor_id} not managed by bridge (cannot recreate without spawn params)",
        )
    except Exception as exc:
        logger.error("PATCH sensor attributes failed for %d: %s", sensor_id, exc)
        raise HTTPException(status_code=500, detail=str(exc))

    return {
        "status": "recreated",
        "old_sensor_id": snapshot["old_sensor_id"],
        "new_sensor_id": new_id,
        "applied_attributes": snapshot["applied_attributes"],
        "id_map": {
            "old_sensor_id": snapshot["old_sensor_id"],
            "new_sensor_id": new_id,
        },
        "subscribers_migrated": len(snapshot["subscribers"]),
        "live_adjustable_attributes": list(sm.LIVE_ADJUSTABLE_ATTRIBUTES),
    }
