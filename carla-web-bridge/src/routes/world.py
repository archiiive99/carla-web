"""World and map endpoints."""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, HTTPException

from src.carla_client import carla_manager
from src.models.schemas import (
    LoadMapRequest,
    MapLayerRequest,
    SetWeatherRequest,
    Transform,
    WeatherParams,
)
from src.utils.serialization import (
    carla_transform_to_dict,
    dict_to_carla_transform,
    serialize_weather,
)

router = APIRouter(prefix="/api/world", tags=["world"])


def _require_connection() -> None:
    if not carla_manager.is_connected:
        raise HTTPException(status_code=503, detail="Not connected to CARLA server")


# --- Weather presets (CARLA built-in) ---
# Ordered tuple so /api/world/weather/presets returns presets in a
# UX-sensible Noon → Sunset → Night progression. Previously a
# `dict[str, str]` whose values just duplicated the keys — every
# consumer used it as an ordered set (membership test + .keys()), so
# the redundant values were dead weight.
WEATHER_PRESETS: tuple[str, ...] = (
    "ClearNoon",
    "CloudyNoon",
    "WetNoon",
    "WetCloudyNoon",
    "MidRainyNoon",
    "HardRainNoon",
    "SoftRainNoon",
    "ClearSunset",
    "CloudySunset",
    "WetSunset",
    "WetCloudySunset",
    "MidRainSunset",
    "HardRainSunset",
    "SoftRainSunset",
    "ClearNight",
    "CloudyNight",
    "WetNight",
    "WetCloudyNight",
    "SoftRainNight",
    "MidRainyNight",
    "HardRainNight",
    "DustStorm",
)


@router.get("/maps")
async def list_maps() -> Any:
    _require_connection()

    def _get() -> dict[str, Any]:
        maps = carla_manager.client.get_available_maps()
        # Filter CARLA-internal templates + Town15 sublevel fragments.
        # `get_available_maps()` returns every .umap under /Game/Carla/Maps
        # including generator templates (BaseMap, DigitalTwinsTemplate,
        # MapGeneratorBaseMap, …) and Town15's streaming sublevels
        # (Town15_Vegetation, Town15_Buildings, …). Loading any of those
        # 500s the bridge — they aren't playable worlds — and offering
        # them in the frontend dropdown is a trap.
        _TEMPLATE_NAMES = {
            "BaseMap",
            "BaseTileEmpty",
            "DigitalTwinsTemplate",
            "DigitalTwinMap",
            "MapGeneratorBaseMap",
            "MapGeneratorBaseLargeMap",
            "RiverPreset01",
        }
        filtered: list[str] = []
        for m in maps:
            basename = m.split("/")[-1]
            if basename in _TEMPLATE_NAMES:
                continue
            # Town15 itself is playable; its _Vegetation/_Buildings/
            # _Roads/_Props/_Decals/_RepSplinesCaps/_YieldBoxes sublevels
            # are not. Pattern is stable across CARLA 0.9.x/0.10.x.
            if basename.startswith("Town15_"):
                continue
            filtered.append(basename)
        return {"maps": filtered}

    return await asyncio.to_thread(_get)


@router.post("/load")
async def load_map(req: LoadMapRequest) -> Any:
    _require_connection()
    from src.main import realtime_session, sensor_manager

    await realtime_session.reset(destroy_managed=True, reason=f"load map {req.map_name}")
    await sensor_manager.destroy_all()
    carla_manager.clear_tracked_actors()

    def _load() -> dict[str, Any]:
        try:
            carla_manager.client.load_world(req.map_name)
            # Refresh the cached world reference. Without this, the main
            # _world_tick_loop and any route handler that reads
            # `carla_manager.world` keeps the pre-load reference — which
            # errors on tick() until the next 5-second heartbeat catches
            # up. Users saw the sim freeze for up to 5s after a map load
            # despite the endpoint returning 200.
            carla_manager.refresh_world()
            return {"status": "loaded", "map": req.map_name}
        except RuntimeError as e:
            # CARLA raises RuntimeError for invalid map name. Surface the
            # detail so the frontend's "Map load failed: ..." toast is
            # informative instead of a generic 500.
            raise HTTPException(status_code=400, detail=str(e)) from e
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e)) from e

    return await asyncio.to_thread(_load)


@router.get("/weather", response_model=WeatherParams)
async def get_weather() -> Any:
    _require_connection()

    def _get() -> Any:
        w = carla_manager.world.get_weather()
        return serialize_weather(w)

    return await asyncio.to_thread(_get)


@router.post("/weather")
async def set_weather(req: SetWeatherRequest) -> Any:
    _require_connection()

    def _set() -> dict[str, Any]:
        try:
            import carla

            world = carla_manager.world
            if req.preset:
                if req.preset not in WEATHER_PRESETS:
                    # Reject unknown preset names up front so the user sees
                    # "Unknown weather preset: ..." instead of falling through
                    # to the generic "Provide preset or params" error — which
                    # was misleading because the user DID provide a preset,
                    # it just wasn't in the bridge's allow-list.
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Unknown weather preset: {req.preset}. "
                            f"Valid: {', '.join(WEATHER_PRESETS)}"
                        ),
                    )
                weather = getattr(carla.WeatherParameters, req.preset, None)
                if weather is None:
                    # Accepted by the bridge's allow-list but missing from the
                    # running CARLA build — e.g., we added a preset to
                    # WEATHER_PRESETS that only exists on a newer CARLA. 501
                    # "not implemented" flags it as a server-side gap rather
                    # than masking it as a bad request.
                    raise HTTPException(
                        status_code=501,
                        detail=f"Weather preset {req.preset} not available in this CARLA build",
                    )
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
            raise HTTPException(status_code=400, detail=str(e)) from e
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e)) from e

    return await asyncio.to_thread(_set)


@router.get("/weather/presets")
async def list_weather_presets() -> dict[str, Any]:
    return {"presets": list(WEATHER_PRESETS)}


@router.get("/spectator")
async def get_spectator() -> dict[str, Any]:
    _require_connection()

    # Match every other route in this file: CARLA RPC runs off the event
    # loop so a slow round-trip doesn't stall WS broadcasts / health polls.
    # Previously this awaited nothing and executed synchronously on the
    # loop thread, which showed up as brief tick-rate dips whenever the
    # ActorDetails mount-time probe fired.
    def _get() -> dict[str, Any]:
        try:
            spec = carla_manager.world.get_spectator()
            return {"transform": carla_transform_to_dict(spec.get_transform()).model_dump()}
        except RuntimeError as e:
            raise HTTPException(
                status_code=501,
                detail="Spectator API unavailable in current CARLA runtime",
            ) from e

    return await asyncio.to_thread(_get)


@router.post("/spectator")
async def set_spectator(req: Transform) -> dict[str, Any]:
    _require_connection()

    def _set() -> dict[str, Any]:
        try:
            spec = carla_manager.world.get_spectator()
            t = dict_to_carla_transform(req)
            spec.set_transform(t)
            return {"status": "ok"}
        except RuntimeError as e:
            raise HTTPException(
                status_code=501,
                detail="Spectator API unavailable in current CARLA runtime",
            ) from e
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e)) from e

    return await asyncio.to_thread(_set)


@router.get("/spawn-points")
async def get_spawn_points() -> Any:
    _require_connection()

    def _get() -> dict[str, Any]:
        points = carla_manager.world.get_map().get_spawn_points()
        return {
            "spawn_points": [carla_transform_to_dict(sp).model_dump() for sp in points]
        }

    return await asyncio.to_thread(_get)


@router.post("/map-layers")
async def manage_map_layer(req: MapLayerRequest) -> Any:
    _require_connection()

    def _manage() -> dict[str, Any]:
        try:
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
            # req.action is Literal["load", "unload"] — schema rejects anything
            # else upstream, so no else-branch needed here.
            if req.action == "load":
                carla_manager.world.load_map_layer(layer)
            else:
                carla_manager.world.unload_map_layer(layer)
            return {"status": f"layer {req.layer} {req.action}ed"}
        except HTTPException:
            raise
        except RuntimeError as e:
            # CARLA's load/unload can raise when called at the wrong moment
            # (map change mid-request, world locked). Surface the detail so
            # the frontend toast gets "Layer load failed: <why>" instead of
            # a bare 500 with no body — matches load_map / set_weather.
            raise HTTPException(status_code=400, detail=str(e)) from e
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e)) from e

    return await asyncio.to_thread(_manage)
