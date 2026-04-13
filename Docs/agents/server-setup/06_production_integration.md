# 06 — Production Integration

Connect all the pieces: CARLA server, Pixel Streaming, Python bridge, and the React frontend.

---

## 1. Configuration Files

### Bridge Environment (`.env`)

Create `/home/$USER/carla/carla-web-bridge/.env`:

```env
# CARLA server connection
CARLA_HOST=localhost
CARLA_PORT=2000
CARLA_TIMEOUT=10.0

# Bridge server
BRIDGE_HOST=0.0.0.0
BRIDGE_PORT=42692

# Frontend CORS
CORS_ORIGINS=http://localhost:42691

# Sensor settings
JPEG_QUALITY=80
MAX_CLIENTS=10
MAX_SENSORS=20
SENSOR_FRAME_SKIP=0

# Connection resilience
HEARTBEAT_INTERVAL=5.0
RECONNECT_MAX_DELAY=30.0

# WebSocket
WS_MAX_SEND_BUFFER=10485760
```

### Frontend Environment

Create `/home/$USER/carla/carla-web/.env.local`:

```env
# Backend bridge
NEXT_PUBLIC_BRIDGE_URL=http://localhost:42692
NEXT_PUBLIC_BRIDGE_WS_URL=ws://localhost:42692/ws

# Pixel Streaming (only if using source build with Pixel Streaming)
NEXT_PUBLIC_PIXEL_STREAMING_URL=ws://localhost:42680

# Feature flags
NEXT_PUBLIC_PIXEL_STREAMING_ENABLED=true
```

For Docker path (no Pixel Streaming):
```env
NEXT_PUBLIC_PIXEL_STREAMING_ENABLED=false
```

---

## 2. Verify Each Component Individually

Before running everything together, verify each piece works on its own.

### CARLA Server

```bash
# Source build:
cd /home/$USER/carla/Build/Package
./CarlaUnreal.sh -RenderOffScreen -nosound &
CARLA_PID=$!

# Docker:
docker start carla-server

# Test:
sleep 10
python3 -c "
import carla
c = carla.Client('localhost', 2000)
c.set_timeout(10.0)
print('CARLA OK:', c.get_server_version())
"
```

### Pixel Streaming (source build only)

```bash
# Start signaling server:
cd $CARLA_UNREAL_ENGINE_PATH/Samples/PixelStreaming/WebServers/SignallingWebServer
node cirrus.js --HttpPort 42680 --StreamerPort 42688 &

# Start CARLA with Pixel Streaming:
cd /home/$USER/carla/Build/Package
./CarlaUnreal.sh \
  -PixelStreamingIP=127.0.0.1 \
  -PixelStreamingPort=42688 \
  -RenderOffScreen -ResX=1920 -ResY=1080 -nosound &

# Test: open http://localhost:42680 in browser
# Should see UE5 rendered scene
```

### Python Bridge

```bash
cd /home/$USER/carla/carla-web-bridge
source .venv/bin/activate
uvicorn src.main:app --host 0.0.0.0 --port 42692 &

# Test REST API:
curl -s http://localhost:42692/health | python3 -m json.tool
# Should show: {"status": "ok", "carla_connected": true, ...}

curl -s http://localhost:42692/api/simulation/status | python3 -m json.tool

# Test FastAPI docs:
# Open http://localhost:42692/docs in browser
```

### Frontend

```bash
cd /home/$USER/carla/carla-web
npm run dev -- --port 42691 &

# Open http://localhost:42691 in browser
```

---

## 3. Port Summary

| Port | Service | Protocol | Notes |
|------|---------|----------|-------|
| 2000 | CARLA RPC | TCP | Commands (spawn, weather, etc.) |
| 2001 | CARLA Streaming | TCP | Sensor data (auto: RPC port + 1) |
| 42680 | Pixel Streaming HTTP | TCP | Signaling + player page |
| 42688 | Pixel Streaming Stream | TCP | UE5 → signaling video stream |
| 42691 | Frontend | TCP | Vite + React SPA |
| 42692 | Bridge REST + WS | TCP | API + WebSocket sensor data |

---

## 4. Network Topology for Remote Access

If the CARLA server runs on a different machine than the browser:

```
GPU Server (192.168.0.100)          Developer Machine (192.168.0.50)
├── CARLA UE5 (:2000, :2001)       ├── Browser → http://192.168.0.100:42691
├── Pixel Streaming (:42680,:42688)
├── Bridge (:42692)
└── Frontend (:42691)
```

Update configs:
- Bridge `.env`: `CARLA_HOST=localhost` (bridge runs on same machine as CARLA)
- Bridge `.env`: `CORS_ORIGINS=http://192.168.0.100:42691,http://192.168.0.50:42691`
- Frontend `.env.local`: use the GPU server's IP instead of `localhost`

---

## 5. Production Hardening

### Process Management with systemd

Create systemd services so everything starts on boot and auto-restarts on crash.

**`/etc/systemd/system/carla-server.service`:**
```ini
[Unit]
Description=CARLA UE5 Simulator Server
After=network.target

[Service]
Type=simple
User=song99
WorkingDirectory=/home/song99/carla/Build/Package
ExecStart=/home/song99/carla/Build/Package/CarlaUnreal.sh \
  -PixelStreamingIP=127.0.0.1 \
  -PixelStreamingPort=42688 \
  -RenderOffScreen -ResX=1920 -ResY=1080 \
  -nosound -unattended
Restart=on-failure
RestartSec=10
Environment=SDL_VIDEODRIVER=offscreen

[Install]
WantedBy=multi-user.target
```

**`/etc/systemd/system/carla-signaling.service`:**
```ini
[Unit]
Description=Pixel Streaming Signaling Server
After=network.target

[Service]
Type=simple
User=song99
WorkingDirectory=/home/song99/PixelStreamingInfrastructure/SignallingWebServer
ExecStart=/usr/bin/node cirrus.js --HttpPort 42680 --StreamerPort 42688
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**`/etc/systemd/system/carla-bridge.service`:**
```ini
[Unit]
Description=CARLA Web Bridge (FastAPI)
After=carla-server.service
Wants=carla-server.service

[Service]
Type=simple
User=song99
WorkingDirectory=/home/song99/carla/carla-web-bridge
ExecStart=/home/song99/carla/carla-web-bridge/.venv/bin/uvicorn \
  src.main:app --host 0.0.0.0 --port 42692
Restart=on-failure
RestartSec=5
EnvironmentFile=/home/song99/carla/carla-web-bridge/.env

[Install]
WantedBy=multi-user.target
```

**`/etc/systemd/system/carla-web.service`:**
```ini
[Unit]
Description=CARLA Web Frontend (Vite + React)
After=carla-bridge.service

[Service]
Type=simple
User=song99
WorkingDirectory=/home/song99/carla/carla-web
ExecStart=/usr/bin/npx serve dist -l 42691
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable all:
```bash
sudo systemctl daemon-reload
sudo systemctl enable carla-server carla-signaling carla-bridge carla-web
sudo systemctl start carla-server carla-signaling carla-bridge carla-web
```

---

## 6. Health Monitoring

### Quick health check script:

```bash
#!/bin/bash
echo "=== CARLA Production Health Check ==="

# CARLA Server
python3 -c "
import carla
c = carla.Client('localhost', 2000)
c.set_timeout(5.0)
print('CARLA Server:', c.get_server_version(), '✓')
" 2>/dev/null || echo "CARLA Server: DOWN ✗"

# Bridge
curl -sf http://localhost:42692/health > /dev/null \
  && echo "Bridge: UP ✓" \
  || echo "Bridge: DOWN ✗"

# Frontend
curl -sf http://localhost:42691 > /dev/null \
  && echo "Frontend: UP ✓" \
  || echo "Frontend: DOWN ✗"

# Pixel Streaming
curl -sf http://localhost:42680 > /dev/null \
  && echo "Pixel Streaming: UP ✓" \
  || echo "Pixel Streaming: DOWN ✗"

echo "==================================="
```

---

Proceed to [07 — Run Everything](07_run_production.md).
