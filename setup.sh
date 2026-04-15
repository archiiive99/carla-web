#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== CARLA Setup (UE5 build) ==="

# 1. Clone UE5 (goes next to the carla checkout: <parent>/UnrealEngine5_carla)
UE5_PATH="$(cd "$SCRIPT_DIR/.." && pwd)/UnrealEngine5_carla"
if [ -d "$UE5_PATH" ]; then
    echo "[SKIP] UE5 already cloned at $UE5_PATH."
else
    echo "[1] Cloning UE5 to $UE5_PATH..."
    cd "$SCRIPT_DIR/.."
    git clone -b ue5-dev-carla https://github.com/CarlaUnreal/UnrealEngine.git UnrealEngine5_carla
    cd "$SCRIPT_DIR"
fi

# 2. Build UE5 — honour an existing CARLA_UNREAL_ENGINE_PATH (user may have
# UE5 elsewhere), otherwise point at the sibling clone from step 1.
export CARLA_UNREAL_ENGINE_PATH="${CARLA_UNREAL_ENGINE_PATH:-$UE5_PATH}"
if ! grep -q "^export CARLA_UNREAL_ENGINE_PATH=" ~/.bashrc 2>/dev/null; then
    echo "export CARLA_UNREAL_ENGINE_PATH=$CARLA_UNREAL_ENGINE_PATH" >> ~/.bashrc
fi

cd "$CARLA_UNREAL_ENGINE_PATH"

if [ -f Engine/Binaries/Linux/UnrealEditor ]; then
    echo "[SKIP] UE5 already built."
else
    echo "[2] Building UE5 (this takes 2-4 hours)..."
    bash Setup.sh
    bash GenerateProjectFiles.sh
    make -j$(nproc)
fi

# 3. Build CARLA
cd "$SCRIPT_DIR"
echo "[3] Building CARLA..."
cmake -G Ninja -S . -B Build \
    --toolchain=$PWD/CMake/Toolchain.cmake \
    -DCMAKE_BUILD_TYPE=Release \
    -DENABLE_ROS2=ON \
    -DCARLA_UNREAL_ENGINE_PATH=$CARLA_UNREAL_ENGINE_PATH

cmake --build Build -j$(nproc)

echo "[4] Installing Python API..."
cmake --build Build --target carla-python-api-install

echo "[5] Packaging..."
cmake --build Build --target package

# 4. Install carla in bridge venv
echo "[6] Installing carla in bridge venv..."
cd "$SCRIPT_DIR/carla-web-bridge"
python3 -m venv .venv 2>/dev/null || true
source .venv/bin/activate
pip install -q -r requirements.txt
pip install "$SCRIPT_DIR"/PythonAPI/dist/carla-*.whl
deactivate

echo ""
echo "=== DONE ==="
echo "Run: ./start_streaming.sh"
