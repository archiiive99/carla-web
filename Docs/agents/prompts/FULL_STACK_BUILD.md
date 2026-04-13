# CARLA Web — FULL STACK BUILD (Engine + Backend + Frontend)

> **DO NOT STOP. DO NOT ASK. DO NOT PAUSE. Execute every step from top to bottom until the final verification passes. If something fails, fix it and continue. The only acceptable end state is: CARLA UE5 server running, Python bridge connected, React frontend showing live simulation data in the browser.**

---

## WHAT YOU ARE BUILDING

A complete, working system where:
1. Unreal Engine 5.5 renders the CARLA simulation on the GPU
2. A Python bridge connects to the CARLA server and streams data over WebSocket
3. A React frontend displays live sensor feeds, vehicle positions, and simulation controls in the browser

**All three must be running and connected. A UI shell with no data is NOT acceptable.**

---

## MACHINE STATE (already verified)

- **GPU:** 4x NVIDIA RTX A6000 (48GB VRAM each) — more than enough
- **RAM:** 503 GB — more than enough
- **Disk:** 951 GB free — more than enough
- **OS:** Ubuntu Linux (verified)
- **NVIDIA Driver:** 570.195.03, CUDA 12.8 — verified working
- **Git user:** aarchiiive (archiiive99@gmail.com)
- **CARLA source:** `/home/song99/carla` (ue5-dev branch, already cloned)
- **CARLA content:** `/home/song99/carla/Unreal/CarlaUnreal/Content/Carla/` — already populated (Animations, Blueprints, HDMaps, etc.)
- **Frontend:** `/home/song99/carla/carla-web/` — Vite + React, already built (112 TS files, builds clean)
- **Bridge:** `/home/song99/carla/carla-web-bridge/` — FastAPI, already built (25 Python files)
- **UE5:** NOT installed — must build from source
- **CARLA package:** NOT built — must build
- **`carla` Python module:** NOT installed — must build and install
- **Pixel Streaming:** NOT enabled — must enable

---

## PRE-REQUISITE: GitHub Token

The user MUST set this environment variable before this prompt can execute. The UE5 source is in a private repo that requires Epic Games / GitHub access.

```bash
export GIT_LOCAL_CREDENTIALS=github_username@github_personal_access_token
```

If this variable is not set, **ask the user to set it and provide instructions:**
1. Go to https://www.unrealengine.com/en-US/ue-on-github — link GitHub to Epic Games
2. Go to https://github.com/settings/tokens — create token with `repo` scope
3. `export GIT_LOCAL_CREDENTIALS=username@token`

**Do NOT proceed without this variable.**

---

## PHASE 1: SYSTEM PREREQUISITES (10 minutes)

```bash
cd /home/song99/carla

# Install all required system packages
sudo apt update
sudo apt install -y \
  build-essential make ninja-build cmake \
  libvulkan1 libvulkan-dev \
  libpng-dev libtiff5-dev libjpeg-dev \
  libxml2-dev libxerces-c-dev \
  libnss3-dev libatk-bridge2.0-dev libxkbcommon-dev \
  libgbm-dev libpango1.0-dev libasound2-dev \
  libsdl2-dev libsdl2-2.0-0 \
  python3 python3-dev python3-pip python3-venv \
  git git-lfs curl wget rsync unzip \
  libtool sed tzdata xdg-user-dirs \
  libturbojpeg0-dev \
  nodejs npm
```

Verify CMake >= 3.28:
```bash
cmake_version=$(cmake --version | head -1 | grep -oP '\d+\.\d+')
if (( $(echo "$cmake_version < 3.28" | bc -l) )); then
  wget -q https://github.com/Kitware/CMake/releases/download/v3.28.3/cmake-3.28.3-linux-x86_64.tar.gz
  sudo tar -xzf cmake-3.28.3-linux-x86_64.tar.gz -C /opt/
  export PATH=/opt/cmake-3.28.3-linux-x86_64/bin:$PATH
  echo 'export PATH=/opt/cmake-3.28.3-linux-x86_64/bin:$PATH' >> ~/.bashrc
fi
```

Install Python dependencies:
```bash
pip3 install --user psutil requests scikit-build-core wheel "numpy<2.0" setuptools build pygame
```

**Checkpoint:** `cmake --version` shows 3.28+, `nvidia-smi` works, `python3 --version` shows 3.10+.

---

## PHASE 2: BUILD UNREAL ENGINE 5.5 (2-4 hours)

This is the longest step. UE5 must be built from source because CARLA uses a custom fork.

```bash
cd /home/song99

# Clone CARLA's UE5 fork
git clone -b ue5-dev-carla https://github.com/CarlaUnreal/UnrealEngine.git UnrealEngine5_carla

cd UnrealEngine5_carla

# UE5 setup (downloads binary dependencies, ~10-20 GB)
./Setup.sh

# Generate project files
./GenerateProjectFiles.sh

# Build UE5 (use all CPU cores — this machine has plenty of RAM)
make -j$(nproc)
```

Set the environment variable:
```bash
export CARLA_UNREAL_ENGINE_PATH=/home/song99/UnrealEngine5_carla
echo 'export CARLA_UNREAL_ENGINE_PATH=/home/song99/UnrealEngine5_carla' >> ~/.bashrc
```

**Checkpoint:** `/home/song99/UnrealEngine5_carla/Engine/Binaries/Linux/UnrealEditor` exists.

---

## PHASE 3: ENABLE PIXEL STREAMING (5 minutes)

Edit `/home/song99/carla/Unreal/CarlaUnreal/CarlaUnreal.uproject`.

Add to the `"Plugins"` array (if not already present):
```json
{
    "Name": "PixelStreaming",
    "Enabled": true
},
{
    "Name": "PixelStreamingPlayer",
    "Enabled": true
}
```

---

## PHASE 4: BUILD CARLA (30-60 minutes)

```bash
cd /home/song99/carla

# Configure CMake
cmake -G Ninja -S . -B Build \
  --toolchain=$PWD/CMake/Toolchain.cmake \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_CARLA_CLIENT=ON \
  -DBUILD_CARLA_SERVER=ON \
  -DBUILD_PYTHON_API=ON \
  -DBUILD_CARLA_UNREAL=ON

# Build everything
cmake --build Build -j$(nproc)

# Build and install the carla Python API
cmake --build Build --target carla-python-api-install

# Package CARLA for deployment
cmake --build Build --target package
```

**Checkpoint:**
- `python3 -c "import carla; print(carla.__version__)"` prints a version
- `/home/song99/carla/Build/Package/CarlaUnreal.sh` exists

---

## PHASE 5: INSTALL CARLA PYTHON API IN BRIDGE VENV (2 minutes)

```bash
cd /home/song99/carla/carla-web-bridge

# Create/activate venv
python3 -m venv .venv
source .venv/bin/activate

# Install bridge dependencies
pip install -r requirements.txt

# Install the carla wheel we just built
pip install /home/song99/carla/PythonAPI/dist/carla-*.whl

# Verify
python3 -c "import carla; print('carla', carla.__version__)"

deactivate
```

**Checkpoint:** Inside the bridge venv, `import carla` works.

---

## PHASE 6: SET UP PIXEL STREAMING SIGNALING SERVER (5 minutes)

```bash
cd /home/song99

# Clone the Pixel Streaming infrastructure (signaling server)
if [ ! -d "PixelStreamingInfrastructure" ]; then
  git clone https://github.com/EpicGames/PixelStreamingInfrastructure.git
fi

cd PixelStreamingInfrastructure/SignallingWebServer
npm install
```

**Checkpoint:** `/home/song99/PixelStreamingInfrastructure/SignallingWebServer/cirrus.js` exists.

---

## PHASE 7: TEST CARLA SERVER STANDALONE (5 minutes)

Start CARLA without Pixel Streaming first to verify it works:

```bash
cd /home/song99/carla/Build/Package

# Start CARLA headless
./CarlaUnreal.sh -RenderOffScreen -nosound -carla-rpc-port=2000 &
CARLA_PID=$!

# Wait for server to be ready (up to 60 seconds)
for i in $(seq 1 60); do
  python3 -c "
import carla
c = carla.Client('localhost', 2000)
c.set_timeout(2.0)
print('CARLA', c.get_server_version(), 'on map', c.get_world().get_map().name)
" 2>/dev/null && break
  sleep 1
done

# If it worked, spawn some traffic as a test
cd /home/song99/carla/PythonAPI/examples
pip3 install -r requirements.txt 2>/dev/null
python3 generate_traffic.py -n 30 -w 10 &
sleep 5

# Verify actors exist
python3 -c "
import carla
c = carla.Client('localhost', 2000)
w = c.get_world()
actors = w.get_actors()
vehicles = [a for a in actors if 'vehicle' in a.type_id]
walkers = [a for a in actors if 'walker' in a.type_id]
print(f'Actors: {len(actors)} total, {len(vehicles)} vehicles, {len(walkers)} walkers')
"

# Stop CARLA for now
kill $CARLA_PID 2>/dev/null
wait $CARLA_PID 2>/dev/null
```

**Checkpoint:** CARLA server starts, reports version, map name, and spawned actors.

---

## PHASE 8: LAUNCH FULL PRODUCTION STACK (all 4 services)

Now start everything together. The run_production.sh script at `/home/song99/carla/run_production.sh` handles this, but let's verify the exact sequence works:

### Service 1: Pixel Streaming Signaling Server
```bash
cd /home/song99/PixelStreamingInfrastructure/SignallingWebServer
node cirrus.js --HttpPort 42680 --StreamerPort 42688 &
```

### Service 2: CARLA UE5 Server with Pixel Streaming
```bash
cd /home/song99/carla/Build/Package
./CarlaUnreal.sh \
  -PixelStreamingIP=127.0.0.1 \
  -PixelStreamingPort=42688 \
  -RenderOffScreen \
  -ResX=1920 -ResY=1080 \
  -nosound -unattended \
  -carla-rpc-port=2000 &
```

Wait for CARLA to be ready:
```bash
for i in $(seq 1 120); do
  python3 -c "import carla; carla.Client('localhost',2000).set_timeout(2); carla.Client('localhost',2000).get_server_version()" 2>/dev/null && break
  sleep 1
done
```

### Service 3: Python Bridge
```bash
cd /home/song99/carla/carla-web-bridge
source .venv/bin/activate
CARLA_HOST=localhost CARLA_PORT=2000 BRIDGE_PORT=42692 CORS_ORIGINS=http://localhost:42691 \
  uvicorn src.main:app --host 0.0.0.0 --port 42692 &
deactivate
```

### Service 4: React Frontend
```bash
cd /home/song99/carla/carla-web
npm run dev &
```

### Spawn Traffic
```bash
cd /home/song99/carla/PythonAPI/examples
python3 generate_traffic.py -n 50 -w 20 &
```

---

## PHASE 9: VERIFY EVERYTHING IS CONNECTED

### Test 1: CARLA server is running
```bash
python3 -c "
import carla
c = carla.Client('localhost', 2000)
c.set_timeout(5.0)
print('CARLA server:', c.get_server_version())
w = c.get_world()
print('Map:', w.get_map().name)
print('Actors:', len(w.get_actors()))
"
```
**Must show:** version, map name, actor count > 0

### Test 2: Bridge is connected to CARLA
```bash
curl -s http://localhost:42692/health | python3 -m json.tool
```
**Must show:** `"carla_connected": true`

### Test 3: Bridge REST API returns real data
```bash
curl -s http://localhost:42692/api/simulation/status | python3 -m json.tool
curl -s http://localhost:42692/api/actors | python3 -m json.tool | head -20
curl -s http://localhost:42692/api/world/weather | python3 -m json.tool
```
**Must show:** real simulation status, actor list with vehicles, weather parameters

### Test 4: Frontend loads
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:42691
```
**Must show:** `200`

### Test 5: Pixel Streaming signaling is up
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:42680
```
**Must show:** `200`

### Test 6: WebSocket accepts connections
```bash
python3 -c "
import asyncio, websockets
async def test():
    async with websockets.connect('ws://localhost:42692/ws') as ws:
        print('WebSocket connected')
asyncio.run(test())
"
```
**Must show:** `WebSocket connected`

---

## FINAL STATE

When all 9 phases are complete:

```
http://localhost:42691   → React frontend with live simulation data
http://localhost:42692   → Bridge API (REST + WebSocket)
http://localhost:42692/docs → FastAPI auto-generated API docs
http://localhost:42680   → Pixel Streaming player (direct UE5 viewport)
localhost:2000           → CARLA RPC (internal)
```

Open `http://localhost:42691` in a browser:
- Main viewport shows the UE5-rendered 3D scene via Pixel Streaming (or camera fallback)
- Left panel shows 50+ vehicles and 20+ walkers in the actor list
- Sensor panel can attach cameras, LiDAR, radar to vehicles and display live feeds
- Weather controls change the simulation in real time
- Play/Pause/Step controls work
- All data is REAL — coming from the actual CARLA simulation, not mock data

---

## IF SOMETHING FAILS

### UE5 clone fails with 404
→ `GIT_LOCAL_CREDENTIALS` is wrong or GitHub not linked to Epic Games. Fix credentials, retry.

### UE5 build runs out of memory
→ Reduce jobs: `make -j16` instead of `make -j$(nproc)`. This machine has 503GB RAM so this shouldn't happen.

### CMake can't find UE5
→ `export CARLA_UNREAL_ENGINE_PATH=/home/song99/UnrealEngine5_carla` and re-run cmake configure.

### `import carla` fails in bridge venv
→ `source .venv/bin/activate && pip install /home/song99/carla/PythonAPI/dist/carla-*.whl`

### CARLA server crashes on start
→ Check GPU: `nvidia-smi`. Try without Pixel Streaming first: remove the `-PixelStreaming*` flags.

### Bridge shows "CARLA connection failed"
→ CARLA server not ready yet. Wait longer, or check `CARLA_HOST`/`CARLA_PORT` env vars.

### Pixel Streaming shows black screen in browser
→ Check signaling server logs. Try `http://localhost:42680` directly first. If that works but the React frontend doesn't show it, check `NEXT_PUBLIC_PIXEL_STREAMING_URL` env var.

### Frontend shows empty panels
→ Check bridge health: `curl http://localhost:42692/health`. If `carla_connected: false`, CARLA server isn't running. If bridge is unreachable, check port 42692.

---

## REMEMBER

- Phase 2 (UE5 build) takes 2-4 hours. DO NOT assume it failed just because it's slow. Monitor with `top` or `htop`.
- Phase 4 (CARLA build) takes 30-60 minutes.
- All other phases are under 10 minutes each.
- The `run_production.sh` script at the project root automates Phase 8. After the one-time build (Phases 1-7), you only need `./run_production.sh` to start everything.
- **DO NOT STOP** until Phase 9 verification passes.
