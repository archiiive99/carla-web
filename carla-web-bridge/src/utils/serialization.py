"""Data conversion helpers for CARLA types to Pydantic models."""

from __future__ import annotations

import struct
from typing import Any

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
    """Convert Transform schema to carla.Transform. Must be called from thread."""
    import carla

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
    return ActorInfo(
        id=actor.id,
        type_id=actor.type_id,
        type=classify_actor(actor.type_id),
        transform=carla_transform_to_dict(t),
        velocity=carla_vector_to_dict(v),
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
    buf = struct.pack("<IdI", frame, timestamp, len(actors))
    for actor in actors:
        t = actor.get_transform()
        v = actor.get_velocity()
        buf += struct.pack(
            "<I9f",
            actor.id,
            t.location.x, t.location.y, t.location.z,
            t.rotation.pitch, t.rotation.yaw, t.rotation.roll,
            v.x, v.y, v.z,
        )
    return buf
