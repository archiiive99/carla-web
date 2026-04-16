"""Shared helpers for native CARLA vehicle control application."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from src.models.schemas import VehicleControl


def apply_vehicle_control(
    actor: Any,
    req: VehicleControl,
    carla_module: Any,
    *,
    disable_autopilot: bool = True,
) -> None:
    if actor is None:
        raise HTTPException(status_code=404, detail="Actor not found")
    if not getattr(actor, "type_id", "").startswith("vehicle."):
        raise HTTPException(status_code=400, detail="Actor is not a vehicle")
    if disable_autopilot:
        try:
            actor.set_autopilot(False)
        except Exception:
            pass
    ctrl = carla_module.VehicleControl(
        throttle=req.throttle,
        steer=req.steer,
        brake=req.brake,
        hand_brake=req.hand_brake,
        reverse=req.reverse,
    )
    actor.apply_control(ctrl)
