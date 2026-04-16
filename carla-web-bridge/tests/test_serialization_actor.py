from src.utils.serialization import classify_actor, serialize_actor


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


# --- classify_actor -----------------------------------------------------


def test_classify_actor_handles_known_prefixes():
    assert classify_actor("vehicle.tesla.model3") == "vehicle"
    assert classify_actor("walker.pedestrian.0043") == "walker"
    assert classify_actor("sensor.camera.rgb") == "sensor"
    assert classify_actor("traffic.traffic_light") == "traffic_light"
    assert classify_actor("traffic.speed_limit.30") == "traffic_sign"
    assert classify_actor("traffic.stop") == "traffic_sign"
    assert classify_actor("traffic.yield") == "traffic_sign"


def test_classify_actor_falls_through_to_other():
    assert classify_actor("spectator") == "other"
    assert classify_actor("static.prop.mesh") == "other"
    assert classify_actor("controller.ai.walker") == "other"
    # Empty string is a degenerate input but shouldn't crash.
    assert classify_actor("") == "other"


def test_classify_actor_does_not_misidentify_unrelated_traffic_substring():
    """The previous implementation used `"traffic" in type_id` as the
    catch-all traffic-sign branch, which would misclassify any unrelated
    actor type whose id happens to contain the substring "traffic".
    Pin the tightened startswith("traffic.") shape so a future refactor
    doesn't regress back to the loose match."""
    # Hypothetical future type_ids that contain "traffic" as a substring
    # but aren't map fixtures. None of these exist in CARLA today; the
    # test guards against a regression if they're ever added.
    assert classify_actor("vehicle.carla.traffic_cone") == "vehicle"
    assert classify_actor("some.traffic.analysis") == "other"
    assert classify_actor("sensor.traffic.monitor") == "sensor"
