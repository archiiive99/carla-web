#!/bin/bash
#
# CARLA Web — Bridge + Frontend only (CARLA 서버는 start_carla.sh로 따로)
# Ctrl+C → 둘 다 종료, CARLA는 살아있음
#
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BRIDGE_DIR="$PROJECT_ROOT/carla-web-bridge"
FRONTEND_DIR="$SCRIPT_DIR"

FRONTEND_PORT=58336
BRIDGE_PORT=58337
CARLA_PORT=58338

PIDS=()
cleanup() {
  echo ""
  echo "Shutting down bridge + frontend..."
  for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done
  wait "${PIDS[@]}" 2>/dev/null || true
  echo "Done. (CARLA 서버는 계속 실행 중)"
}
trap cleanup EXIT INT TERM

# Check CARLA
if /usr/bin/python3 -c "import carla;c=carla.Client('localhost',$CARLA_PORT);c.set_timeout(2);print(f'  CARLA {c.get_server_version()} connected')" 2>/dev/null; then
  echo "[✓] CARLA already running"
else
  echo "[!] CARLA not running. Start it first: ./start_carla.sh"
  echo "    Continuing anyway — bridge will auto-connect when CARLA starts."
fi

# ── 1. Bridge ──
echo "[1/2] Starting bridge..."
cd "$BRIDGE_DIR"
[ -d ".venv" ] || python3 -m venv .venv
source .venv/bin/activate
pip install -q -r requirements.txt 2>/dev/null
export CARLA_HOST=localhost CARLA_PORT BRIDGE_PORT CORS_ORIGINS="http://localhost:$FRONTEND_PORT,http://127.0.0.1:$FRONTEND_PORT"
uvicorn src.main:app --host 0.0.0.0 --port "$BRIDGE_PORT" --reload --reload-dir src &
PIDS+=($!)
deactivate 2>/dev/null || true

# ── 2. Frontend ──
echo "[2/2] Starting frontend..."
cd "$FRONTEND_DIR"
[ -d "node_modules" ] || npm install
npm run dev &
PIDS+=($!)

sleep 3
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  CARLA Web                               ║"
echo "╠══════════════════════════════════════════╣"
echo "║  Frontend:  http://localhost:$FRONTEND_PORT   ║"
echo "║  Bridge:    http://localhost:$BRIDGE_PORT   ║"
echo "║  API Docs:  http://localhost:$BRIDGE_PORT/docs ║"
echo "╠══════════════════════════════════════════╣"
echo "║  Ctrl+C → bridge+frontend 종료           ║"
echo "║  CARLA는 별도 (start_carla.sh)            ║"
echo "╚══════════════════════════════════════════╝"
echo ""
wait
