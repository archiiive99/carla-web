"""Data conversion helpers for CARLA types to Pydantic models."""

from __future__ import annotations

import math
import struct
from typing import Any

from fastapi import HTTPException

from src.models.schemas import (
    ActorInfo,
    BlueprintAttribute,
    BlueprintInfo,
    Rotation,
    Transform,
    Vector3,
    WeatherParams,
)


def carla_transform_to_dict(t: Any) -> Transform:
    return Transform(
        location=Vector3(x=t.location.x, y=t.location.y, z=t.location.z),
        rotation=Rotation(
            pitch=t.rotation.pitch, yaw=t.rotation.yaw, roll=t.rotation.roll
        ),
    )


def carla_vector_to_dict(v: Any) -> Vector3:
    return Vector3(x=v.x, y=v.y, z=v.z)


def dict_to_carla_transform(data: Transform) -> Any:
    """Convert Transform schema to carla.Transform. Must be called from thread.

    Raises HTTPException(422) if any coordinate is non-finite. Pydantic's
    plain `float` fields accept NaN / Infinity, which then propagated
    through carla.Location / carla.Rotation and produced opaque errors
    (or silent physics corruption) deep inside CARLA. Catching it at
    this single chokepoint protects every spawn/ set_transform /
    set_spectator path without adding per-route guards.
    """
    import carla

    coords = (
        data.location.x, data.location.y, data.location.z,
        data.rotation.pitch, data.rotation.yaw, data.rotation.roll,
    )
    if not all(math.isfinite(v) for v in coords):
        raise HTTPException(
            status_code=422,
            detail="transform location and rotation values must be finite",
        )
    return carla.Transform(
        carla.Location(
            x=data.location.x, y=data.location.y, z=data.location.z
        ),
        carla.Rotation(
            pitch=data.rotation.pitch,
            yaw=data.rotation.yaw,
            roll=data.rotation.roll,
        ),
    )


def classify_actor(type_id: str) -> str:
    if type_id.startswith("vehicle."):
        return "vehicle"
    if type_id.startswith("walker."):
        return "walker"
    if type_id.startswith("sensor."):
        return "sensor"
    if "traffic_light" in type_id:
        return "traffic_light"
    if "traffic.speed_limit" in type_id or "traffic" in type_id:
        return "traffic_sign"
    return "other"


def serialize_actor(actor: Any) -> ActorInfo:
    t = actor.get_transform()
    v = actor.get_velocity()
    parent_id: int | None = None
    try:
        parent = getattr(actor, "parent", None)
        if parent is not None:
            parent_id = int(parent.id)
    except Exception:
        parent_id = None
    role_name: str | None = None
    vehicle_color: str | None = None
    vehicle_driver_id: str | None = None
    vehicle_generation: str | None = None
    vehicle_wheel_count: int | None = None
    try:
        attrs = getattr(actor, "attributes", None) or {}
        value = attrs.get("role_name")
        if value:
            role_name = str(value)
        color = attrs.get("color")
        if color:
            vehicle_color = str(color)
        driver_id = attrs.get("driver_id")
        if driver_id:
            vehicle_driver_id = str(driver_id)
        generation = attrs.get("generation")
        if generation:
            vehicle_generation = str(generation)
        wheels = attrs.get("number_of_wheels")
        if wheels is not None:
            try:
                vehicle_wheel_count = int(str(wheels))
            except Exception:
                vehicle_wheel_count = None
    except Exception:
        # Fields are already initialized to None above — the outer try just
        # guards the attribute dict lookup itself, not the final assignments.
        pass
    tl_state: str | None = None
    if actor.type_id.startswith("traffic.traffic_light"):
        try:
            st = actor.get_state()
            tl_state = str(st).split(".")[-1]  # "TrafficLightState.Red" → "Red"
        except Exception:
            tl_state = None
    return ActorInfo(
        id=actor.id,
        type_id=actor.type_id,
        type=classify_actor(actor.type_id),
        transform=carla_transform_to_dict(t),
        velocity=carla_vector_to_dict(v),
        parent_id=parent_id,
        role_name=role_name,
        traffic_light_state=tl_state,
        vehicle_color=vehicle_color,
        vehicle_driver_id=vehicle_driver_id,
        vehicle_generation=vehicle_generation,
        vehicle_wheel_count=vehicle_wheel_count,
    )


def serialize_blueprint(bp: Any) -> BlueprintInfo:
    attrs = []
    for attr in bp:
        attrs.append(
            BlueprintAttribute(
                id=attr.id,
                type=str(attr.type),
                value=str(attr.recommended_values[0]) if attr.recommended_values else "",
                recommended_values=[str(v) for v in attr.recommended_values],
            )
        )
    return BlueprintInfo(
        id=bp.id,
        tags=[str(t) for t in bp.tags],
        attributes=attrs,
    )


def serialize_weather(w: Any) -> WeatherParams:
    return WeatherParams(
        cloudiness=w.cloudiness,
        precipitation=w.precipitation,
        precipitation_deposits=w.precipitation_deposits,
        wind_intensity=w.wind_intensity,
        sun_azimuth_angle=w.sun_azimuth_angle,
        sun_altitude_angle=w.sun_altitude_angle,
        fog_density=w.fog_density,
        fog_distance=w.fog_distance,
        fog_falloff=w.fog_falloff,
        wetness=w.wetness,
        scattering_intensity=w.scattering_intensity,
        mie_scattering_scale=w.mie_scattering_scale,
        rayleigh_scattering_scale=w.rayleigh_scattering_scale,
        dust_storm=w.dust_storm,
    )


def encode_world_tick(frame: int, timestamp: float, actors: list[Any]) -> bytes:
    """Encode all actor transforms into the binary world tick format."""
    # bytearray.extend is O(N) total; the previous `buf += ...` loop
    # reallocated an immutable bytes object on every step (O(N²)).
    # Today `actors` is usually just [ego], but the loop runs every tick
    # (20Hz) — cheap to future-proof.
    buf = bytearray(struct.pack("<IdI", frame, timestamp, len(actors)))
    for actor in actors:
        t = actor.get_transform()
        v = actor.get_velocity()
        buf.extend(struct.pack(
            "<I9f",
            actor.id,
            t.location.x, t.location.y, t.location.z,
            t.rotation.pitch, t.rotation.yaw, t.rotation.roll,
            v.x, v.y, v.z,
        ))
    return bytes(buf)
