#!/bin/bash
# CARLA Web Streaming — one-command launch
# tmux session with panes for CARLA + Bridge + Frontend + (optionally) Signaling
#
# Usage:
#   ./start_streaming.sh                      # Launch all (no pixel streaming)
#   ./start_streaming.sh --pixel-streaming     # Launch all with UE5 Pixel Streaming
#   ./start_streaming.sh --no-carla            # Bridge + Frontend only
#   ./start_streaming.sh --kill                # Stop everything
#   ./start_streaming.sh --status              # Health check
#
# Access:
#   Browser: http://<server-ip>:58336
#   SSH port forwarding: ssh -L 58336:localhost:58336 -L 58337:localhost:58337 -L 58341:localhost:58341 user@server
#   tmux session: tmux attach -t carla-web

set -euo pipefail

SESSION="carla-web"
GPU=2
CARLA_PORT=58338
BRIDGE_PORT=58337
FRONTEND_PORT=58336
SIGNALING_PLAYER_PORT=58341
SIGNALING_STREAMER_PORT=8888
NO_CARLA=false
PIXEL_STREAMING=false

ROOT="/data1/song99/carla"
UE5="/home/song99/UnrealEngine5_carla"
BRIDGE="$ROOT/carla-web-bridge"
FRONTEND="$ROOT/carla-web"
SIGNALING_SERVER="$UE5/Engine/Plugins/Media/PixelStreaming2/Resources/WebServers/SignallingWebServer"

while [[ $# -gt 0 ]]; do
  case $1 in
    --no-carla) NO_CARLA=true; shift ;;
    --pixel-streaming) PIXEL_STREAMING=true; shift ;;
    --gpu) GPU="$2"; shift 2 ;;
    --kill)
      echo "Stopping carla-web..."
      tmux kill-session -t "$SESSION" 2>/dev/null && echo "Done." || echo "Not running."
      exit 0 ;;
    --status)
      echo "=== Processes ==="
      tmux has-session -t "$SESSION" 2>/dev/null && echo "tmux session: running" || echo "tmux session: not found"
      echo ""
      echo "=== Health ==="
      curl -sf "http://127.0.0.1:$BRIDGE_PORT/health" 2>/dev/null | python3 -m json.tool || echo "Bridge: not responding"
      echo ""
      echo "=== Session ==="
      curl -sf "http://127.0.0.1:$BRIDGE_PORT/api/realtime/session" 2>/dev/null | python3 -m json.tool || echo "Session: not responding"
      echo ""
      echo "=== Frontend ==="
      curl -sf -o /dev/null "http://127.0.0.1:$FRONTEND_PORT" && echo "Frontend: OK" || echo "Frontend: not responding"
      echo ""
      echo "=== Pixel Streaming Signaling ==="
      ss -tln | grep -q ":$SIGNALING_PLAYER_PORT " && echo "Signaling: listening (port $SIGNALING_PLAYER_PORT)" || echo "Signaling: not running"
      exit 0 ;;
    *) shift ;;
  esac
done

# If session already running, prompt for action
if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "carla-web tmux session is already running."
  echo ""
  echo "Choose one:"
  echo "  1) Keep current session"
  echo "  2) Kill and restart session"
  echo ""

  if [ ! -t 0 ]; then
    echo "No interactive terminal detected. Keeping current session."
    echo "  tmux attach -t $SESSION"
    echo "  ./start_streaming.sh --status"
    exit 0
  fi

  read -r -p "Select [1/2] (default: 1): " RESTART_CHOICE
  case "${RESTART_CHOICE:-1}" in
    2)
      echo "Killing existing session..."
      tmux kill-session -t "$SESSION"
      sleep 1
      ;;
    *)
      echo "Keeping current session."
      echo "  tmux attach -t $SESSION"
      echo "  ./start_streaming.sh --status"
      exit 0
      ;;
  esac
fi

echo ""
echo "=============================================="
echo "        CARLA Web Streaming"
echo "=============================================="
echo ""

# Build the CARLA command line flags.
#
# Quality-first configuration (iteration 01 parity harness reference):
#   -game                  : standalone runtime, not the editor UI
#   -RenderOffScreen       : headless (no window); uses offscreen render target
#   -nosound -unattended   : no audio, no interactive prompts
#   -ResX=1920 -ResY=1080  : main viewport resolution; sensor.camera.rgb uses
#                            its own image_size_* attributes, but some post-
#                            process paths still reference the viewport
#   -sg.*Quality=4         : UE5 scalability groups at Epic (max). Without
#                            these, the engine defaults to runtime-detected
#                            quality which on a headless -RenderOffScreen
#                            process lands at Low and produces the
#                            underexposed / flat-lit frames that blocked the
#                            render-parity harness in iteration 01.
#   -carla-rpc-port        : CARLA Python API port
#
# Removed from the previous config because they suppressed render quality:
#   -benchmark -fps=20  : forced deterministic-time mode that skipped auto-
#                         exposure convergence
#   -ExecCmds='r.RayTracing=0,r.RHIThread.Enable 0,r.RHICmdBypass 1'
#                       : disabled the render thread and forced immediate-
#                         mode RHI dispatch, starving the post-process stack
CARLA_ARGS="-game -RenderOffScreen -nosound -unattended"
CARLA_ARGS+=" -ResX=1920 -ResY=1080"
CARLA_ARGS+=" -carla-rpc-port=$CARLA_PORT"
CARLA_ARGS+=" -sg.AntiAliasingQuality=4"
CARLA_ARGS+=" -sg.PostProcessQuality=4"
CARLA_ARGS+=" -sg.ShadowQuality=4"
CARLA_ARGS+=" -sg.TextureQuality=4"
CARLA_ARGS+=" -sg.EffectsQuality=4"
CARLA_ARGS+=" -sg.FoliageQuality=4"
CARLA_ARGS+=" -sg.ShadingQuality=4"

if [ "$PIXEL_STREAMING" = true ]; then
  # PixelStreaming2 flags: UE5 connects to signaling server's streamer_port
  CARLA_ARGS+=" -PixelStreamingURL=ws://127.0.0.1:$SIGNALING_STREAMER_PORT"
  echo "[Pixel Streaming] Enabled. UE5 will connect to signaling at ws://127.0.0.1:$SIGNALING_STREAMER_PORT"
  echo "[Pixel Streaming] Browser clients connect to ws://<host>:$SIGNALING_PLAYER_PORT"
  echo ""
fi

# tmux session: pane 0 = Frontend
tmux new-session -d -s "$SESSION" -n main
tmux send-keys -t "$SESSION" "cd $FRONTEND && npx vite --host 0.0.0.0 --port $FRONTEND_PORT" Enter

if [ "$NO_CARLA" = false ]; then
  # pane 1: CARLA Server
  # Force UE5 to use the selected GPU:
  #   CUDA_VISIBLE_DEVICES=$GPU → CUDA workloads see only this GPU as device 0
  #   -graphicsadapter=$GPU     → UE5 Vulkan renderer picks physical adapter $GPU
  tmux split-window -t "$SESSION" -v
  tmux send-keys -t "$SESSION" "cd $ROOT && CUDA_VISIBLE_DEVICES=$GPU $UE5/Engine/Binaries/Linux/UnrealEditor $ROOT/Unreal/CarlaUnreal/CarlaUnreal.uproject /Game/Carla/Maps/Town01_Opt $CARLA_ARGS -graphicsadapter=$GPU" Enter
fi

# pane 2: Bridge (slight delay for CARLA to start)
# Dev mode with reload so code changes apply without restarting
tmux split-window -t "$SESSION" -v
tmux send-keys -t "$SESSION" "cd $BRIDGE && source .venv/bin/activate && echo 'Waiting for CARLA...' && sleep 5 && uvicorn src.main:app --host 0.0.0.0 --port $BRIDGE_PORT --reload --reload-dir src" Enter

# pane 3: Signaling server (only when pixel streaming is enabled)
if [ "$PIXEL_STREAMING" = true ]; then
  tmux split-window -t "$SESSION" -v
  tmux send-keys -t "$SESSION" "cd $SIGNALING_SERVER && node dist/index.js --no_config --streamer_port $SIGNALING_STREAMER_PORT --player_port $SIGNALING_PLAYER_PORT --console_messages verbose --log_config 2>&1" Enter
fi

# Clean up layout
tmux select-layout -t "$SESSION" even-vertical

echo "Started! tmux session: $SESSION"
echo ""
echo "=============================================="
if [ "$PIXEL_STREAMING" = true ]; then
  echo "  Frontend:   http://127.0.0.1:$FRONTEND_PORT"
  echo "  Bridge:     http://127.0.0.1:$BRIDGE_PORT"
  echo "  CARLA:      localhost:$CARLA_PORT (GPU $GPU)"
  echo "  Signaling:  ws://127.0.0.1:$SIGNALING_PLAYER_PORT (player)"
  echo "              ws://127.0.0.1:$SIGNALING_STREAMER_PORT (streamer)"
  echo "----------------------------------------------"
  echo "  tmux attach -t $SESSION"
  echo "  ./start_streaming.sh --status"
  echo "  ./start_streaming.sh --kill"
  echo "----------------------------------------------"
  echo "  SSH port forwarding (for local browser):"
  echo "  ssh -L $FRONTEND_PORT:localhost:$FRONTEND_PORT \\"
  echo "      -L $BRIDGE_PORT:localhost:$BRIDGE_PORT \\"
  echo "      -L $SIGNALING_PLAYER_PORT:localhost:$SIGNALING_PLAYER_PORT user@neo"
else
  echo "  Frontend:  http://127.0.0.1:$FRONTEND_PORT"
  echo "  Bridge:    http://127.0.0.1:$BRIDGE_PORT"
  echo "  CARLA:     localhost:$CARLA_PORT (GPU $GPU)"
  echo "----------------------------------------------"
  echo "  tmux attach -t $SESSION"
  echo "  ./start_streaming.sh --status"
  echo "  ./start_streaming.sh --kill"
  echo "----------------------------------------------"
  echo "  SSH port forwarding (for local browser):"
  echo "  ssh -L $FRONTEND_PORT:localhost:$FRONTEND_PORT \\"
  echo "      -L $BRIDGE_PORT:localhost:$BRIDGE_PORT user@neo"
fi
echo "=============================================="
