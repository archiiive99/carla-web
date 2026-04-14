# CARLA Web — Architecture Overview

## Data Flow

```
UE5 CARLA Simulator (C++, RenderOffScreen)
    │  RPC + TCP streaming on port 58338
    ▼
carla-web-bridge (Python 3.10, FastAPI + uvicorn)
    │  Port 58337
    │  ├─ REST API: /api/* (simulation control, actors, sensors, weather)
    │  └─ WebSocket: /ws (binary sensor data, world ticks)
    ▼
carla-web (React 19 + TypeScript + Vite)
    │  Port 58336
    │  ├─ Web Workers: ws-receiver, image-decoder, lidar-processor
    │  ├─ Three.js / R3F viewport
    │  └─ Zustand state management
    ▼
Browser (Chrome/Firefox)
```

## Port Map

| Service | Port | Protocol |
|---------|------|----------|
| CARLA UE5 Server | 58338 | CARLA RPC (TCP) |
| carla-web-bridge | 58337 | HTTP REST + WebSocket |
| carla-web frontend | 58336 | HTTP (Vite dev server) |

## Directory Map

```
/data1/song99/carla/
├── Unreal/CarlaUnreal/          # UE5 project (DO NOT MODIFY)
│   └── Plugins/Carla/Source/    # CARLA plugin C++ source
├── LibCarla/                    # Core C++ library (DO NOT MODIFY)
├── PythonAPI/                   # Python bindings + examples
├── carla-web-bridge/            # [EDITABLE] Python backend
│   ├── src/
│   │   ├── main.py              # FastAPI app, lifespan, routes
│   │   ├── carla_client.py      # CARLA connection manager
│   │   ├── sensor_manager.py    # Sensor spawn/destroy/callbacks
│   │   ├── realtime_session.py  # Default ego vehicle + camera
│   │   ├── ws_broadcaster.py    # WebSocket client management
│   │   ├── config.py            # Environment config
│   │   ├── compression/
│   │   │   └── image.py         # TurboJPEG/Pillow BGRA→JPEG
│   │   ├── ws/
│   │   │   ├── protocol.py      # Binary frame encode/decode
│   │   │   ├── channels.py      # Channel ID constants
│   │   │   └── handler.py       # WebSocket endpoint
│   │   ├── routes/              # REST API endpoints
│   │   │   ├── simulation.py
│   │   │   ├── world.py
│   │   │   ├── actors.py
│   │   │   ├── sensors.py
│   │   │   ├── traffic.py
│   │   │   ├── blueprints.py
│   │   │   ├── recording.py
│   │   │   └── navigation.py
│   │   ├── models/
│   │   │   └── schemas.py       # Pydantic models
│   │   └── utils/
│   │       └── serialization.py # World tick encoding
│   └── requirements.txt
├── carla-web/                   # [EDITABLE] React frontend
│   ├── src/
│   │   ├── main.tsx             # React entry
│   │   ├── App.tsx              # Root component + routing
│   │   ├── lib/
│   │   │   ├── carla-api.ts     # REST API client
│   │   │   ├── ws-protocol.ts   # Binary frame parser
│   │   │   ├── sensor-registry.ts
│   │   │   └── data-export.ts
│   │   ├── types/
│   │   │   └── ws.ts            # Frame types, channel enums
│   │   ├── workers/
│   │   │   ├── ws-receiver.worker.ts
│   │   │   ├── image-decoder.worker.ts
│   │   │   ├── lidar-processor.worker.ts
│   │   │   └── telemetry-aggregator.worker.ts
│   │   ├── stores/              # Zustand state
│   │   │   ├── simulationStore.ts
│   │   │   ├── actorStore.ts
│   │   │   ├── sensorStore.ts
│   │   │   ├── performanceStore.ts
│   │   │   └── uiStore.ts
│   │   ├── hooks/
│   │   ├── components/
│   │   │   ├── sensors/         # Camera, LiDAR, Radar views
│   │   │   ├── viewport/        # Three.js 3D viewport
│   │   │   ├── actors/
│   │   │   ├── controls/
│   │   │   ├── layout/
│   │   │   └── ui/              # shadcn components
│   │   ├── routes/
│   │   │   ├── SimulationPage.tsx
│   │   │   └── SettingsPage.tsx
│   │   └── contexts/
│   └── vite.config.ts
├── run_local.sh                 # Start all 3 services
├── run_carla.sh                 # CARLA server with auto-restart
├── kill_all.sh                  # Stop everything
└── prompts/                     # This folder
```

## Key Singletons

| Module | Singleton | Role |
|--------|-----------|------|
| `carla_client.py` | `carla_manager` | CARLA server connection + auto-reconnect |
| `ws_broadcaster.py` | `ws_broadcaster` | WebSocket client pool + broadcast |
| `compression/image.py` | `image_compressor` | TurboJPEG encoder |
| `main.py` | `sensor_manager` | Sensor lifecycle management |
| `main.py` | `realtime_session` | Default ego vehicle + camera session |

## Startup Sequence

1. `lifespan()` in `main.py` fires
2. `carla_manager.connect()` — connects to CARLA via Python API with exponential backoff
3. `_world_tick_loop()` — 20Hz actor transform broadcast
4. `_session_loop()` — ensures default vehicle + RGB camera exist
5. `realtime_session.ensure_running()` — spawns vehicle (Tesla Model 3 preferred), attaches RGB camera
6. Sensor callback → `sensor_manager._on_sensor_data()` → JPEG encode → `ws_broadcaster.broadcast_raw()`
7. Frontend Web Worker receives binary frame → decodes → renders to canvas
