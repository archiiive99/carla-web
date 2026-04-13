#!/bin/bash
#
# CARLA Web — Full Production Stack Launcher
#
# Starts all 4 services:
#   1. CARLA UE5 Server (GPU rendering + simulation)
#   2. Pixel Streaming Signaling Server (WebRTC relay)
#   3. Python Bridge (FastAPI REST + WebSocket)
#   4. React Frontend (Vite + React + shadcn/ui)
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

log() { echo "[$(date '+%H:%M:%S')] $1"; }

check_port() {
    if ss -tlnp 2>/dev/null | grep -q ":$1 "; then
        echo "ERROR: Port $1 is already in use."
        exit 1
    fi
}

# ── Pre-flight ──
log "Running pre-flight checks..."
if ! $SKIP_CARLA; then check_port $CARLA_RPC_PORT; fi
if $USE_PIXEL_STREAMING; then check_port $SIGNALING_HTTP_PORT; fi
check_port $BRIDGE_PORT
check_port $FRONTEND_PORT

# ── 1. CARLA Server ──
if ! $SKIP_CARLA; then
    log "[1/4] Starting CARLA server..."

    if $USE_DOCKER; then
        docker rm -f carla-server 2>/dev/null || true
        docker run -d --name carla-server --runtime=nvidia --gpus all --net=host \
            -e NVIDIA_VISIBLE_DEVICES=all -e NVIDIA_DRIVER_CAPABILITIES=all \
            carlasim/carla:0.10.0 \
            bash CarlaUnreal.sh -RenderOffScreen -nosound -carla-rpc-port=$CARLA_RPC_PORT
        log "  CARLA (Docker) starting on port $CARLA_RPC_PORT"
    else
        CARLA_PACKAGE="$CARLA_DIR/Build/Package"
        UE_EDITOR="${CARLA_UNREAL_ENGINE_PATH:-/home/song99/UnrealEngine5_carla}/Engine/Binaries/Linux/UnrealEditor"
        UPROJECT="$CARLA_DIR/Unreal/CarlaUnreal/CarlaUnreal.uproject"

        CARLA_FLAGS="-RenderOffScreen -nosound -unattended -ResX=$RES_X -ResY=$RES_Y"
        CARLA_FLAGS="$CARLA_FLAGS -carla-rpc-port=$CARLA_RPC_PORT"

        if $USE_PIXEL_STREAMING; then
            CARLA_FLAGS="$CARLA_FLAGS -PixelStreamingIP=127.0.0.1"
            CARLA_FLAGS="$CARLA_FLAGS -PixelStreamingPort=$SIGNALING_STREAM_PORT"
            CARLA_FLAGS="$CARLA_FLAGS -PixelStreamingEncoderRateControl=CBR"
            CARLA_FLAGS="$CARLA_FLAGS -PixelStreamingEncoderTargetBitrate=15000000"
            CARLA_FLAGS="$CARLA_FLAGS -PixelStreamingWebRTCFps=30"
        fi

        if [ -f "$CARLA_PACKAGE/CarlaUnreal.sh" ]; then
            # Use packaged build
            cd "$CARLA_PACKAGE"
            bash CarlaUnreal.sh $CARLA_FLAGS &
            PIDS+=($!)
            log "  CARLA server (package): PID $! on port $CARLA_RPC_PORT"
        elif [ -f "$UE_EDITOR" ] && [ -f "$UPROJECT" ]; then
            # Fallback: run via UnrealEditor directly
            log "  Package not found, launching via UnrealEditor..."
            CUDA_VISIBLE_DEVICES=0 "$UE_EDITOR" "$UPROJECT" -game $CARLA_FLAGS &
            PIDS+=($!)
            log "  CARLA server (editor): PID $! on port $CARLA_RPC_PORT"
        else
            echo "ERROR: No CARLA package or UnrealEditor found."
            echo "Build package: cd $CARLA_DIR && cmake --build Build --target package"
            echo "Or ensure CARLA_UNREAL_ENGINE_PATH is set."
            exit 1
        fi
    fi

    log "  Waiting for CARLA to be ready..."
    for i in $(seq 1 600); do
        if python3 -c "
import carla
c=carla.Client('localhost',$CARLA_RPC_PORT)
c.set_timeout(2.0)
c.get_server_version()
" 2>/dev/null; then
            log "  CARLA server: READY"
            break
        fi
        if [ "$i" -eq 600 ]; then
            echo "ERROR: CARLA server failed to start after 120 seconds"
            exit 1
        fi
        sleep 1
    done
else
    log "[1/4] Skipping CARLA server (--skip-carla)"
fi

# ── 2. Pixel Streaming Signaling ──
if $USE_PIXEL_STREAMING && ! $USE_DOCKER; then
    log "[2/4] Starting Pixel Streaming signaling server..."

    SIGNALING_DIR=""
    if [ -d "$CARLA_DIR/../PixelStreamingInfrastructure/SignallingWebServer" ]; then
        SIGNALING_DIR="$CARLA_DIR/../PixelStreamingInfrastructure/SignallingWebServer"
    elif [ -n "${CARLA_UNREAL_ENGINE_PATH:-}" ] && \
         [ -d "$CARLA_UNREAL_ENGINE_PATH/Samples/PixelStreaming/WebServers/SignallingWebServer" ]; then
        SIGNALING_DIR="$CARLA_UNREAL_ENGINE_PATH/Samples/PixelStreaming/WebServers/SignallingWebServer"
    fi

    if [ -z "$SIGNALING_DIR" ] || [ ! -f "$SIGNALING_DIR/cirrus.js" ]; then
        log "  WARNING: Signaling server not found. Pixel Streaming disabled."
        USE_PIXEL_STREAMING=false
    else
        cd "$SIGNALING_DIR"
        [ -d "node_modules" ] || npm install --silent 2>/dev/null
        node cirrus.js --HttpPort $SIGNALING_HTTP_PORT --StreamerPort $SIGNALING_STREAM_PORT &
        PIDS+=($!)
        log "  Signaling: PID $! on port $SIGNALING_HTTP_PORT"
    fi
else
    log "[2/4] Skipping Pixel Streaming"
fi

# ── 3. Python Bridge ──
log "[3/4] Starting Python bridge..."
cd "$BRIDGE_DIR"

if [ ! -d ".venv" ]; then
    python3 -m venv .venv
fi
source .venv/bin/activate
pip install -q -r requirements.txt 2>/dev/null

export CARLA_HOST=localhost
export CARLA_PORT=$CARLA_RPC_PORT
export BRIDGE_PORT
export CORS_ORIGINS="http://localhost:$FRONTEND_PORT"

uvicorn src.main:app --host 0.0.0.0 --port "$BRIDGE_PORT" --log-level warning &
PIDS+=($!)
deactivate 2>/dev/null || true
log "  Bridge: PID ${PIDS[-1]} on port $BRIDGE_PORT"

# ── 4. React Frontend ──
log "[4/4] Starting frontend..."
cd "$FRONTEND_DIR"

if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules/.package-lock.json" ]; then
    npm install --silent 2>/dev/null
fi

npm run dev -- --port "$FRONTEND_PORT" &
PIDS+=($!)
log "  Frontend: PID ${PIDS[-1]} on port $FRONTEND_PORT"

# ── Ready ──
sleep 2

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  CARLA Web — Production Stack Running"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "  Frontend:          http://localhost:$FRONTEND_PORT"
echo "  Bridge API:        http://localhost:$BRIDGE_PORT"
echo "  API Docs:          http://localhost:$BRIDGE_PORT/docs"
echo "  WebSocket:         ws://localhost:$BRIDGE_PORT/ws"
if $USE_PIXEL_STREAMING; then
echo "  Pixel Streaming:   http://localhost:$SIGNALING_HTTP_PORT"
fi
if ! $SKIP_CARLA; then
echo "  CARLA RPC:         localhost:$CARLA_RPC_PORT"
fi
echo ""
echo "  Press Ctrl+C to stop all services"
echo "════════════════════════════════════════════════════════════"
echo ""

wait
