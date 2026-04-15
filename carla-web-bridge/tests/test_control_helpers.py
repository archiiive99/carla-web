from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from src.control_helpers import apply_vehicle_control
from src.models.schemas import VehicleControl


class _Actor:
    type_id = "vehicle.tesla.model3"

    def __init__(self) -> None:
        self.calls: list[tuple[str, object]] = []

    def set_autopilot(self, enabled: bool) -> None:
        self.calls.append(("autopilot", enabled))

    def apply_control(self, ctrl) -> None:
        self.calls.append(("control", ctrl.kwargs))


class _VehicleControlShim:
    def __init__(self, **kwargs) -> None:
        self.kwargs = kwargs


def test_apply_vehicle_control_disables_autopilot_and_applies_control() -> None:
    actor = _Actor()
    req = VehicleControl(throttle=0.7, steer=-0.2, brake=0.0, hand_brake=False, reverse=False)

    apply_vehicle_control(actor, req, SimpleNamespace(VehicleControl=_VehicleControlShim))

    assert actor.calls == [
        ("autopilot", False),
        (
            "control",
            {
                "throttle": 0.7,
                "steer": -0.2,
                "brake": 0.0,
                "hand_brake": False,
                "reverse": False,
            },
        ),
    ]


def test_apply_vehicle_control_rejects_non_vehicle() -> None:
    actor = SimpleNamespace(type_id="walker.pedestrian.0001")
    req = VehicleControl(throttle=0.1, steer=0.0, brake=0.0, hand_brake=False, reverse=False)

    with pytest.raises(HTTPException) as exc:
        apply_vehicle_control(actor, req, SimpleNamespace(VehicleControl=_VehicleControlShim))

    assert exc.value.status_code == 400
