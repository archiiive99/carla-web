# Backend API Reference — 전체 엔드포인트 상세

Base URL: `http://localhost:58337`

모든 응답은 JSON. 에러 시 `{"detail": "에러 메시지"}` 반환.

---

## Health & Info

### `GET /health`
```json
{
  "status": "ok",
  "carla_connected": true,
  "ws_clients": 2,
  "active_sensors": 3
}
```

### `GET /api/info`
```json
{
  "bridge_version": "0.1.0",
  "carla_connected": true,
  "carla_version": "0.10.0",
  "active_sensors": 3,
  "ws_clients": 2
}
```

---

## Simulation

### `GET /api/simulation/status`
```json
{
  "connected": true,
  "running": true,
  "paused": false,
  "tick": 45123,
  "elapsed_time": 2345.678,
  "map": "Carla/Maps/Town10HD_Opt",
  "sync_mode": false,
  "fixed_delta": 0.0,
  "server_version": "0.10.0"
}
```
- CARLA 미연결 시: `{"connected": false, ...나머지 기본값}`

### `GET /api/simulation/tick`
```json
{"tick": 45123}
```
경량 엔드포인트 — 틱 번호만 반환.

### `POST /api/simulation/play`
```json
{"status": "playing"}
```

### `POST /api/simulation/pause`
```json
{"status": "paused"}
```

### `POST /api/simulation/step`
```json
{"frame": 45124}
```
sync 모드에서만 의미 있음.

### `POST /api/simulation/settings`
요청:
```json
{
  "sync_mode": true,
  "fixed_delta": 0.05,
  "no_rendering": false,
  "substepping": true,
  "max_substep_delta": 0.01,
  "max_substeps": 10
}
```
모든 필드 선택적.

### `POST /api/simulation/reload`
현재 맵 리로드. 응답: `{"status": "reloaded"}`

---

## World

### `GET /api/world/maps`
```json
{"maps": ["Town01", "Town02", "Town03", "Town04", "Town05", "Town10HD_Opt"]}
```

### `POST /api/world/load`
요청: `{"map_name": "Town01"}`
응답: `{"status": "loaded", "map": "Town01"}`
- 타임아웃: 30초 (맵 로딩 오래 걸림)

### `GET /api/world/weather`
```json
{
  "cloudiness": 0.0,
  "precipitation": 0.0,
  "precipitation_deposits": 0.0,
  "wind_intensity": 0.0,
  "sun_azimuth_angle": 0.0,
  "sun_altitude_angle": 70.0,
  "fog_density": 0.0,
  "fog_distance": 0.0,
  "fog_falloff": 0.0,
  "wetness": 0.0,
  "scattering_intensity": 0.0,
  "mie_scattering_scale": 0.0,
  "rayleigh_scattering_scale": 0.0,
  "dust_storm": 0.0
}
```

### `POST /api/world/weather`
프리셋: `{"preset": "ClearNoon"}`
커스텀: `{"params": {"cloudiness": 80, "precipitation": 50}}`

22개 프리셋:
```
Noon: ClearNoon, CloudyNoon, WetNoon, WetCloudyNoon, MidRainyNoon, HardRainNoon, SoftRainNoon
Sunset: ClearSunset, CloudySunset, WetSunset, WetCloudySunset, MidRainSunset, HardRainSunset, SoftRainSunset
Night: ClearNight, CloudyNight, WetNight, WetCloudyNight, SoftRainNight, MidRainyNight, HardRainNight
Special: DustStorm
```

### `GET /api/world/weather/presets`
```json
{"presets": ["ClearNoon", "CloudyNoon", ...]}
```

### `GET /api/world/spawn-points`
```json
{
  "spawn_points": [
    {"location": {"x": 106.4, "y": -12.7, "z": 0.6}, "rotation": {"pitch": 0, "yaw": 90, "roll": 0}},
    ...
  ]
}
```

### `GET /api/world/spectator`
```json
{
  "id": 1,
  "type_id": "spectator",
  "type": "other",
  "transform": {"location": {"x": -172.2, "y": 183.9, "z": 27.6}, "rotation": {"pitch": 0, "yaw": -45.6, "roll": 0}},
  "velocity": {"x": 0, "y": 0, "z": 0},
  "is_alive": true
}
```

### `POST /api/world/spectator`
요청: `{"location": {"x": 100, "y": 50, "z": 20}, "rotation": {"pitch": -15, "yaw": 90, "roll": 0}}`

### `POST /api/world/map-layers`
요청: `{"layer": "buildings", "action": "unload"}`
레이어: buildings, decals, foliage, ground, parked_vehicles, particles, props, street_lights, walls, all

---

## Actors

### `GET /api/actors`
```json
{
  "actors": [
    {
      "id": 35,
      "type_id": "vehicle.taxi.ford",
      "type": "vehicle",
      "transform": {"location": {"x": 10, "y": 20, "z": 0.5}, "rotation": {"pitch": 0, "yaw": 90, "roll": 0}},
      "velocity": {"x": 5.2, "y": 0.1, "z": 0},
      "is_alive": true
    },
    ...
  ],
  "count": 28
}
```

### `GET /api/actors/count`
```json
{"count": 28}
```

### `GET /api/actors/:id`
단일 액터 상세. 차량이면 추가 `control` 필드 포함:
```json
{
  "id": 35,
  "type_id": "vehicle.taxi.ford",
  "control": {
    "throttle": 0.5,
    "steer": 0.1,
    "brake": 0,
    "hand_brake": false,
    "reverse": false,
    "gear": 3
  },
  ...
}
```

### `POST /api/actors/spawn/vehicle` (201)
요청:
```json
{
  "blueprint": "vehicle.taxi.ford",
  "transform": {"location": {"x": 0, "y": 0, "z": 2}, "rotation": {"pitch": 0, "yaw": 0, "roll": 0}},
  "autopilot": true
}
```
- `try_spawn_actor` 사용 (위치 충돌 시 다른 스폰 포인트 자동 시도)
- `set_autopilot(True)` try/except 감쌈 (TrafficManager 없을 수 있음)
- blueprint 없으면 400 에러

### `POST /api/actors/spawn/walker` (201)
요청: `{"blueprint": "walker.pedestrian.0001", "transform": {...}}`

### `POST /api/actors/spawn/sensor` (201)
요청:
```json
{
  "type": "sensor.camera.rgb",
  "transform": {"location": {"x": 0, "y": 0, "z": 2.5}, "rotation": {"pitch": -15, "yaw": 0, "roll": 0}},
  "parent_id": 35,
  "attributes": {"image_size_x": "640", "image_size_y": "480", "fov": "90"}
}
```
- `parent_id: 0`이면 월드에 부착
- attributes의 key/value는 모두 문자열

### `DELETE /api/actors/:id`
응답: `{"status": "destroyed", "id": 35}`

### `DELETE /api/actors/all`
Bridge가 스폰한 모든 액터 제거.
응답: `{"status": "destroyed", "count": 5}`

### `POST /api/actors/:id/control`
```json
{"throttle": 1.0, "steer": -0.5, "brake": 0, "hand_brake": false, "reverse": false}
```

### `POST /api/actors/:id/autopilot`
```json
{"enabled": true, "tm_port": 8000}
```

### `POST /api/actors/:id/transform`
```json
{"location": {"x": 100, "y": 50, "z": 2}, "rotation": {"pitch": 0, "yaw": 90, "roll": 0}}
```

### `GET /api/actors/:id/bounding-box`
```json
{"extent": {"x": 2.5, "y": 1.0, "z": 0.8}, "location": {...}, "rotation": {...}}
```

---

## Blueprints

### `GET /api/blueprints/vehicles`
```json
{
  "blueprints": [
    {"id": "vehicle.taxi.ford", "tags": ["vehicle", "taxi", "ford"], "attributes": [...]},
    ...
  ]
}
```
- 각 attribute: `{"id": "color", "type": "Color", "value": "", "recommended_values": ["0,0,0", "255,255,255"]}`

### `GET /api/blueprints/walkers`
### `GET /api/blueprints/sensors`
### `GET /api/blueprints/props`
모두 같은 형식.

---

## Sensors

### `GET /api/sensors/types`
```json
{
  "sensor_types": [
    {"type": "sensor.camera.rgb", "category": "camera", "description": "RGB Camera"},
    {"type": "sensor.lidar.ray_cast", "category": "lidar", "description": "LiDAR Ray-Cast"},
    ...
  ]
}
```
15개 센서 타입.

### `GET /api/sensors/:id/config`
```json
{"id": 42, "type_id": "sensor.camera.rgb", "attributes": {"image_size_x": "640", ...}}
```

---

## Traffic Manager

### `GET /api/traffic/status`
### `POST /api/traffic/global-speed` — `{"speed_diff": -30}`
### `POST /api/traffic/vehicle/:id/speed` — `{"speed_diff": 20}`
### `POST /api/traffic/vehicle/:id/lane` — `{"auto_lane_change": true}`
### `POST /api/traffic/vehicle/:id/ignore` — `{"lights": 50, "signs": 0, "walkers": 0, "vehicles": 0}`
### `POST /api/traffic/vehicle/:id/route` — `{"waypoints": [{"x":10,"y":20,"z":0}, ...]}`

---

## Navigation

### `GET /api/map/topology`
```json
{
  "topology": [
    {
      "start": {"id": 1, "road_id": 5, "lane_id": -1, "transform": {...}},
      "end": {"id": 2, "road_id": 5, "lane_id": -1, "transform": {...}}
    },
    ...
  ],
  "count": 1234
}
```

### `POST /api/map/route`
요청: `{"origin": {"x":10,"y":20,"z":0}, "destination": {"x":100,"y":50,"z":0}}`
응답: `{"route": [{"transform": {...}, "road_option": "LaneFollow", "road_id": 5, "lane_id": -1}, ...], "count": 50}`

### `GET /api/map/waypoint?x=10&y=20&z=0`
```json
{"id": 42, "road_id": 5, "section_id": 0, "lane_id": -1, "is_junction": false, "lane_width": 3.5, "lane_type": "Driving", "transform": {...}}
```

---

## Recording

### `POST /api/recording/start` — `{"filename": "recording_001"}`
### `POST /api/recording/stop`
### `GET /api/recording/files`
### `POST /api/replay/start` — `{"filename": "recording_001", "start_time": 0, "duration": 0, "camera_id": 0}`
### `POST /api/replay/stop`

---

## 에러 코드

| HTTP | 의미 | 예시 |
|------|------|------|
| 200 | 성공 | 정상 응답 |
| 201 | 생성됨 | 액터/센서 스폰 성공 |
| 400 | 잘못된 요청 | 없는 블루프린트, 스폰 실패 |
| 404 | 없음 | 존재하지 않는 액터 ID |
| 500 | 서버 에러 | CARLA 내부 에러 (std::exception) |
| 503 | 연결 안 됨 | Bridge가 CARLA에 연결 안 됨 |
