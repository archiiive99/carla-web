#!/bin/bash
#
# CARLA Web — Full Stack Local Launch
# CARLA 서버 + Python 브릿지 + React 프론트엔드 한번에 실행
#
# Usage:
#   ./run_local.sh              # 전부 실행 (CARLA + Bridge + Frontend)
#   ./run_local.sh --no-carla   # CARLA 서버 없이 (Bridge + Frontend만)
#   ./run_local.sh --gpu 3      # 특정 GPU 사용
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIDGE_DIR="$SCRIPT_DIR/carla-web-bridge"
FRONTEND_DIR="$SCRIPT_DIR/carla-web"
# Honour CARLA_UNREAL_ENGINE_PATH, else the sibling clone from setup.sh.
UE5_DIR="${CARLA_UNREAL_ENGINE_PATH:-$(cd "$SCRIPT_DIR/.." && pwd)/UnrealEngine5_carla}"
UPROJECT_PATH="$SCRIPT_DIR/Unreal/CarlaUnreal/CarlaUnreal.uproject"
ENGINE_PROJECT_LINK="$UE5_DIR/CarlaUnreal"

FRONTEND_PORT=58336
BRIDGE_PORT=58337
CARLA_PORT=58338
GPU_ID=3
NO_CARLA=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --no-carla)  NO_CARLA=true; shift ;;
    --gpu)       GPU_ID="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--no-carla] [--gpu N]"
      echo "  --no-carla   Bridge + Frontend only"
      echo "  --gpu N      GPU for CARLA (default: 3)"
      exit 0 ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

PIDS=()
cleanup() {
  echo ""
  echo "Shutting down..."
  for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done
  wait "${PIDS[@]}" 2>/dev/null || true
  echo "Done."
}
trap cleanup EXIT INT TERM

# ── 1. CARLA Server ──
if [ "$NO_CARLA" = false ]; then
  echo "[1/3] Starting CARLA server (GPU $GPU_ID)..."
  # UE5's Vulkan renderer ignores CUDA_VISIBLE_DEVICES — it picks a
  # physical adapter by -graphicsadapter. Pass both so the (rare) CUDA
  # workload and the primary render path both land on the selected GPU.
  export CUDA_VISIBLE_DEVICES=$GPU_ID
  ln -sfn "$SCRIPT_DIR/Unreal/CarlaUnreal" "$ENGINE_PROJECT_LINK"
  "$UE5_DIR/Engine/Binaries/Linux/UnrealEditor" \
    "$UPROJECT_PATH" \
    -game -RenderOffScreen -nosound -unattended \
    -ResX=640 -ResY=480 -carla-rpc-port=$CARLA_PORT \
    -graphicsadapter=$GPU_ID \
    > /tmp/carla-server.log 2>&1 &
  PIDS+=($!)
  echo "  PID: ${PIDS[-1]} (log: /tmp/carla-server.log)"
  echo "  Waiting for CARLA..."
  for i in $(seq 1 300); do
    if /usr/bin/python3 -c "
import carla; c = carla.Client('localhost', $CARLA_PORT); c.set_timeout(2.0)
print(f'  CARLA {c.get_server_version()} ready — {c.get_world().get_map().name}')
" 2>/dev/null; then break; fi
    kill -0 "${PIDS[-1]}" 2>/dev/null || { echo "  CARLA crashed! Check /tmp/carla-server.log"; exit 1; }
    [ $((i % 30)) -eq 0 ] && echo "  ...loading (${i}s)"
    sleep 1
  done
else
  echo "[1/3] Skipping CARLA (--no-carla)"
fi

# ── 2. Bridge ──
echo "[2/3] Starting bridge..."
cd "$BRIDGE_DIR"
[ -d ".venv" ] || python3 -m venv .venv
source .venv/bin/activate
# Dev launcher — pull in test deps too (requirements-dev.txt includes
# requirements.txt transitively).
pip install -q -r requirements-dev.txt 2>/dev/null
export CARLA_HOST=localhost CARLA_PORT BRIDGE_PORT CORS_ORIGINS="http://localhost:$FRONTEND_PORT,http://127.0.0.1:$FRONTEND_PORT"
uvicorn src.main:app --host 0.0.0.0 --port "$BRIDGE_PORT" --reload --reload-dir src > /tmp/bridge.log 2>&1 &
PIDS+=($!)
deactivate 2>/dev/null || true
sleep 2

# ── 3. Frontend ──
echo "[3/3] Starting frontend..."
cd "$FRONTEND_DIR"
[ -d "node_modules" ] || npm install
npx vite --port $FRONTEND_PORT --host 0.0.0.0 > /tmp/frontend.log 2>&1 &
PIDS+=($!)
sleep 3

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║           CARLA Web — Running                ║"
echo "╠══════════════════════════════════════════════╣"
[ "$NO_CARLA" = false ] && \
echo "║  CARLA:     localhost:$CARLA_PORT (GPU $GPU_ID)          ║"
echo "║  Frontend:  http://localhost:$FRONTEND_PORT            ║"
echo "║  Bridge:    http://localhost:$BRIDGE_PORT            ║"
echo "║  API Docs:  http://localhost:$BRIDGE_PORT/docs        ║"
echo "║  WebSocket: ws://localhost:$BRIDGE_PORT/ws            ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  Ctrl+C to stop all                          ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
wait
