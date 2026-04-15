from src.utils.serialization import serialize_actor


class _Location:
    x = 1.0
    y = 2.0
    z = 3.0


class _Rotation:
    pitch = 4.0
    yaw = 5.0
    roll = 6.0


class _Transform:
    location = _Location()
    rotation = _Rotation()


class _Velocity:
    x = 0.1
    y = 0.2
    z = 0.3


class _Actor:
    id = 123
    type_id = "vehicle.tesla.model3"
    parent = None
    attributes = {
      "role_name": "bridge_ego",
      "color": "255,0,0",
      "driver_id": "alpha",
      "generation": "2",
      "number_of_wheels": "4",
    }

    def get_transform(self):
        return _Transform()

    def get_velocity(self):
        return _Velocity()


def test_serialize_actor_includes_vehicle_appearance_fields():
    out = serialize_actor(_Actor())
    assert out.id == 123
    assert out.role_name == "bridge_ego"
    assert out.vehicle_color == "255,0,0"
    assert out.vehicle_driver_id == "alpha"
    assert out.vehicle_generation == "2"
    assert out.vehicle_wheel_count == 4
