# 02 — Build Unreal Engine 5.5 + CARLA from Source

This is the longest step. Building UE5 from source takes 2-4 hours depending on your hardware. CARLA itself builds in 30-60 minutes on top of that.

---

## Option A: Automated Setup (Recommended)

CARLA provides a single script that does everything:

```bash
cd /home/$USER
git clone -b ue5-dev https://github.com/carla-simulator/carla.git carla
cd carla
```

### Interactive mode (prompts for input):
```bash
./CarlaSetup.sh --interactive
```

### Unattended mode (no prompts, uses env vars):
```bash
# Ensure GIT_LOCAL_CREDENTIALS is set (from 01_prerequisites.md)
sudo -E ./CarlaSetup.sh
```

### What CarlaSetup.sh does:
1. Runs `Util/SetupUtils/InstallPrerequisites.sh` — installs all system packages
2. Installs Python dependencies from `requirements.txt`
3. Installs CMake 3.28+ if not present
4. Clones `carla-content` repository (~15-50 GB) to `Unreal/CarlaUnreal/Content/Carla/`
5. Clones CARLA's Unreal Engine 5.5 fork from `https://github.com/CarlaUnreal/UnrealEngine.git` (branch: `ue5-dev-carla`)
6. Builds UE5 from source (~2-4 hours)
7. Sets `CARLA_UNREAL_ENGINE_PATH` environment variable
8. Runs CMake configure + build for CARLA
9. Builds and installs the `carla` Python API

**After it finishes, skip to the Verification section below.**

---

## Option B: Manual Step-by-Step Build

If you need more control or the automated script fails.

### Step 1: Clone CARLA

```bash
cd /home/$USER
git clone -b ue5-dev https://github.com/carla-simulator/carla.git carla
cd carla
```

### Step 2: Install Prerequisites

```bash
sudo ./Util/SetupUtils/InstallPrerequisites.sh
pip3 install -r requirements.txt
```

### Step 3: Clone and Build Unreal Engine 5.5

```bash
cd /home/$USER

# Clone the CARLA fork of UE5 (requires GitHub linked to Epic Games)
git clone -b ue5-dev-carla https://github.com/CarlaUnreal/UnrealEngine.git UnrealEngine5_carla
cd UnrealEngine5_carla

# Setup (downloads dependencies, generates project files)
./Setup.sh
./GenerateProjectFiles.sh

# Build UE5 (this takes 2-4 hours)
make -j$(nproc)
```

**Expected disk usage:** ~120-150 GB for the UE5 build.

### Step 4: Set Environment Variable

```bash
echo 'export CARLA_UNREAL_ENGINE_PATH=/home/'$USER'/UnrealEngine5_carla' >> ~/.bashrc
source ~/.bashrc
```

Verify:
```bash
echo $CARLA_UNREAL_ENGINE_PATH
# Should print: /home/youruser/UnrealEngine5_carla
```

### Step 5: Clone CARLA Content

```bash
cd /home/$USER/carla
git clone https://bitbucket.org/carla-simulator/carla-content.git \
  Unreal/CarlaUnreal/Content/Carla -b ue5-dev
```

**Expected size:** 15-50 GB. This contains all maps, meshes, textures, and materials.

### Step 6: Configure CMake

```bash
cd /home/$USER/carla

cmake -G Ninja -S . -B Build \
  --toolchain=$PWD/CMake/Toolchain.cmake \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_CARLA_CLIENT=ON \
  -DBUILD_CARLA_SERVER=ON \
  -DBUILD_PYTHON_API=ON \
  -DBUILD_CARLA_UNREAL=ON
```

If CMake cannot find your UE5 install, pass it explicitly:
```bash
cmake -G Ninja -S . -B Build \
  --toolchain=$PWD/CMake/Toolchain.cmake \
  -DCMAKE_BUILD_TYPE=Release \
  -DCARLA_UNREAL_ENGINE_PATH=/home/$USER/UnrealEngine5_carla
```

### Step 7: Build CARLA

```bash
cmake --build Build -j$(nproc)
```

**Expected time:** 30-60 minutes.

### Step 8: Build Python API

```bash
cmake --build Build --target carla-python-api-install
```

This builds the `carla` wheel and installs it via pip.

### Step 9: Package (Optional, for deployment)

```bash
cmake --build Build --target package
```

Output: `Build/Package/` — a self-contained directory you can copy to another machine.

---

## Verification

### Test 1: Python API

```bash
python3 -c "import carla; print('carla version:', carla.__version__)"
# Should print: carla version: 0.10.0 (or similar)
```

### Test 2: Launch CARLA Server

```bash
# From source build:
cd /home/$USER/carla
cmake --build Build --target launch
# This opens the UE5 editor — close it after confirming it works

# From packaged build:
cd Build/Package
./CarlaUnreal.sh -RenderOffScreen -nosound
# Should start headless. Check with:
python3 -c "
import carla
client = carla.Client('localhost', 2000)
client.set_timeout(10.0)
print('Server version:', client.get_server_version())
print('Maps:', client.get_available_maps())
"
```

### Test 3: Generate Traffic

```bash
cd /home/$USER/carla/PythonAPI/examples
pip3 install -r requirements.txt
python3 generate_traffic.py -n 50 -w 20
# Should spawn 50 vehicles and 20 pedestrians
```

---

## Build Presets (Alternative)

CARLA supports CMake presets for different configurations:

```bash
# List available presets:
cmake --list-presets

# Build with a specific preset:
cmake --preset Linux-Release
cmake --build Build/Linux-Release/ -j$(nproc)
cmake --build Build/Linux-Release/ --target carla-python-api-install
cmake --build Build/Linux-Release/ --target package
```

Available presets: `Linux-Debug`, `Linux-Development`, `Linux-Release`

---

## Troubleshooting

### "Cannot access CarlaUnreal/UnrealEngine repository"
→ Your GitHub account is not linked to Epic Games. See Step 6 in [01_prerequisites.md](01_prerequisites.md).

### Build runs out of memory
→ UE5 build uses a lot of RAM. Reduce parallel jobs:
```bash
make -j4  # Instead of -j$(nproc)
```
Or add swap:
```bash
sudo fallocate -l 32G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### "CMake Error: CMAKE_CXX_COMPILER not found"
→ Install build-essential: `sudo apt install build-essential`

### Build takes forever
→ Normal. UE5 from source: 2-4 hours. CARLA: 30-60 min. Use `ccache` to speed up rebuilds:
```bash
sudo apt install ccache
echo 'export PATH=/usr/lib/ccache:$PATH' >> ~/.bashrc
source ~/.bashrc
```

### "Content directory is empty"
→ Clone the content repository:
```bash
git clone https://bitbucket.org/carla-simulator/carla-content.git \
  Unreal/CarlaUnreal/Content/Carla -b ue5-dev
```

---

## What You Now Have

- `/home/$USER/UnrealEngine5_carla/` — Built Unreal Engine 5.5
- `/home/$USER/carla/Build/` — Built CARLA binaries
- `/home/$USER/carla/Build/Package/` — Packaged CARLA server (if you ran `package`)
- `carla` Python package installed and importable
- CARLA server launchable via `CarlaUnreal.sh`

Proceed to [03 — Pixel Streaming](03_pixel_streaming.md).
