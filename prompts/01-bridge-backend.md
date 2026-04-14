# carla-web-bridge — Backend Deep Dive

## Entry Point: `src/main.py`

FastAPI app with lifespan-based startup/shutdown.

### Lifespan Flow
```python
lifespan(app):
  1. sensor_manager.set_loop()  # capture asyncio event loop
  2. carla_manager.connect()    # background task, non-blocking
  3. _world_tick_loop()         # 20Hz world state broadcast
  4. _session_loop()            # 1Hz session health check
  # on shutdown:
  5. cancel tasks → realtime_session.reset() → sensor_manager.destroy_all() → carla_manager.disconnect()
```

### Middleware
- CORS: allows `http://localhost:58336` and `http://127.0.0.1:58336`
- GZip: for REST responses > 1000 bytes
- Request logging (skip /health)

### REST API Routes
All prefixed with `/api/`:
- `simulation` — play/pause/step, weather control, simulation settings
- `world` — current map info, available maps
- `actors` — spawn/destroy/control actors
- `sensors` — attach/detach sensors, query data
- `traffic` — traffic manager, NPC vehicle spawning
- `blueprints` — list available actor blueprints
- `recording` — CARLA recording/replay
- `navigation` — waypoint/route queries

### Health & Info Endpoints
- `GET /health` — quick status (carla connected, ws clients, active sensors)
- `GET /api/info` — extended info (version, session state)
- `GET /api/realtime/session` — default session status

---

## `src/carla_client.py` — CarlaClientManager

Singleton: `carla_manager`

### Connection
```python
connect():
  while should_run:
    try:
      client = carla.Client(CARLA_HOST, CARLA_PORT)  # default localhost:58338
      client.set_timeout(10.0)
      world = client.get_world()
      start heartbeat_loop()
      return
    except:
      exponential backoff (1s → 2s → 4s ... max 30s)
```

### Properties
- `is_connected: bool`
- `client: carla.Client` — raises RuntimeError if not connected
- `world: carla.World` — refreshes reference each access (handles map reloads)

### Heartbeat
- Every 5 seconds, calls `get_server_version()` + refreshes world
- On failure: sets `connected=False`, triggers reconnect

### Actor Tracking
- `track_actor(id)` / `untrack_actor(id)` — tracks spawned actors for cleanup on disconnect
- On disconnect: stops sensors, destroys all tracked actors

---

## `src/sensor_manager.py` — SensorManager

Singleton: `sensor_manager` (created in main.py)

### Spawn Flow
```python
spawn_sensor(sensor_type, transform, parent_id, attributes):
  1. Check MAX_SENSORS (20) limit
  2. asyncio.to_thread(_spawn_sync(...))  # blocking CARLA call
  3. Register in _sensors dict
  4. sensor.listen(callback)  # CARLA calls this on its internal thread
  5. Return sensor_id
```

### Data Callback Chain
```
CARLA internal thread → _on_sensor_data(sensor_id, data)
  ├── Frame skip check (SENSOR_FRAME_SKIP)
  ├── Subscription check (any clients subscribed?)
  ├── _process_sensor_data() → route by type_id string:
  │   ├── "camera.rgb"        → _encode_camera(Channel.CAMERA)
  │   ├── "camera.depth"      → _encode_camera(Channel.DEPTH)
  │   ├── "camera.semantic_*" → _encode_camera(Channel.SEGMENTATION)
  │   ├── "lidar.ray_cast"    → _encode_lidar(Channel.LIDAR)
  │   ├── "radar"             → _encode_radar()
  │   ├── "imu"               → _encode_imu()
  │   └── "gnss"              → _encode_gnss()
  └── loop.call_soon_threadsafe(broadcast_raw(payload, subscribers))
```

**CRITICAL**: `_on_sensor_data` runs on CARLA's thread, not the asyncio loop.
Must use `call_soon_threadsafe` to dispatch to the event loop.

### Camera Encoding
```python
_encode_camera(sensor_id, data, frame, ts, channel):
  1. Extract width, height from data
  2. raw = bytes(data.raw_data)  # BGRA format
  3. If DEPTH: apply_depth_colormap() → logarithmic visualization
  4. If SEGMENTATION: apply_segmentation_palette() → CityScapes colors
  5. Else: compress_bgra_to_jpeg(raw, w, h, quality=80)
  6. Pack: encode_camera_payload(sensor_id, w, h, frame, ts, jpeg_bytes)
  7. Wrap: encode_frame(channel, payload)
```

---

## `src/realtime_session.py` — RealtimeSessionManager

Singleton: `realtime_session`

### Purpose
Maintains exactly one default ego vehicle + RGB camera for the browser.

### Vehicle Selection Priority
1. `vehicle.tesla.model3`
2. `vehicle.lincoln.mkz_2020`
3. `vehicle.audi.a2`
4. Fallback: first vehicle blueprint found

### Camera Config
```python
transform = {location: {x:1.6, y:0, z:1.7}, rotation: {pitch:-8, yaw:0, roll:0}}
attributes = {
  image_size_x: 960,    # DEFAULT_CAMERA_WIDTH
  image_size_y: 540,    # DEFAULT_CAMERA_HEIGHT
  fov: 100,             # DEFAULT_CAMERA_FOV
  sensor_tick: "0.05",  # 20 FPS
}
```

### Health Check
- `_session_loop()` runs every 1 second
- Calls `ensure_running()` which checks if vehicle + camera actors are still alive
- If dead, respawns

---

## `src/ws_broadcaster.py` — WebSocketBroadcaster

Singleton: `ws_broadcaster`

### Connection Lifecycle
```python
handle_connection(ws):
  1. Check MAX_CLIENTS (50)
  2. ws.accept()
  3. Assign client_id (uuid[:8])
  4. Listen for messages:
     - Text JSON: {"action": "subscribe/unsubscribe", "sensor_id": N}
     - Binary frame: channel-based subscribe/unsubscribe/stats
  5. On disconnect: remove from pool, unsubscribe from all sensors
```

### Broadcast Methods
- `broadcast_raw(data, target_clients)` — send to specific subscribers
- `broadcast_sensor_data(channel, sensor_id, ...)` — encode + send to sensor subscribers
- `broadcast_world_tick(tick_data)` — send to ALL clients (no subscription needed)

---

## `src/compression/image.py` — ImageCompressor

Singleton: `image_compressor`

### Encoding Strategy
1. **Primary**: TurboJPEG (`libturbojpeg` system lib required)
   - BGRA pixel format native support
   - Fast DCT flag for speed
2. **Fallback**: Pillow (PIL)
   - BGRA → RGB conversion
   - Image.save(format="JPEG")

### Depth Colormap
```
CARLA depth = R + G*256 + B*65536 (normalized to [0,1])
→ Logarithmic scale: log(depth * 1000 + 1) / log(1001)
→ Blue-to-red gradient
→ JPEG encode
```

### Segmentation Palette
```
CARLA semantic seg: class index in R channel (BGRA)
→ CityScapes 23-class palette lookup
→ JPEG encode
```

---

## `src/config.py` — Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `CARLA_HOST` | localhost | CARLA server host |
| `CARLA_PORT` | 58338 | CARLA RPC port |
| `CARLA_TIMEOUT` | 10.0 | Connection timeout (seconds) |
| `BRIDGE_HOST` | 0.0.0.0 | Bridge listen address |
| `BRIDGE_PORT` | 58337 | Bridge HTTP/WS port |
| `JPEG_QUALITY` | 80 | JPEG compression quality |
| `MAX_CLIENTS` | 50 | Max WebSocket clients |
| `MAX_SENSORS` | 20 | Max concurrent sensors |
| `SENSOR_FRAME_SKIP` | 0 | Skip N frames between sends |
| `DEFAULT_CAMERA_WIDTH` | 960 | Default camera resolution |
| `DEFAULT_CAMERA_HEIGHT` | 540 | |
| `DEFAULT_CAMERA_FOV` | 100 | Field of view (degrees) |
| `DEFAULT_CAMERA_SENSOR_TICK` | 0.05 | Camera tick interval (20 FPS) |
| `CORS_ORIGINS` | localhost:58336 | Allowed CORS origins |
| `HEARTBEAT_INTERVAL` | 5.0 | CARLA heartbeat check interval |
| `RECONNECT_MAX_DELAY` | 30.0 | Max reconnect backoff |
| `WS_MAX_SEND_BUFFER` | 10MB | WebSocket send buffer |
