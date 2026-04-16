# iter-08-walk-yaw-from-velocity plan

Walker body faces direction of travel. Target yaw computed from
horizontal velocity via atan2(v.x, -v.y); lerped toward target at
6 rad/s. Pre-fix walker stayed at CARLA transform yaw (often 0
when actor transform rotation isn't updated mid-motion).
