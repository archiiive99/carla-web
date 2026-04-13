# Prompt 03 — Python Backend Bridge Service

## Context

You are building the backend bridge that connects the CARLA simulator to the web frontend. This is the critical middleware layer that translates CARLA's native TCP/RPC protocols into web-standard WebSocket and REST API.

Read before starting:
- `Docs/agents/carla_web_implementation_prompt.md` — Full architecture (see "BACKEND: PYTHON BRIDGE SERVICE" section)
- `Docs/agents/carla_web_feasibility_study.md` — Data format details and bandwidth analysis

---

## Task

Build the complete Python bridge service at `carla-web-bridge/` in the project root.

### 1. Project Setup

```
carla-web-bridge/
├── pyproject.toml           # Python project config (use Poetry or pip)
├── requirements.txt         # Dependencies
├── src/
│   ├── __init__.py
│   ├── main.py              # Entry point: uvicorn + FastAPI app
│   ├── config.py            # Configuration (env vars, defaults)
│   ├── carla_client.py      # CARLA connection manager
│   ├── sensor_manager.py    # Sensor subscription lifecycle
│   ├── ws_broadcaster.py    # WebSocket multiplexed broadcaster
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── simulation.py    # /api/simulation/* endpoints
│   │   ├── world.py         # /api/world/* endpoints
│   │   ├── actors.py        # /api/actors/* endpoints
│   │   ├── sensors.py       # /api/sensors/* endpoints
│   │   ├── traffic.py       # /api/traffic/* endpoints
│   │   ├── blueprints.py    # /api/blueprints/* endpoints
│   │   ├── recording.py     # /api/recording/* endpoints
│   │   └── navigation.py    # /api/map/* endpoints
│   ├── ws/
│   │   ├── __init__.py
│   │   ├── handler.py       # WebSocket connection handler
│   │   ├── protocol.py      # Binary protocol encoder/decoder
│   │   └── channels.py      # Channel ID definitions
│   ├── compression/
│   │   ├── __init__.py
│   │   └── image.py         # JPEG/WebP compression (turbojpeg)
│   ├── models/
│   │   ├── __init__.py
│   │   └── schemas.py       # Pydantic models for API
│   └── utils/
│       ├── __init__.py
│       └── serialization.py # Data conversion helpers
├── tests/
│   ├── test_protocol.py     # Binary protocol tests
│   ├── test_compression.py  # Image compression benchmarks
│   └── test_routes.py       # API endpoint tests
├── Dockerfile
└── docker-compose.yml       # Bridge + (optional) CARLA server
```

### 2. Dependencies

```
fastapi>=0.104.0
uvicorn[standard]>=0.24.0
websockets>=12.0
carla>=0.9.15                # CARLA Python API
Pillow>=10.0.0               # Fallback image processing
PyTurboJPEG>=1.7.0           # Fast JPEG compression (preferred)
numpy>=1.24.0                # Array operations for sensor data
pydantic>=2.0                # Data validation
python-dotenv>=1.0.0         # Environment configuration
```

### 3. Configuration (`config.py`)

Environment variables with defaults:
```python
CARLA_HOST = "localhost"
CARLA_PORT = 2000               # RPC port
BRIDGE_HOST = "0.0.0.0"
BRIDGE_PORT = 8000
BRIDGE_WS_PORT = 8001           # Or use same port with path /ws
JPEG_QUALITY = 80               # 1-100
MAX_CLIENTS = 10
SENSOR_FRAME_SKIP = 0           # Skip N frames between sends (0 = send all)
CORS_ORIGINS = ["http://localhost:3000"]  # Frontend dev server
```

### 4. CARLA Client Manager (`carla_client.py`)

```python
class CarlaClientManager:
    """Manages connection to CARLA server with auto-reconnect."""

    async def connect(self) -> None:
        """Connect to CARLA server. Retry with exponential backoff."""

    async def disconnect(self) -> None:
        """Clean disconnect: destroy spawned actors, stop sensors."""

    @property
    def world(self) -> carla.World: ...

    @property
    def client(self) -> carla.Client: ...

    @property
    def is_connected(self) -> bool: ...

    def get_traffic_manager(self, port: int = 8000) -> carla.TrafficManager: ...
```

Key requirements:
- Run CARLA API calls in a thread pool executor (`asyncio.to_thread`) since the CARLA Python API is synchronous/blocking
- Implement heartbeat check every 5 seconds (call `client.get_server_version()`)
- On disconnect, attempt reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s)
- Track all actors spawned by the bridge for cleanup on disconnect

### 5. Sensor Manager (`sensor_manager.py`)

```python
class SensorManager:
    """Manages sensor lifecycle and data callbacks."""

    async def spawn_sensor(self, sensor_type: str, transform: dict,
                           parent_id: int, attributes: dict) -> int:
        """Spawn a sensor, register callback, return sensor ID."""

    async def destroy_sensor(self, sensor_id: int) -> None:
        """Stop listening, destroy sensor actor."""

    def subscribe(self, sensor_id: int, client_id: str) -> None:
        """Add client subscription. Start streaming if first subscriber."""

    def unsubscribe(self, sensor_id: int, client_id: str) -> None:
        """Remove client subscription. Stop streaming if last subscriber."""

    def _on_sensor_data(self, sensor_id: int, data: carla.SensorData) -> None:
        """Callback from CARLA sensor. Compress and broadcast."""
```

Key requirements:
- Each sensor callback runs on CARLA's internal thread — immediately hand off data to an asyncio queue
- Camera data pipeline: `carla.Image.raw_data` → `numpy.frombuffer(dtype=uint8).reshape(h, w, 4)` → `turbojpeg.encode(bgra_array, quality=JPEG_QUALITY)` → binary WebSocket frame
- LiDAR data pipeline: `carla.LidarMeasurement.raw_data` → forward raw bytes directly (already Float32 x,y,z,intensity)
- Implement per-sensor frame counter. If a sensor produces data faster than clients can consume, drop frames (keep latest only)
- Maximum active sensors: 20 (configurable)

### 6. WebSocket Broadcaster (`ws_broadcaster.py`)

```python
class WebSocketBroadcaster:
    """Multiplexed WebSocket server for real-time data."""

    async def handle_connection(self, websocket) -> None:
        """Handle new client: register, process messages, cleanup on disconnect."""

    async def broadcast_sensor_data(self, channel: int, sensor_id: int,
                                     frame: int, timestamp: float,
                                     payload: bytes) -> None:
        """Send sensor data to all subscribed clients."""

    async def broadcast_world_tick(self, tick_data: bytes) -> None:
        """Send world state to all connected clients."""
```

Binary protocol (single multiplexed connection):
```
Frame format: [1B channel][4B length][payload...]

Channel 0x01 (Camera):     [4B sensor_id][4B width][4B height][4B frame][8B timestamp][JPEG bytes]
Channel 0x02 (Depth):      [4B sensor_id][4B width][4B height][4B frame][8B timestamp][encoded bytes]
Channel 0x03 (Segmentation): same as camera
Channel 0x04 (LiDAR):      [4B sensor_id][4B count][4B frame][8B timestamp][count*16B float32 xyzI]
Channel 0x05 (Sem.LiDAR):  [4B sensor_id][4B count][4B frame][8B timestamp][count*24B float32]
Channel 0x06 (Radar):      [4B sensor_id][4B count][4B frame][8B timestamp][count*16B float32]
Channel 0x07 (IMU):        [4B sensor_id][4B frame][8B timestamp][12B accel][12B gyro][4B compass]
Channel 0x08 (GNSS):       [4B sensor_id][4B frame][8B timestamp][8B lat][8B lon][8B alt]
Channel 0x09 (Collision):  [4B sensor_id][4B frame][8B timestamp][4B other_id][12B impulse]
Channel 0x0A (Lane inv.):  [4B sensor_id][4B frame][8B timestamp][4B count][markings...]
Channel 0x0B (DVS):        [4B sensor_id][4B count][4B frame][8B timestamp][events...]
Channel 0x10 (World tick): [4B frame][8B timestamp][4B actor_count][per_actor: 4B id,12B pos,12B rot,12B vel]
Channel 0xF0 (Subscribe):  JSON text {"action":"subscribe","sensor_id":123}
Channel 0xF1 (Unsubscribe): JSON text
Channel 0xFE (Client stats): JSON text {"fps":30,"processing_ms":12}
Channel 0xFF (Control):    JSON text (any command)
```

Key requirements:
- Use `websockets` library or FastAPI's built-in WebSocket support
- Binary mode for all sensor data frames
- Text mode only for control messages (0xF0-0xFF channels)
- Async send to all clients — do NOT await individual sends (fire-and-forget with error handling)
- Track per-client subscription set
- Implement backpressure: if a client's send buffer exceeds 10MB, disconnect it
- Client stats (0xFE): client reports its processing time every second. If processing_ms > 50ms, reduce data rate for that client

### 7. REST API Endpoints

Implement ALL endpoints listed in `Docs/agents/carla_web_implementation_prompt.md` under "REST API Endpoints". Every endpoint must:
- Use Pydantic models for request/response validation
- Run CARLA API calls via `asyncio.to_thread()` (non-blocking)
- Return proper HTTP status codes (200, 201, 400, 404, 500)
- Include error messages in response body
- Use FastAPI dependency injection for the CARLA client

Priority endpoints (implement these first):
1. `GET /api/simulation/status`
2. `POST /api/simulation/play` and `POST /api/simulation/pause`
3. `GET /api/actors` and `POST /api/actors/spawn/vehicle`
4. `GET /api/world/weather` and `POST /api/world/weather`
5. `GET /api/blueprints/vehicles` and `GET /api/blueprints/sensors`
6. `GET /api/world/maps` and `POST /api/world/load`

### 8. Image Compression (`compression/image.py`)

```python
class ImageCompressor:
    """High-performance image compression for sensor data."""

    def compress_bgra_to_jpeg(self, raw_data: bytes, width: int, height: int,
                               quality: int = 80) -> bytes:
        """BGRA raw buffer → JPEG bytes. Target: <5ms for 1920x1080."""

    def compress_bgra_to_webp(self, raw_data: bytes, width: int, height: int,
                               quality: int = 80) -> bytes:
        """BGRA raw buffer → WebP bytes. Fallback if turbojpeg unavailable."""

    def apply_depth_colormap(self, raw_data: bytes, width: int, height: int) -> bytes:
        """Apply depth visualization colormap (CARLA logarithmic depth)."""

    def apply_segmentation_palette(self, raw_data: bytes, width: int, height: int) -> bytes:
        """Apply CityScapes color palette to semantic segmentation."""
```

Performance targets:
- JPEG encode 1920x1080 BGRA: **<5ms** (use `turbojpeg` with `TJFLAG_FASTDCT`)
- JPEG encode 640x480 BGRA: **<1ms**
- Use numpy for colormap operations (vectorized, no Python loops)

### 9. World Tick Broadcasting

Every simulation tick, broadcast all actor transforms to all connected clients:
- Subscribe to `world.on_tick(callback)` in async mode
- Callback serializes all actor transforms into the binary world tick format (channel 0x10)
- Broadcast to all connected WebSocket clients
- In synchronous mode, this happens once per `world.tick()` call

Data per actor (40 bytes):
```
[4B actor_id][4B x][4B y][4B z][4B pitch][4B yaw][4B roll][4B vx][4B vy][4B vz]
```
All floats are 32-bit. With 100 actors: 4KB per tick, 80KB/s at 20 ticks/s — very manageable.

### 10. Docker Configuration

**Dockerfile:**
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY src/ src/
EXPOSE 8000
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**docker-compose.yml:**
```yaml
services:
  bridge:
    build: .
    ports:
      - "8000:8000"
    environment:
      - CARLA_HOST=host.docker.internal
      - CARLA_PORT=2000
      - CORS_ORIGINS=http://localhost:3000
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

### 11. Performance Requirements

- Bridge startup to ready: **<3 seconds**
- REST API response time (simple queries): **<50ms**
- REST API response time (actor spawn): **<200ms**
- WebSocket message latency (bridge overhead only): **<5ms**
- Camera frame compression + broadcast: **<10ms per frame**
- Memory usage: **<500MB** with 10 sensors active
- CPU usage: **<50%** of one core with 10 sensors at 20 FPS

### 12. Testing

Write tests for:
- Binary protocol encoding/decoding (round-trip test for each channel type)
- Image compression performance benchmark (assert <5ms for 1080p)
- REST API contract tests (use FastAPI TestClient, mock CARLA client)
- WebSocket connection lifecycle (connect, subscribe, receive frame, disconnect)

### 13. Quality Checklist

- [ ] `pip install -r requirements.txt` succeeds
- [ ] `uvicorn src.main:app` starts without errors (even without CARLA server — should show "connecting..." status)
- [ ] `GET /api/simulation/status` returns proper JSON when CARLA is not connected (returns connection error status)
- [ ] Binary protocol encoder/decoder tests pass
- [ ] Image compression tests pass with <5ms for 1080p
- [ ] CORS headers are set correctly for frontend origin
- [ ] WebSocket connection accepts and handles binary frames
- [ ] Graceful shutdown: all sensors stopped, actors cleaned up
