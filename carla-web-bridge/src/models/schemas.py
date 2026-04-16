"""Pydantic models for REST API request/response validation."""

from __future__ import annotations

from pydantic import BaseModel, Field

# --- Common ---


class Vector3(BaseModel):
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0


class Rotation(BaseModel):
    pitch: float = 0.0
    yaw: float = 0.0
    roll: float = 0.0


class Transform(BaseModel):
    location: Vector3 = Field(default_factory=Vector3)
    rotation: Rotation = Field(default_factory=Rotation)


# --- Simulation ---


class SimulationStatus(BaseModel):
    connected: bool
    running: bool = False
    paused: bool = False
    tick: int = 0
    elapsed_time: float = 0.0
    map: str = ""
    sync_mode: bool = False
    fixed_delta: float | None = 0.0
    server_version: str = ""


class SimulationSettings(BaseModel):
    sync_mode: bool | None = None
    # CARLA's physics are only stable within ~(0.001, 1.0) seconds per
    # tick. Accepting anything outside that range silently configures an
    # unusable sim — fixed_delta=999.0 passes through to apply_settings
    # and leaves physics completely broken. Clamp at the boundary of
    # "theoretically usable" rather than "recommended" (which is 0.01-0.1),
    # so front-ends with a wider UI range still work but a typoed
    # mega-value trips 422 at the schema.
    fixed_delta: float | None = Field(None, gt=0.0, le=1.0)
    no_rendering: bool | None = None
    substepping: bool | None = None
    max_substep_delta: float | None = Field(None, gt=0.0, le=1.0)
    max_substeps: int | None = Field(None, ge=1, le=100)


# --- Weather ---


class WeatherParams(BaseModel):
    cloudiness: float = 0.0
    precipitation: float = 0.0
    precipitation_deposits: float = 0.0
    wind_intensity: float = 0.0
    sun_azimuth_angle: float = 0.0
    sun_altitude_angle: float = 0.0
    fog_density: float = 0.0
    fog_distance: float = 0.0
    fog_falloff: float = 0.0
    wetness: float = 0.0
    scattering_intensity: float = 0.0
    mie_scattering_scale: float = 0.0
    rayleigh_scattering_scale: float = 0.0
    dust_storm: float = 0.0


class SetWeatherRequest(BaseModel):
    preset: str | None = None
    params: WeatherParams | None = None


# --- Actors ---


class ActorInfo(BaseModel):
    id: int
    type_id: str
    type: str = ""  # "vehicle", "walker", "sensor", "traffic_light", "other"
    transform: Transform = Field(default_factory=Transform)
    velocity: Vector3 = Field(default_factory=Vector3)
    # is_alive field dropped — serialize_actor never passed it, so every
    # response hardcoded True. The frontend also removed its mirror of
    # the field from CarlaActor. If actor-liveness ever needs to be
    # surfaced, derive it from `getattr(actor, "is_alive", False)` in
    # serialize_actor and re-add here.
    parent_id: int | None = None
    role_name: str | None = None
    traffic_light_state: str | None = None  # "Red"|"Yellow"|"Green"|"Off"|"Unknown" for TL actors
    vehicle_color: str | None = None
    vehicle_driver_id: str | None = None
    vehicle_generation: str | None = None
    vehicle_wheel_count: int | None = None


class SpawnVehicleRequest(BaseModel):
    blueprint: str
    transform: Transform = Field(default_factory=Transform)
    autopilot: bool = False


class SpawnWalkerRequest(BaseModel):
    blueprint: str
    transform: Transform = Field(default_factory=Transform)


class SpawnSensorRequest(BaseModel):
    type: str
    transform: Transform = Field(default_factory=Transform)
    parent_id: int = 0
    attributes: dict[str, str | int | float] = Field(default_factory=dict)


class VehicleControl(BaseModel):
    throttle: float = 0.0
    steer: float = 0.0
    brake: float = 0.0
    hand_brake: bool = False
    reverse: bool = False


class AutopilotRequest(BaseModel):
    enabled: bool = True
    tm_port: int = 8000


class LightStateRequest(BaseModel):
    light_state: int = 0


# --- Traffic Manager ---


class TrafficStatus(BaseModel):
    port: int = 8000
    active: bool = False
    # Note: global_speed_diff used to be here but was never populated by
    # /api/traffic/status — the endpoint returns a fixed (port, active)
    # stub and no consumer reads the value. If the Traffic Manager ever
    # exposes a readable speed-diff state, re-add here and derive it
    # from tm in the endpoint.


class GlobalSpeedRequest(BaseModel):
    speed_diff: float


class VehicleSpeedRequest(BaseModel):
    speed_diff: float


class LaneChangeRequest(BaseModel):
    force_lane_change: bool = False
    auto_lane_change: bool = True
    # tm.vehicle_lane_offset treats -1.0 as the right lane edge and 1.0
    # as the left. Out-of-range values drift the vehicle onto the
    # shoulder or into oncoming traffic. Bound at the schema so a typo
    # like 5.0 returns 422 rather than causing a collision.
    lane_offset: float = Field(0.0, ge=-1.0, le=1.0)


class IgnoreRequest(BaseModel):
    # All four are percentages in [0, 100] per CARLA's TM docs. CARLA
    # clips internally but validating upstream gives the caller a
    # meaningful 422 on obvious typos (e.g. 1000 meaning "very much").
    lights: float = Field(0.0, ge=0.0, le=100.0)
    signs: float = Field(0.0, ge=0.0, le=100.0)
    walkers: float = Field(0.0, ge=0.0, le=100.0)
    vehicles: float = Field(0.0, ge=0.0, le=100.0)


class RouteRequest(BaseModel):
    waypoints: list[Vector3]


# --- Blueprints ---


class BlueprintAttribute(BaseModel):
    id: str
    type: str
    value: str
    recommended_values: list[str] = Field(default_factory=list)


class BlueprintInfo(BaseModel):
    id: str
    tags: list[str] = Field(default_factory=list)
    attributes: list[BlueprintAttribute] = Field(default_factory=list)


# --- Recording ---


class StartRecordingRequest(BaseModel):
    filename: str


class StartReplayRequest(BaseModel):
    filename: str
    start_time: float = 0.0
    duration: float = 0.0
    camera_id: int = 0


# --- Map / Navigation ---


class LoadMapRequest(BaseModel):
    map_name: str


class MapLayerRequest(BaseModel):
    layer: str
    action: str = "load"  # "load" or "unload"


class RouteQueryRequest(BaseModel):
    origin: Vector3
    destination: Vector3


