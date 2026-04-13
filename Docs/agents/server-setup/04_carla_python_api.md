# 04 — CARLA Python API Installation

The Python bridge (`carla-web-bridge`) needs the `carla` Python package to communicate with the CARLA server. This guide covers installation for both source builds and pre-built packages.

---

## If You Built from Source (Guide 02)

The build process already installed the Python API:

```bash
# Verify:
python3 -c "import carla; print(carla.__version__)"
```

If it prints a version number, you're done. Skip to Verification below.

If it fails, rebuild the Python API:
```bash
cd /home/$USER/carla
cmake --build Build --target carla-python-api-install
```

---

## If You Have a Pre-built Package

### From CARLA Release Download:

```bash
cd /path/to/CARLA_package/PythonAPI/dist/
pip3 install carla-*.whl
```

### From pip (if available for your CARLA version):

```bash
pip3 install carla==0.9.15
```

**Note:** The pip version may lag behind the source build. For UE5-dev branch, you almost always need to build from source.

---

## Install in the Bridge Virtual Environment

The bridge runs in its own venv. Install the `carla` package there too:

```bash
cd /home/$USER/carla/carla-web-bridge

# Create venv if not exists
python3 -m venv .venv
source .venv/bin/activate

# Install bridge dependencies
pip install -r requirements.txt

# Install carla package
# Option A: from the wheel built in Guide 02
pip install /home/$USER/carla/PythonAPI/dist/carla-*.whl

# Option B: if carla is installed system-wide, link it
# (only if pip install from wheel doesn't work)
pip install carla

# Verify
python3 -c "import carla; print('carla', carla.__version__)"

deactivate
```

---

## Verification

### Test 1: Import carla

```bash
python3 -c "
import carla
print('Version:', carla.__version__)
print('Location:', carla.__file__)
"
```

### Test 2: Connect to running CARLA server

Start the CARLA server first (from Guide 02 or 05), then:

```bash
python3 -c "
import carla
client = carla.Client('localhost', 2000)
client.set_timeout(10.0)
print('Server version:', client.get_server_version())
world = client.get_world()
print('Current map:', world.get_map().name)
print('Actors:', len(world.get_actors()))
print('Weather:', world.get_weather())
print('Spawn points:', len(world.get_map().get_spawn_points()))
"
```

### Test 3: Verify in bridge venv

```bash
cd /home/$USER/carla/carla-web-bridge
source .venv/bin/activate
python3 -c "import carla; print('Bridge venv: carla', carla.__version__)"
deactivate
```

---

## Troubleshooting

### "No module named 'carla'"
→ The wheel wasn't installed. Find it:
```bash
find /home/$USER/carla -name "carla-*.whl" 2>/dev/null
```
Then install it: `pip3 install /path/to/carla-*.whl`

### "ImportError: libboost_python..."
→ Missing Boost library. Install: `sudo apt install libboost-python-dev`

### Wheel not found after build
→ Rebuild explicitly:
```bash
cd /home/$USER/carla
cmake --build Build --target carla-python-api-install
```

### Version mismatch between server and client
→ The `carla` Python package version must match the server version. Rebuild both from the same source tree.

---

Proceed to [06 — Production Integration](06_production_integration.md) (skip 05 if you built from source).
