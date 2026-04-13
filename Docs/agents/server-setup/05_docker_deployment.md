# 05 — Docker Deployment (Alternative to Building from Source)

Skip Guides 02-04 entirely. Use a pre-built CARLA Docker image instead. This is faster but has limitations.

---

## Trade-offs

| Feature | Source Build (Guides 02-04) | Docker (This Guide) |
|---------|---------------------------|---------------------|
| Setup time | 3-6 hours | 30 minutes |
| Pixel Streaming | Full support | Not included |
| Main viewport | UE5 video stream (identical rendering) | Camera fallback (JPEG stream) |
| Sensor data | Full support | Full support |
| Custom maps | Yes (editor access) | Pre-built maps only |
| Disk usage | 130-250 GB | ~15-20 GB |
| Modification | Full source access | Read-only container |

**Key limitation:** The official CARLA Docker images do **not** include the Pixel Streaming plugin. The web frontend will use the camera fallback mode (high-res JPEG stream instead of WebRTC video). Visual quality is still good but has higher latency and bandwidth usage.

---

## 1. Pull the CARLA Docker Image

```bash
# Latest stable release:
docker pull carlasim/carla:0.10.0

# Or latest nightly (may be unstable):
docker pull carlasim/carla:latest
```

Verify:
```bash
docker images | grep carla
# Should show the image with size ~10-15 GB
```

---

## 2. Run CARLA Server (Headless)

### Basic headless mode (no display needed):

```bash
docker run -d \
  --name carla-server \
  --runtime=nvidia \
  --gpus all \
  --net=host \
  -e NVIDIA_VISIBLE_DEVICES=all \
  -e NVIDIA_DRIVER_CAPABILITIES=all \
  carlasim/carla:0.10.0 \
  bash CarlaUnreal.sh -RenderOffScreen -nosound -carla-rpc-port=2000
```

### With X11 display (see what CARLA renders locally):

```bash
xhost +local:docker

docker run -d \
  --name carla-server \
  --runtime=nvidia \
  --gpus all \
  --net=host \
  --user=$(id -u):$(id -g) \
  -e DISPLAY=$DISPLAY \
  -e NVIDIA_VISIBLE_DEVICES=all \
  -e NVIDIA_DRIVER_CAPABILITIES=all \
  -v /tmp/.X11-unix:/tmp/.X11-unix:rw \
  carlasim/carla:0.10.0 \
  bash CarlaUnreal.sh -nosound -carla-rpc-port=2000
```

### Check if it's running:

```bash
docker logs carla-server -f
# Wait for "Carla Simulator is now running" or similar

# Test connection:
python3 -c "
import carla
client = carla.Client('localhost', 2000)
client.set_timeout(10.0)
print('Connected:', client.get_server_version())
"
```

---

## 3. Install CARLA Python API for Docker Version

The Docker image includes the Python API wheel. Extract it:

```bash
# Copy the wheel from the container:
docker cp carla-server:/home/carla/PythonAPI/dist/ /tmp/carla-wheels/

# Install system-wide:
pip3 install /tmp/carla-wheels/carla-*.whl

# Install in the bridge venv:
cd /home/$USER/carla/carla-web-bridge
source .venv/bin/activate
pip install /tmp/carla-wheels/carla-*.whl
deactivate
```

If the wheel isn't in the container, download it from the CARLA releases page:
```bash
# Check the exact URL for your version at:
# https://github.com/carla-simulator/carla/releases
pip3 install carla==0.9.15
```

---

## 4. Docker Compose (CARLA + Bridge Together)

Create `docker-compose.gpu.yml` in the project root:

```yaml
version: "3.8"

services:
  carla-server:
    image: carlasim/carla:0.10.0
    runtime: nvidia
    network_mode: host
    environment:
      - NVIDIA_VISIBLE_DEVICES=all
      - NVIDIA_DRIVER_CAPABILITIES=all
    command: bash CarlaUnreal.sh -RenderOffScreen -nosound -carla-rpc-port=2000
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    restart: unless-stopped

  carla-bridge:
    build: ./carla-web-bridge
    network_mode: host
    environment:
      - CARLA_HOST=localhost
      - CARLA_PORT=2000
      - BRIDGE_PORT=42692
      - CORS_ORIGINS=http://localhost:42691
    depends_on:
      - carla-server
    restart: unless-stopped
```

Run:
```bash
docker compose -f docker-compose.gpu.yml up -d
```

---

## 5. Managing the Docker Container

```bash
# Stop CARLA:
docker stop carla-server

# Start again:
docker start carla-server

# View logs:
docker logs carla-server -f

# Load a different map:
python3 -c "
import carla
client = carla.Client('localhost', 2000)
client.set_timeout(30.0)
client.load_world('Town10HD')
"

# List available maps:
python3 -c "
import carla
client = carla.Client('localhost', 2000)
for m in client.get_available_maps():
    print(m)
"

# Remove container:
docker rm -f carla-server
```

---

## 6. Verification

```bash
# 1. Container is running:
docker ps | grep carla

# 2. Python API works:
python3 -c "import carla; print(carla.__version__)"

# 3. Can connect to server:
python3 -c "
import carla
c = carla.Client('localhost', 2000)
c.set_timeout(10.0)
w = c.get_world()
print('Map:', w.get_map().name)
print('Actors:', len(w.get_actors()))
print('Spawn points:', len(w.get_map().get_spawn_points()))
"

# 4. Generate traffic:
cd /home/$USER/carla/PythonAPI/examples
python3 generate_traffic.py -n 30 -w 10
```

---

Proceed to [06 — Production Integration](06_production_integration.md).
