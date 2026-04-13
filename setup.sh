#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "=== CARLA Setup (UE5 build) ==="

# 1. Clone UE5
if [ -d ../UnrealEngine5_carla ]; then
    echo "[SKIP] UE5 already cloned."
else
    echo "[1] Cloning UE5..."
    cd ..
    git clone -b ue5-dev-carla https://github.com/CarlaUnreal/UnrealEngine.git UnrealEngine5_carla
    cd carla
fi

# 2. Build UE5
export CARLA_UNREAL_ENGINE_PATH=/home/song99/UnrealEngine5_carla
echo "export CARLA_UNREAL_ENGINE_PATH=$CARLA_UNREAL_ENGINE_PATH" >> ~/.bashrc

cd $CARLA_UNREAL_ENGINE_PATH

if [ -f Engine/Binaries/Linux/UnrealEditor ]; then
    echo "[SKIP] UE5 already built."
else
    echo "[2] Building UE5 (this takes 2-4 hours)..."
    bash Setup.sh
    bash GenerateProjectFiles.sh
    make -j$(nproc)
fi

# 3. Build CARLA
cd /home/song99/carla
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
cd /home/song99/carla/carla-web-bridge
python3 -m venv .venv 2>/dev/null || true
source .venv/bin/activate
pip install -q -r requirements.txt
pip install /home/song99/carla/PythonAPI/dist/carla-*.whl
deactivate

echo ""
echo "=== DONE ==="
echo "Run: ./run_production.sh"
