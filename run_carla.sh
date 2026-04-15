#!/bin/bash
# CARLA 서버 — 자동 재시작 + 실시간 로그
#
# Usage:
#   ./run_carla.sh              # 포그라운드 실행 (로그 보임, Ctrl+C로 종료)
#   ./run_carla.sh --bg         # 백그라운드 실행
#   ./run_carla.sh --kill       # 종료
#   ./run_carla.sh --status     # 상태 확인
#   ./run_carla.sh --gpu 3      # GPU 지정

UE5_DIR="${CARLA_UNREAL_ENGINE_PATH:-/home/song99/UnrealEngine5_carla}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UPROJECT_PATH="$SCRIPT_DIR/Unreal/CarlaUnreal/CarlaUnreal.uproject"
ENGINE_PROJECT_LINK="$UE5_DIR/CarlaUnreal"
CARLA_PORT=58338
# Never 0: adapter 0 is the host's display GPU. 2/3 are the usable
# compute adapters (matches start_streaming.sh default).
GPU_ID=2
BG=false
LOG_FILE="/tmp/carla-server.log"
PID_FILE="/tmp/carla-server.pid"
MAX_RESTARTS=5

while [[ $# -gt 0 ]]; do
  case $1 in
    --gpu) GPU_ID="$2"; shift 2 ;;
    --port) CARLA_PORT="$2"; shift 2 ;;
    --bg) BG=true; shift ;;
    --kill)
      pkill -f "UnrealEditor.*carla-rpc-port=$CARLA_PORT" 2>/dev/null && echo "CARLA stopped." || echo "Not running."
      rm -f "$PID_FILE"
      exit 0 ;;
    --status)
      if /usr/bin/python3 -c "import carla;c=carla.Client('localhost',$CARLA_PORT);c.set_timeout(2);print(f'Running: CARLA {c.get_server_version()}')" 2>/dev/null; then
        echo "PID: $(cat $PID_FILE 2>/dev/null || pgrep -f 'UnrealEditor.*carla-rpc-port')"
        exit 0
      else
        # Check if process exists but not responding
        PID=$(pgrep -f "UnrealEditor.*carla-rpc-port=$CARLA_PORT" 2>/dev/null | head -1)
        if [ -n "$PID" ]; then
          echo "Process alive (PID $PID) but RPC not responding — may be loading or hung."
        else
          echo "Not running."
        fi
        exit 1
      fi ;;
    *) shift ;;
  esac
done

start_carla() {
  # Kill any zombie
  OLD_PID=$(pgrep -f "UnrealEditor.*carla-rpc-port=$CARLA_PORT" 2>/dev/null | head -1)
  if [ -n "$OLD_PID" ]; then
    echo "[$(date +%H:%M:%S)] Killing stale CARLA (PID $OLD_PID)..."
    kill -9 "$OLD_PID" 2>/dev/null
    sleep 5
  fi

  echo "[$(date +%H:%M:%S)] Starting CARLA on GPU $GPU_ID, port $CARLA_PORT..."
  export CUDA_VISIBLE_DEVICES=$GPU_ID
  ln -sfn "$SCRIPT_DIR/Unreal/CarlaUnreal" "$ENGINE_PROJECT_LINK"

  # The old -ExecCmds='r.RayTracing=0,r.RHIThread.Enable 0,r.RHICmdBypass 1'
  # was intentionally removed during the iteration-01 render-parity work
  # (see start_streaming.sh header) — it disabled the render thread and
  # forced immediate-mode RHI dispatch, starving the post-process stack and
  # producing the underexposed / flat-lit output that blocked parity testing.
  "$UE5_DIR/Engine/Binaries/Linux/UnrealEditor" \
    "$UPROJECT_PATH" \
    -game -RenderOffScreen -nosound -unattended \
    -ResX=640 -ResY=480 -carla-rpc-port=$CARLA_PORT \
    -graphicsadapter=$GPU_ID \
    >> "$LOG_FILE" 2>&1 &
  CARLA_PID=$!
  disown $CARLA_PID
  echo "$CARLA_PID" > "$PID_FILE"
  echo "[$(date +%H:%M:%S)] PID: $CARLA_PID"

  # Wait for ready
  for i in $(seq 1 300); do
    if /usr/bin/python3 -c "import carla;c=carla.Client('localhost',$CARLA_PORT);c.set_timeout(2);c.get_world();print('OK')" 2>/dev/null; then
      echo "[$(date +%H:%M:%S)] ✓ CARLA ready!"
      return 0
    fi
    if ! kill -0 $CARLA_PID 2>/dev/null; then
      echo "[$(date +%H:%M:%S)] ✗ CARLA crashed during startup"
      return 1
    fi
    [ $((i % 30)) -eq 0 ] && echo "[$(date +%H:%M:%S)] ...loading (${i}s)"
    sleep 1
  done
  echo "[$(date +%H:%M:%S)] ✗ Timeout"
  return 1
}

run_with_auto_restart() {
  RESTART_COUNT=0
  while [ $RESTART_COUNT -lt $MAX_RESTARTS ]; do
    # Check if already running and healthy
    if /usr/bin/python3 -c "import carla;c=carla.Client('localhost',$CARLA_PORT);c.set_timeout(2);c.get_world()" 2>/dev/null; then
      echo "[$(date +%H:%M:%S)] CARLA is healthy."
    else
      if [ $RESTART_COUNT -gt 0 ]; then
        echo "[$(date +%H:%M:%S)] === Auto-restart #$RESTART_COUNT ==="
      fi
      start_carla || {
        RESTART_COUNT=$((RESTART_COUNT + 1))
        echo "[$(date +%H:%M:%S)] Restart failed. Waiting 10s... ($RESTART_COUNT/$MAX_RESTARTS)"
        sleep 10
        continue
      }
      RESTART_COUNT=0
    fi

    # Health monitor — check every 30s, restart if dead
    while true; do
      sleep 30
      if ! /usr/bin/python3 -c "import carla;c=carla.Client('localhost',$CARLA_PORT);c.set_timeout(5);c.get_world()" 2>/dev/null; then
        PID=$(cat "$PID_FILE" 2>/dev/null)
        if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
          echo "[$(date +%H:%M:%S)] CARLA hung (process alive but RPC dead). Killing..."
          kill -9 "$PID" 2>/dev/null
          sleep 5
        else
          echo "[$(date +%H:%M:%S)] CARLA process died."
        fi
        RESTART_COUNT=$((RESTART_COUNT + 1))
        break
      fi
    done
  done

  echo "[$(date +%H:%M:%S)] Max restarts ($MAX_RESTARTS) reached. Giving up."
  echo "Check logs: tail -50 $LOG_FILE"
}

# Background mode
if [ "$BG" = true ]; then
  nohup bash -c "$(declare -f start_carla run_with_auto_restart); GPU_ID=$GPU_ID CARLA_PORT=$CARLA_PORT UE5_DIR=$UE5_DIR SCRIPT_DIR=$SCRIPT_DIR LOG_FILE=$LOG_FILE PID_FILE=$PID_FILE MAX_RESTARTS=$MAX_RESTARTS run_with_auto_restart" > /tmp/carla-watchdog.log 2>&1 &
  disown $!
  echo "CARLA watchdog started in background (PID: $!)"
  echo "Logs: tail -f $LOG_FILE"
  echo "Watchdog: tail -f /tmp/carla-watchdog.log"
  exit 0
fi

# Foreground mode — show logs
echo "=== CARLA Server (Ctrl+C to stop) ==="
echo "GPU: $GPU_ID | Port: $CARLA_PORT | Log: $LOG_FILE"
echo ""

trap '
  echo ""
  echo "Stopping CARLA..."
  pkill -f "UnrealEditor.*carla-rpc-port=$CARLA_PORT" 2>/dev/null
  rm -f "$PID_FILE"
  echo "Stopped."
  exit 0
' INT TERM

run_with_auto_restart &
WATCHDOG_PID=$!

# Show logs in real-time
sleep 2
tail -f "$LOG_FILE" &
TAIL_PID=$!

wait $WATCHDOG_PID
kill $TAIL_PID 2>/dev/null
