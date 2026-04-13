"""World and map endpoints."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException

from src.carla_client import carla_manager
from src.models.schemas import (
    LoadMapRequest,
    MapLayerRequest,
    SetWeatherRequest,
    Transform,
    WeatherParams,
    WeatherPreset,
)
from src.utils.serialization import (
    carla_transform_to_dict,
    dict_to_carla_transform,
    serialize_actor,
    serialize_weather,
)

router = APIRouter(prefix="/api/world", tags=["world"])


def _require_connection() -> None:
    if not carla_manager.is_connected:
        raise HTTPException(status_code=503, detail="Not connected to CARLA server")


# --- Weather presets (CARLA built-in) ---
WEATHER_PRESETS: dict[str, str] = {
    "ClearNoon": "ClearNoon",
    "CloudyNoon": "CloudyNoon",
    "WetNoon": "WetNoon",
    "WetCloudyNoon": "WetCloudyNoon",
    "MidRainyNoon": "MidRainyNoon",
    "HardRainNoon": "HardRainNoon",
    "SoftRainNoon": "SoftRainNoon",
    "ClearSunset": "ClearSunset",
    "CloudySunset": "CloudySunset",
    "WetSunset": "WetSunset",
    "WetCloudySunset": "WetCloudySunset",
    "MidRainSunset": "MidRainSunset",
    "HardRainSunset": "HardRainSunset",
    "SoftRainSunset": "SoftRainSunset",
    "ClearNight": "ClearNight",
    "CloudyNight": "CloudyNight",
    "WetNight": "WetNight",
    "WetCloudyNight": "WetCloudyNight",
    "SoftRainNight": "SoftRainNight",
    "MidRainyNight": "MidRainyNight",
    "HardRainNight": "HardRainNight",
    "DustStorm": "DustStorm",
}


@router.get("/maps")
async def list_maps():
    _require_connection()

    def _get():
        maps = carla_manager.client.get_available_maps()
        return {"maps": [m.split("/")[-1] for m in maps]}

    return await asyncio.to_thread(_get)


@router.post("/load")
async def load_map(req: LoadMapRequest):
    _require_connection()

    def _load():
        carla_manager.client.load_world(req.map_name)
        return {"status": "loaded", "map": req.map_name}

    return await asyncio.to_thread(_load)


@router.get("/weather", response_model=WeatherParams)
async def get_weather():
    _require_connection()

    def _get():
        w = carla_manager.world.get_weather()
        return serialize_weather(w)

    return await asyncio.to_thread(_get)


@router.post("/weather")
async def set_weather(req: SetWeatherRequest):
    _require_connection()

    def _set():
        try:
            import carla

            world = carla_manager.world
            if req.preset and req.preset in WEATHER_PRESETS:
                weather = getattr(carla.WeatherParameters, req.preset, None)
                if weather:
                    world.set_weather(weather)
                    return {"status": "preset_applied", "preset": req.preset}
            if req.params:
                w = carla.WeatherParameters(
                    cloudiness=req.params.cloudiness,
                    precipitation=req.params.precipitation,
                    precipitation_deposits=req.params.precipitation_deposits,
                    wind_intensity=req.params.wind_intensity,
                    sun_azimuth_angle=req.params.sun_azimuth_angle,
                    sun_altitude_angle=req.params.sun_altitude_angle,
                    fog_density=req.params.fog_density,
                    fog_distance=req.params.fog_distance,
                    fog_falloff=req.params.fog_falloff,
                    wetness=req.params.wetness,
                    scattering_intensity=req.params.scattering_intensity,
                    mie_scattering_scale=req.params.mie_scattering_scale,
                    rayleigh_scattering_scale=req.params.rayleigh_scattering_scale,
                    dust_storm=req.params.dust_storm,
                )
                world.set_weather(w)
                return {"status": "params_applied"}
            raise HTTPException(status_code=400, detail="Provide preset or params")
        except HTTPException:
            raise
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return await asyncio.to_thread(_set)


@router.get("/weather/presets")
async def list_weather_presets():
    return {"presets": list(WEATHER_PRESETS.keys())}


@router.get("/spectator")
async def get_spectator():
    _require_connection()

    def _get():
        spec = carla_manager.world.get_spectator()
        return serialize_actor(spec).model_dump()

    return await asyncio.to_thread(_get)


@router.post("/spectator")
async def set_spectator(req: Transform):
    _require_connection()

    def _set():
        try:
            spec = carla_manager.world.get_spectator()
            t = dict_to_carla_transform(req)
            spec.set_transform(t)
            return {"status": "ok"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return await asyncio.to_thread(_set)


@router.get("/spawn-points")
async def get_spawn_points():
    _require_connection()

    def _get():
        points = carla_manager.world.get_map().get_spawn_points()
        return {
            "spawn_points": [carla_transform_to_dict(sp).model_dump() for sp in points]
        }

    return await asyncio.to_thread(_get)


@router.post("/map-layers")
async def manage_map_layer(req: MapLayerRequest):
    _require_connection()

    def _manage():
        import carla

        layer_map = {
            "buildings": carla.MapLayer.Buildings,
            "decals": carla.MapLayer.Decals,
            "foliage": carla.MapLayer.Foliage,
            "ground": carla.MapLayer.Ground,
            "parked_vehicles": carla.MapLayer.ParkedVehicles,
            "particles": carla.MapLayer.Particles,
            "props": carla.MapLayer.Props,
            "street_lights": carla.MapLayer.StreetLights,
            "walls": carla.MapLayer.Walls,
            "all": carla.MapLayer.All,
        }
        layer = layer_map.get(req.layer.lower())
        if layer is None:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown layer: {req.layer}. Valid: {list(layer_map.keys())}",
            )
        if req.action == "load":
            carla_manager.world.load_map_layer(layer)
        elif req.action == "unload":
            carla_manager.world.unload_map_layer(layer)
        else:
            raise HTTPException(status_code=400, detail="action must be 'load' or 'unload'")
        return {"status": f"layer {req.layer} {req.action}ed"}

    return await asyncio.to_thread(_manage)
