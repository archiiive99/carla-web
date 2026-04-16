"""Actor management endpoints."""

from __future__ import annotations

import asyncio
import contextlib
from typing import Any

from fastapi import APIRouter, HTTPException

from src.carla_client import carla_manager
from src.control_helpers import apply_vehicle_control
from src.models.schemas import (
    AutopilotRequest,
    LightStateRequest,
    SpawnSensorRequest,
    SpawnVehicleRequest,
    SpawnWalkerRequest,
    Transform,
    VehicleControl,
)
from src.utils.serialization import (
    dict_to_carla_transform,
    serialize_actor,
)

router = APIRouter(prefix="/api/actors", tags=["actors"])


def _require_connection() -> None:
    if not carla_manager.is_connected:
        raise HTTPException(status_code=503, detail="Not connected to CARLA server")


def _should_skip_actor(type_id: str) -> bool:
    """Filter actors that are noise for the frontend's actor list.

    Skips:
      * traffic.* without "light" (speed limits, stops, yields — 30-50
        entries per map, all read-only map fixtures, no UI interactions
        exist for them).
      * static.* (static.prop.mesh — typically 100+ per CARLA map, pure
        scenery: light poles, trees, trash cans, decorative props. They
        have no lifecycle the user can drive, but the old list included
        them in the frontend's "Other" group where they drowned the
        actionable actors and 4x'd the /api/actors payload.)
    """
    if type_id.startswith("traffic.") and "light" not in type_id:
        return True
    if type_id.startswith("static."):
        return True
    return False


@router.get("/count")
async def count_actors() -> Any:
    _require_connection()

    def _count() -> dict[str, Any]:
        return {"count": len(carla_manager.world.get_actors())}

    return await asyncio.to_thread(_count)


@router.get("")
async def list_actors() -> Any:
    _require_connection()
    from src.main import realtime_session

    def _get() -> dict[str, Any]:
        world = carla_manager.world
        actors = world.get_actors()
        seen_ids = set()
        result = []
        for a in actors:
            # Per-actor guard so one stale reference doesn't abort the whole
            # list. serialize_actor calls actor.get_transform() / get_velocity()
            # without an inner guard; a raising property on a single actor
            # used to bubble up as a 500, emptying the frontend's actor
            # panel even when most actors were fine. Matches the managed-
            # actors loop below.
            try:
                if _should_skip_actor(a.type_id):
                    continue
                seen_ids.add(a.id)
                result.append(serialize_actor(a).model_dump())
            except Exception:
                # Expected on stale references — skip this actor, keep the rest.
                pass
        # Fix CARLA inconsistency: get_actors() may not include managed/spawned actors
        missing_ids = set()
        if realtime_session.default_vehicle_id is not None:
            missing_ids.add(realtime_session.default_vehicle_id)
        missing_ids.update(carla_manager.tracked_actor_ids)
        for actor_id in missing_ids - seen_ids:
            try:
                managed = world.get_actor(actor_id)
                if managed is not None and getattr(managed, "is_alive", False):
                    if _should_skip_actor(managed.type_id):
                        continue
                    result.append(serialize_actor(managed).model_dump())
            except Exception:
                pass
        return {"actors": result, "count": len(result)}

    return await asyncio.to_thread(_get)


@router.delete("/all")
async def destroy_all_actors() -> Any:
    _require_connection()
    from src.main import realtime_session, sensor_manager

    await realtime_session.reset(destroy_managed=True, reason="destroy all actors")
    await sensor_manager.destroy_all()

    def _destroy_all() -> dict[str, Any]:
        try:
            world = carla_manager.world
            destroyed = 0
            # Per-actor guard so a single actor that's already dead
            # (e.g. destroyed externally between sensor_manager.destroy_all
            # and this call) doesn't abort the whole batch. Previously a
            # RuntimeError reading actor.type_id on a stale reference bubbled
            # up as a 500 and left the rest of the tracked actors alive.
            for actor_id in list(carla_manager.tracked_actor_ids):
                try:
                    actor = world.get_actor(actor_id)
                    if actor is None:
                        continue
                    # stop() failure used to skip destroy() via the outer
                    # except and leave the sensor actor alive on CARLA's
                    # side — same stop+destroy race pattern fixed in
                    # realtime_session and sensor_manager. Isolate the
                    # listener-unregister attempt so destroy() always runs.
                    if actor.type_id.startswith("sensor."):
                        with contextlib.suppress(Exception):
                            actor.stop()
                    actor.destroy()
                    destroyed += 1
                except Exception:
                    # Per-actor failure is expected on stale references;
                    # the frontend just wants a best-effort sweep.
                    pass
            carla_manager.clear_tracked_actors()
            return {"status": "destroyed", "count": destroyed}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e)) from e

    return await asyncio.to_thread(_destroy_all)


@router.get("/{actor_id}")
async def get_actor(actor_id: int) -> Any:
    _require_connection()

    def _get() -> Any:
        actor = carla_manager.world.get_actor(actor_id)
        if actor is None:
            raise HTTPException(status_code=404, detail=f"Actor {actor_id} not found")
        info = serialize_actor(actor).model_dump()
        if actor.type_id.startswith("vehicle."):
            ctrl = actor.get_control()
            info["control"] = {
                "throttle": ctrl.throttle,
                "steer": ctrl.steer,
                "brake": ctrl.brake,
                "hand_brake": ctrl.hand_brake,
                "reverse": ctrl.reverse,
                "gear": ctrl.gear,
            }
        return info

    return await asyncio.to_thread(_get)


@router.post("/spawn/vehicle", status_code=201)
async def spawn_vehicle(req: SpawnVehicleRequest) -> Any:
    _require_connection()

    def _spawn() -> Any:
        try:
            world = carla_manager.world
            bp_lib = world.get_blueprint_library()
            try:
                bp = bp_lib.find(req.blueprint)
            except Exception:
                raise HTTPException(status_code=400, detail=f"Blueprint not found: {req.blueprint}") from None
            if bp is None:
                raise HTTPException(status_code=400, detail=f"Blueprint not found: {req.blueprint}")
            transform = dict_to_carla_transform(req.transform)
            vehicle = world.try_spawn_actor(bp, transform)
            if vehicle is None:
                # Try random spawn points as fallback
                for sp in world.get_map().get_spawn_points()[:50]:
                    vehicle = world.try_spawn_actor(bp, sp)
                    if vehicle:
                        break
            if vehicle is None:
                raise HTTPException(status_code=400, detail="Could not spawn vehicle (all positions occupied)")
            carla_manager.track_actor(vehicle.id)
            if req.autopilot:
                # Traffic Manager may not be available — silent no-op if not.
                with contextlib.suppress(Exception):
                    vehicle.set_autopilot(True)
            return serialize_actor(vehicle).model_dump()
        except HTTPException:
            raise
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e)) from e

    return await asyncio.to_thread(_spawn)


@router.post("/spawn/walker", status_code=201)
async def spawn_walker(req: SpawnWalkerRequest) -> Any:
    _require_connection()

    def _spawn() -> Any:
        try:
            world = carla_manager.world
            bp_lib = world.get_blueprint_library()
            try:
                bp = bp_lib.find(req.blueprint)
            except Exception:
                raise HTTPException(status_code=400, detail=f"Blueprint not found: {req.blueprint}") from None
            if bp is None:
                raise HTTPException(status_code=400, detail=f"Blueprint not found: {req.blueprint}")
            transform = dict_to_carla_transform(req.transform)
            walker = world.try_spawn_actor(bp, transform)
            if walker is None:
                raise HTTPException(status_code=400, detail="Could not spawn walker (position occupied)")
            carla_manager.track_actor(walker.id)
            return serialize_actor(walker).model_dump()
        except HTTPException:
            raise
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e)) from e

    return await asyncio.to_thread(_spawn)


@router.post("/spawn/sensor", status_code=201)
async def spawn_sensor(req: SpawnSensorRequest) -> dict[str, Any]:
    _require_connection()
    from src.main import sensor_manager

    try:
        sensor_id = await sensor_manager.spawn_sensor(
            req.type,
            req.transform.model_dump(),
            req.parent_id,
            {k: str(v) for k, v in req.attributes.items()},
        )
        return {"id": sensor_id, "type": req.type, "parent_id": req.parent_id}
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.delete("/{actor_id}")
async def destroy_actor(actor_id: int) -> dict[str, Any]:
    _require_connection()
    from src.main import realtime_session, sensor_manager

    actor = await asyncio.to_thread(carla_manager.get_actor, actor_id)
    if actor is None:
        raise HTTPException(status_code=404, detail=f"Actor {actor_id} not found")

    # CARLA-managed actors that aren't lifecycle-owned by the bridge: the
    # spectator (id=1, represents the native UE5 viewport camera), traffic
    # lights, and traffic signs. actor.destroy() on any of these raises
    # inside CARLA and surfaced as a generic 500. Return a clean 400 so
    # callers (including curl / scripts) get a meaningful error — the
    # frontend already hides the Destroy button for these types, this
    # plugs the direct-API hole.
    type_id = actor.type_id
    if (
        type_id == "spectator"
        or type_id.startswith("traffic.traffic_light")
        or (type_id.startswith("traffic.") and "light" not in type_id)
    ):
        raise HTTPException(
            status_code=400,
            detail=f"Actor {actor_id} ({type_id}) is a CARLA map fixture and cannot be destroyed",
        )

    if actor.type_id.startswith("sensor."):
        await sensor_manager.destroy_sensor(actor_id)
    else:
        # Side-effect only; the final response dict is composed outside
        # (previously built inside too, but that return was discarded by
        # `await asyncio.to_thread(_destroy)`).
        def _destroy() -> None:
            try:
                current_actor = carla_manager.world.get_actor(actor_id)
                if current_actor is None:
                    raise HTTPException(status_code=404, detail=f"Actor {actor_id} not found")
                current_actor.destroy()
                carla_manager.untrack_actor(actor_id)
            except HTTPException:
                raise
            except RuntimeError as e:
                raise HTTPException(status_code=400, detail=str(e)) from e
            except Exception as e:
                raise HTTPException(status_code=500, detail=str(e)) from e

        await asyncio.to_thread(_destroy)

    await realtime_session.invalidate_actor(actor_id, reason=f"actor {actor_id} destroyed")
    return {"status": "destroyed", "id": actor_id}


@router.post("/{actor_id}/control")
async def apply_control(actor_id: int, req: VehicleControl) -> Any:
    _require_connection()

    def _ctrl() -> dict[str, Any]:
        try:
            import carla

            actor = carla_manager.world.get_actor(actor_id)
            if actor is None:
                raise HTTPException(status_code=404, detail=f"Actor {actor_id} not found")
            apply_vehicle_control(actor, req, carla)
            # Do NOT tick here — the background _world_tick_loop in main.py
            # is the single tick source.  A second tick() call races with
            # the loop and can cause CARLA to consume the control before
            # physics actually applies it, resulting in near-zero movement.
            return {"status": "control_applied", "id": actor_id}
        except HTTPException:
            raise
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e)) from e

    return await asyncio.to_thread(_ctrl)


@router.post("/{actor_id}/autopilot")
async def set_autopilot(actor_id: int, req: AutopilotRequest) -> Any:
    _require_connection()

    def _set() -> dict[str, Any]:
        try:
            actor = carla_manager.world.get_actor(actor_id)
            if actor is None:
                raise HTTPException(status_code=404, detail=f"Actor {actor_id} not found")
            # set_autopilot is a vehicle-only API — calling it on a walker
            # or sensor raises AttributeError and surfaced as a generic
            # 500. Mirror apply_control's 400 so the error message tells
            # the caller what actually went wrong.
            if not getattr(actor, "type_id", "").startswith("vehicle."):
                raise HTTPException(status_code=400, detail="Actor is not a vehicle")
            actor.set_autopilot(req.enabled, req.tm_port)
            return {"status": "autopilot_set", "enabled": req.enabled}
        except HTTPException:
            raise
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e)) from e

    return await asyncio.to_thread(_set)


@router.post("/{actor_id}/transform")
async def set_transform(actor_id: int, req: Transform) -> Any:
    _require_connection()

    def _set() -> dict[str, Any]:
        try:
            actor = carla_manager.world.get_actor(actor_id)
            if actor is None:
                raise HTTPException(status_code=404, detail=f"Actor {actor_id} not found")
            t = dict_to_carla_transform(req)
            actor.set_transform(t)
            return {"status": "transform_set", "id": actor_id}
        except HTTPException:
            raise
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e)) from e

    return await asyncio.to_thread(_set)


@router.post("/{actor_id}/lights")
async def set_lights(actor_id: int, req: LightStateRequest) -> Any:
    _require_connection()

    def _set() -> dict[str, Any]:
        try:
            import carla

            actor = carla_manager.world.get_actor(actor_id)
            if actor is None:
                raise HTTPException(status_code=404, detail=f"Actor {actor_id} not found")
            # set_light_state is vehicle-only — same rationale as
            # set_autopilot above.
            if not getattr(actor, "type_id", "").startswith("vehicle."):
                raise HTTPException(status_code=400, detail="Actor is not a vehicle")
            actor.set_light_state(carla.VehicleLightState(req.light_state))
            return {"status": "lights_set", "id": actor_id}
        except HTTPException:
            raise
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e)) from e

    return await asyncio.to_thread(_set)


@router.get("/{actor_id}/bounding-box")
async def get_bounding_box(actor_id: int) -> Any:
    _require_connection()

    def _get() -> dict[str, Any]:
        actor = carla_manager.world.get_actor(actor_id)
        if actor is None:
            raise HTTPException(status_code=404, detail=f"Actor {actor_id} not found")
        bb = actor.bounding_box
        return {
            "extent": {"x": bb.extent.x, "y": bb.extent.y, "z": bb.extent.z},
            "location": {"x": bb.location.x, "y": bb.location.y, "z": bb.location.z},
            "rotation": {
                "pitch": bb.rotation.pitch,
                "yaw": bb.rotation.yaw,
                "roll": bb.rotation.roll,
            },
        }

    return await asyncio.to_thread(_get)
