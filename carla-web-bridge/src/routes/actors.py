"""Actor management endpoints."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException

from src.carla_client import carla_manager
from src.control_helpers import apply_vehicle_control
from src.models.schemas import (
    ActorInfo,
    AutopilotRequest,
    LightStateRequest,
    SpawnSensorRequest,
    SpawnVehicleRequest,
    SpawnWalkerRequest,
    Transform,
    VehicleControl,
)
from src.utils.serialization import (
    carla_transform_to_dict,
    carla_vector_to_dict,
    classify_actor,
    dict_to_carla_transform,
    serialize_actor,
)

router = APIRouter(prefix="/api/actors", tags=["actors"])


def _require_connection() -> None:
    if not carla_manager.is_connected:
        raise HTTPException(status_code=503, detail="Not connected to CARLA server")


@router.get("/count")
async def count_actors():
    _require_connection()

    def _count():
        return {"count": len(carla_manager.world.get_actors())}

    return await asyncio.to_thread(_count)


@router.get("")
async def list_actors():
    _require_connection()
    from src.main import realtime_session

    def _get():
        world = carla_manager.world
        actors = world.get_actors()
        seen_ids = set()
        result = []
        for a in actors:
            if a.type_id.startswith("traffic.") and "light" not in a.type_id:
                continue
            seen_ids.add(a.id)
            result.append(serialize_actor(a).model_dump())
        # Fix CARLA inconsistency: get_actors() may not include managed/spawned actors
        missing_ids = set()
        if realtime_session.default_vehicle_id is not None:
            missing_ids.add(realtime_session.default_vehicle_id)
        if realtime_session.default_camera_id is not None:
            missing_ids.add(realtime_session.default_camera_id)
        missing_ids.update(carla_manager.tracked_actor_ids)
        for actor_id in missing_ids - seen_ids:
            try:
                managed = world.get_actor(actor_id)
                if managed is not None and getattr(managed, "is_alive", False):
                    if managed.type_id.startswith("traffic.") and "light" not in managed.type_id:
                        continue
                    result.append(serialize_actor(managed).model_dump())
            except Exception:
                pass
        return {"actors": result, "count": len(result)}

    return await asyncio.to_thread(_get)


@router.delete("/all")
async def destroy_all_actors():
    _require_connection()
    from src.main import realtime_session, sensor_manager

    await realtime_session.reset(destroy_managed=True, reason="destroy all actors")
    await sensor_manager.destroy_all()

    def _destroy_all():
        try:
            world = carla_manager.world
            destroyed = 0
            for actor_id in list(carla_manager._spawned_actor_ids):
                actor = world.get_actor(actor_id)
                if actor:
                    if actor.type_id.startswith("sensor."):
                        actor.stop()
                    actor.destroy()
                    destroyed += 1
            carla_manager.clear_tracked_actors()
            return {"status": "destroyed", "count": destroyed}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return await asyncio.to_thread(_destroy_all)


@router.get("/{actor_id}")
async def get_actor(actor_id: int):
    _require_connection()

    def _get():
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
async def spawn_vehicle(req: SpawnVehicleRequest):
    _require_connection()

    def _spawn():
        try:
            import carla

            world = carla_manager.world
            bp_lib = world.get_blueprint_library()
            try:
                bp = bp_lib.find(req.blueprint)
            except Exception:
                raise HTTPException(status_code=400, detail=f"Blueprint not found: {req.blueprint}")
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
                try:
                    vehicle.set_autopilot(True)
                except Exception:
                    pass  # Traffic Manager may not be available
            return serialize_actor(vehicle).model_dump()
        except HTTPException:
            raise
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return await asyncio.to_thread(_spawn)


@router.post("/spawn/walker", status_code=201)
async def spawn_walker(req: SpawnWalkerRequest):
    _require_connection()

    def _spawn():
        try:
            import carla

            world = carla_manager.world
            bp_lib = world.get_blueprint_library()
            try:
                bp = bp_lib.find(req.blueprint)
            except Exception:
                raise HTTPException(status_code=400, detail=f"Blueprint not found: {req.blueprint}")
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
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return await asyncio.to_thread(_spawn)


@router.post("/spawn/sensor", status_code=201)
async def spawn_sensor(req: SpawnSensorRequest):
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
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{actor_id}")
async def destroy_actor(actor_id: int):
    _require_connection()
    from src.main import realtime_session, sensor_manager

    actor = await asyncio.to_thread(carla_manager.get_actor, actor_id)
    if actor is None:
        raise HTTPException(status_code=404, detail=f"Actor {actor_id} not found")

    if actor.type_id.startswith("sensor."):
        await sensor_manager.destroy_sensor(actor_id)
    else:
        def _destroy():
            try:
                current_actor = carla_manager.world.get_actor(actor_id)
                if current_actor is None:
                    raise HTTPException(status_code=404, detail=f"Actor {actor_id} not found")
                current_actor.destroy()
                carla_manager.untrack_actor(actor_id)
                return {"status": "destroyed", "id": actor_id}
            except HTTPException:
                raise
            except RuntimeError as e:
                raise HTTPException(status_code=400, detail=str(e))
            except Exception as e:
                raise HTTPException(status_code=500, detail=str(e))

        await asyncio.to_thread(_destroy)

    await realtime_session.invalidate_actor(actor_id, reason=f"actor {actor_id} destroyed")
    return {"status": "destroyed", "id": actor_id}


@router.post("/{actor_id}/control")
async def apply_control(actor_id: int, req: VehicleControl):
    _require_connection()

    def _ctrl():
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
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return await asyncio.to_thread(_ctrl)


@router.post("/{actor_id}/autopilot")
async def set_autopilot(actor_id: int, req: AutopilotRequest):
    _require_connection()

    def _set():
        try:
            actor = carla_manager.world.get_actor(actor_id)
            if actor is None:
                raise HTTPException(status_code=404, detail=f"Actor {actor_id} not found")
            actor.set_autopilot(req.enabled, req.tm_port)
            return {"status": "autopilot_set", "enabled": req.enabled}
        except HTTPException:
            raise
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return await asyncio.to_thread(_set)


@router.post("/{actor_id}/transform")
async def set_transform(actor_id: int, req: Transform):
    _require_connection()

    def _set():
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
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return await asyncio.to_thread(_set)


@router.post("/{actor_id}/lights")
async def set_lights(actor_id: int, req: LightStateRequest):
    _require_connection()

    def _set():
        try:
            import carla

            actor = carla_manager.world.get_actor(actor_id)
            if actor is None:
                raise HTTPException(status_code=404, detail=f"Actor {actor_id} not found")
            actor.set_light_state(carla.VehicleLightState(req.light_state))
            return {"status": "lights_set", "id": actor_id}
        except HTTPException:
            raise
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return await asyncio.to_thread(_set)


@router.post("/{actor_id}/physics")
async def set_physics(actor_id: int, params: dict):
    _require_connection()
    return {"status": "physics_updated", "id": actor_id, "note": "Not yet implemented"}


@router.get("/{actor_id}/bounding-box")
async def get_bounding_box(actor_id: int):
    _require_connection()

    def _get():
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
