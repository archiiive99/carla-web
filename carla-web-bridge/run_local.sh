#!/usr/bin/env bash
#
# CARLA Web Bridge — Local development launcher
#
# Usage:
#   ./run_local.sh                    # Default: localhost:8000
#   ./run_local.sh --port 9000        # Custom port
#   ./run_local.sh --carla-host 192.168.1.100  # Remote CARLA server
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Defaults
BRIDGE_PORT="${BRIDGE_PORT:-8000}"
CARLA_HOST="${CARLA_HOST:-localhost}"
CARLA_PORT="${CARLA_PORT:-2000}"
CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:3000}"

# Parse CLI args
while [[ $# -gt 0 ]]; do
    case $1 in
        --port)       BRIDGE_PORT="$2"; shift 2 ;;
        --carla-host) CARLA_HOST="$2"; shift 2 ;;
        --carla-port) CARLA_PORT="$2"; shift 2 ;;
        --cors)       CORS_ORIGINS="$2"; shift 2 ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --port PORT          Bridge port (default: 8000)"
            echo "  --carla-host HOST    CARLA server host (default: localhost)"
            echo "  --carla-port PORT    CARLA server port (default: 2000)"
            echo "  --cors ORIGINS       CORS origins (default: http://localhost:3000)"
            echo "  -h, --help           Show this help"
            exit 0
            ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# Check Python
if ! command -v python3 &>/dev/null; then
    echo "Error: python3 is not installed"
    exit 1
fi

# Create venv if not exists
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment…"
    python3 -m venv .venv
fi

# Activate venv
source .venv/bin/activate

# Install dependencies
echo "Installing dependencies…"
pip install -q -r requirements.txt

# Export environment
export CARLA_HOST CARLA_PORT BRIDGE_PORT CORS_ORIGINS

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║         CARLA Web Bridge                     ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  Bridge:  http://localhost:${BRIDGE_PORT}              ║"
echo "║  CARLA:   ${CARLA_HOST}:${CARLA_PORT}                    ║"
echo "║  WS:      ws://localhost:${BRIDGE_PORT}/ws             ║"
echo "║  Health:  http://localhost:${BRIDGE_PORT}/health        ║"
echo "║  Docs:    http://localhost:${BRIDGE_PORT}/docs          ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# Run with auto-reload for development
exec uvicorn src.main:app \
    --host 0.0.0.0 \
    --port "$BRIDGE_PORT" \
    --reload \
    --reload-dir src
