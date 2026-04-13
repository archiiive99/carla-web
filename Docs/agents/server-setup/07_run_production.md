# 07 — Run Everything: Single Script Production Launch

One script to start the full CARLA Web production stack. No excuses, no missing pieces.

---

## The Script

Save this as `/home/$USER/carla/run_production.sh`:

```bash
#!/bin/bash
#
# CARLA Web — Full Production Stack Launcher
#
# Starts all 4 services:
#   1. CARLA UE5 Server (GPU rendering + simulation)
#   2. Pixel Streaming Signaling Server (WebRTC relay)
#   3. Python Bridge (FastAPI REST + WebSocket)
#   4. Vite + React Frontend (React + shadcn UI)
#
# Usage:
#   ./run_production.sh                  # Full stack with Pixel Streaming
#   ./run_production.sh --no-pixel       # Without Pixel Streaming (camera fallback)
#   ./run_production.sh --docker         # Use Docker for CARLA server
#   ./run_production.sh --skip-carla     # Skip CARLA server (already running externally)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CARLA_DIR="$SCRIPT_DIR"
BRIDGE_DIR="$SCRIPT_DIR/carla-web-bridge"
FRONTEND_DIR="$SCRIPT_DIR/carla-web"

# Ports
CARLA_RPC_PORT=2000
CARLA_STREAM_PORT=2001
SIGNALING_HTTP_PORT=42680
SIGNALING_STREAM_PORT=42688
BRIDGE_PORT=42692
FRONTEND_PORT=42691

# Flags
USE_PIXEL_STREAMING=true
USE_DOCKER=false
SKIP_CARLA=false
CARLA_MAP="Town10HD"
RESOLUTION="1920x1080"

# Parse args
while [[ $# -gt 0 ]]; do
    case $1 in
        --no-pixel)    USE_PIXEL_STREAMING=false; shift ;;
        --docker)      USE_DOCKER=true; shift ;;
        --skip-carla)  SKIP_CARLA=true; shift ;;
        --map)         CARLA_MAP="$2"; shift 2 ;;
        --res)         RESOLUTION="$2"; shift 2 ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "  --no-pixel     Disable Pixel Streaming (camera fallback)"
            echo "  --docker       Use Docker for CARLA server"
            echo "  --skip-carla   Don't start CARLA server (use existing)"
            echo "  --map NAME     Initial map (default: Town10HD)"
            echo "  --res WxH      Resolution (default: 1920x1080)"
            exit 0
            ;;
        *) echo "Unknown: $1"; exit 1 ;;
    esac
done

RES_X="${RESOLUTION%x*}"
RES_Y="${RESOLUTION#*x}"

PIDS=()

cleanup() {
    echo ""
    echo "Shutting down CARLA Web stack..."

    for pid in "${PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done

    if $USE_DOCKER; then
        docker stop carla-server 2>/dev/null || true
    fi

    wait "${PIDS[@]}" 2>/dev/null || true
    echo "All services stopped."
}
trap cleanup EXIT INT TERM

log() {
    echo "[$(date '+%H:%M:%S')] $1"
}

check_port() {
    if ss -tlnp 2>/dev/null | grep -q ":$1 "; then
        echo "ERROR: Port $1 is already in use."
        ss -tlnp 2>/dev/null | grep ":$1 "
        exit 1
    fi
}

# ═══════════════════════════════════════════════════
# Pre-flight checks
# ═══════════════════════════════════════════════════

log "Running pre-flight checks..."

if ! $SKIP_CARLA; then
    check_port $CARLA_RPC_PORT
fi
if $USE_PIXEL_STREAMING; then
    check_port $SIGNALING_HTTP_PORT
fi
check_port $BRIDGE_PORT
check_port $FRONTEND_PORT

if ! $SKIP_CARLA && ! $USE_DOCKER; then
    if ! nvidia-smi &>/dev/null; then
        echo "ERROR: NVIDIA GPU not detected. CARLA requires a GPU."
        exit 1
    fi
fi

# ═══════════════════════════════════════════════════
# 1. CARLA UE5 Server
# ═══════════════════════════════════════════════════

if ! $SKIP_CARLA; then
    log "[1/4] Starting CARLA server..."

    if $USE_DOCKER; then
        docker rm -f carla-server 2>/dev/null || true
        docker run -d \
            --name carla-server \
            --runtime=nvidia \
            --gpus all \
            --net=host \
            -e NVIDIA_VISIBLE_DEVICES=all \
            -e NVIDIA_DRIVER_CAPABILITIES=all \
            carlasim/carla:0.10.0 \
            bash CarlaUnreal.sh \
                -RenderOffScreen -nosound \
                -carla-rpc-port=$CARLA_RPC_PORT
        log "  CARLA server (Docker): started on port $CARLA_RPC_PORT"
    else
        CARLA_PACKAGE="$CARLA_DIR/Build/Package"
        if [ ! -f "$CARLA_PACKAGE/CarlaUnreal.sh" ]; then
            echo "ERROR: CARLA package not found at $CARLA_PACKAGE"
            echo "Run: cmake --build Build --target package"
            exit 1
        fi

        CARLA_FLAGS="-RenderOffScreen -nosound -unattended"
        CARLA_FLAGS="$CARLA_FLAGS -ResX=$RES_X -ResY=$RES_Y"
        CARLA_FLAGS="$CARLA_FLAGS -carla-rpc-port=$CARLA_RPC_PORT"

        if $USE_PIXEL_STREAMING; then
            CARLA_FLAGS="$CARLA_FLAGS -PixelStreamingIP=127.0.0.1"
            CARLA_FLAGS="$CARLA_FLAGS -PixelStreamingPort=$SIGNALING_STREAM_PORT"
            CARLA_FLAGS="$CARLA_FLAGS -PixelStreamingEncoderRateControl=CBR"
            CARLA_FLAGS="$CARLA_FLAGS -PixelStreamingEncoderTargetBitrate=15000000"
            CARLA_FLAGS="$CARLA_FLAGS -PixelStreamingWebRTCFps=30"
        fi

        cd "$CARLA_PACKAGE"
        bash CarlaUnreal.sh $CARLA_FLAGS &
        PIDS+=($!)
        log "  CARLA server: PID $! on port $CARLA_RPC_PORT"
    fi

    # Wait for CARLA to be ready
    log "  Waiting for CARLA server to start..."
    for i in $(seq 1 60); do
        if python3 -c "
import carla
c = carla.Client('localhost', $CARLA_RPC_PORT)
c.set_timeout(2.0)
c.get_server_version()
" 2>/dev/null; then
            log "  CARLA server: READY"
            break
        fi
        if [ "$i" -eq 60 ]; then
            echo "ERROR: CARLA server failed to start after 60 seconds"
            exit 1
        fi
        sleep 1
    done
else
    log "[1/4] Skipping CARLA server (--skip-carla)"
fi

# ═══════════════════════════════════════════════════
# 2. Pixel Streaming Signaling Server
# ═══════════════════════════════════════════════════

if $USE_PIXEL_STREAMING && ! $USE_DOCKER; then
    log "[2/4] Starting Pixel Streaming signaling server..."

    # Find the signaling server
    SIGNALING_DIR=""
    if [ -d "$CARLA_DIR/../PixelStreamingInfrastructure/SignallingWebServer" ]; then
        SIGNALING_DIR="$CARLA_DIR/../PixelStreamingInfrastructure/SignallingWebServer"
    elif [ -n "${CARLA_UNREAL_ENGINE_PATH:-}" ] && \
         [ -d "$CARLA_UNREAL_ENGINE_PATH/Samples/PixelStreaming/WebServers/SignallingWebServer" ]; then
        SIGNALING_DIR="$CARLA_UNREAL_ENGINE_PATH/Samples/PixelStreaming/WebServers/SignallingWebServer"
    fi

    if [ -z "$SIGNALING_DIR" ] || [ ! -f "$SIGNALING_DIR/cirrus.js" ]; then
        log "  WARNING: Signaling server not found. Pixel Streaming disabled."
        log "  Clone it: git clone https://github.com/EpicGames/PixelStreamingInfrastructure.git"
        USE_PIXEL_STREAMING=false
    else
        cd "$SIGNALING_DIR"
        [ -d "node_modules" ] || npm install --silent
        node cirrus.js \
            --HttpPort $SIGNALING_HTTP_PORT \
            --StreamerPort $SIGNALING_STREAM_PORT &
        PIDS+=($!)
        log "  Signaling server: PID $! on port $SIGNALING_HTTP_PORT"
    fi
else
    log "[2/4] Skipping Pixel Streaming"
fi

# ═══════════════════════════════════════════════════
# 3. Python Bridge (FastAPI)
# ═══════════════════════════════════════════════════

log "[3/4] Starting Python bridge..."
cd "$BRIDGE_DIR"

if [ ! -d ".venv" ]; then
    python3 -m venv .venv
fi
source .venv/bin/activate
pip install -q -r requirements.txt 2>/dev/null

export CARLA_HOST=localhost
export CARLA_PORT=$CARLA_RPC_PORT
export BRIDGE_PORT=$BRIDGE_PORT
export CORS_ORIGINS="http://localhost:$FRONTEND_PORT"

uvicorn src.main:app \
    --host 0.0.0.0 \
    --port "$BRIDGE_PORT" \
    --log-level warning &
PIDS+=($!)
deactivate 2>/dev/null || true
log "  Bridge: PID ${PIDS[-1]} on port $BRIDGE_PORT"

# ═══════════════════════════════════════════════════
# 4. Vite + React Frontend
# ═══════════════════════════════════════════════════

log "[4/4] Starting frontend..."
cd "$FRONTEND_DIR"

if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules/.package-lock.json" ]; then
    npm install --silent
fi

# Build for production (faster serving)
if [ ! -d ".next" ] || [ "src" -nt ".next" ]; then
    npm run build 2>/dev/null
fi

npm run start -- --port "$FRONTEND_PORT" &
PIDS+=($!)
log "  Frontend: PID ${PIDS[-1]} on port $FRONTEND_PORT"

# ═══════════════════════════════════════════════════
# Ready
# ═══════════════════════════════════════════════════

sleep 2

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                   CARLA Web — Production                    ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                            ║"
echo "║  🌐 Frontend:          http://localhost:$FRONTEND_PORT          ║"
echo "║  🔌 Bridge API:        http://localhost:$BRIDGE_PORT          ║"
echo "║  📖 API Docs:          http://localhost:$BRIDGE_PORT/docs     ║"
echo "║  🔗 WebSocket:         ws://localhost:$BRIDGE_PORT/ws        ║"
if $USE_PIXEL_STREAMING; then
echo "║  🎥 Pixel Streaming:   http://localhost:$SIGNALING_HTTP_PORT          ║"
fi
if ! $SKIP_CARLA; then
echo "║  🚗 CARLA RPC:         localhost:$CARLA_RPC_PORT                  ║"
fi
echo "║                                                            ║"
echo "║  Press Ctrl+C to stop all services                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

wait
```

---

## Make It Executable

```bash
chmod +x /home/$USER/carla/run_production.sh
```

---

## Usage Examples

### Full production stack (everything):
```bash
./run_production.sh
```

### Without Pixel Streaming (Docker CARLA):
```bash
./run_production.sh --docker --no-pixel
```

### CARLA already running on another machine:
```bash
CARLA_HOST=192.168.0.100 ./run_production.sh --skip-carla --no-pixel
```

### Custom map and resolution:
```bash
./run_production.sh --map Town03 --res 2560x1440
```

### Development mode (just bridge + frontend, CARLA running separately):
```bash
./run_production.sh --skip-carla
```

---

## What Happens When You Run It

```
[05:30:01] Running pre-flight checks...
[05:30:01] [1/4] Starting CARLA server...
[05:30:01]   Waiting for CARLA server to start...
[05:30:15]   CARLA server: READY
[05:30:15] [2/4] Starting Pixel Streaming signaling server...
[05:30:15]   Signaling server: PID 12345 on port 42680
[05:30:15] [3/4] Starting Python bridge...
[05:30:17]   Bridge: PID 12346 on port 42692
[05:30:17] [4/4] Starting frontend...
[05:30:20]   Frontend: PID 12347 on port 42691

╔══════════════════════════════════════════════════════════════╗
║                   CARLA Web — Production                    ║
╠══════════════════════════════════════════════════════════════╣
║                                                            ║
║  🌐 Frontend:          http://localhost:42691              ║
║  🔌 Bridge API:        http://localhost:42692              ║
║  📖 API Docs:          http://localhost:42692/docs         ║
║  🔗 WebSocket:         ws://localhost:42692/ws             ║
║  🎥 Pixel Streaming:   http://localhost:42680              ║
║  🚗 CARLA RPC:         localhost:2000                      ║
║                                                            ║
║  Press Ctrl+C to stop all services                        ║
╚══════════════════════════════════════════════════════════════╝
```

Open `http://localhost:42691` in your browser — the full CARLA Web interface with real-time simulation.

---

## Quick Verification After Launch

```bash
# In another terminal:

# Check all services:
curl -s http://localhost:42692/health | python3 -m json.tool

# Expected output:
# {
#     "status": "ok",
#     "carla_connected": true,
#     "ws_clients": 0,
#     "active_sensors": 0
# }

# Spawn some traffic:
python3 PythonAPI/examples/generate_traffic.py -n 50 -w 20

# Now open http://localhost:42691 — you should see
# vehicles and pedestrians in the simulation
```

---

## Stopping

Press `Ctrl+C` once. The cleanup trap stops all processes gracefully:
```
Shutting down CARLA Web stack...
All services stopped.
```
