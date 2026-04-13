#!/bin/bash
# CARLA Web — 모든 서비스 종료
echo "Killing all CARLA Web services..."
pkill -f "UnrealEditor.*carla-rpc-port" 2>/dev/null && echo "  CARLA killed" || echo "  CARLA not running"
pkill -f "uvicorn.*58337" 2>/dev/null && echo "  Bridge killed" || echo "  Bridge not running"
pkill -f "vite.*58336" 2>/dev/null && echo "  Frontend killed" || echo "  Frontend not running"
sleep 2
echo "Done."
