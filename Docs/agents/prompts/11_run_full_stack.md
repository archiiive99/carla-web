# Prompt 11 — Run Full Stack End-to-End

> **DO NOT STOP until the browser shows a working CARLA simulation at http://localhost:42691. Fix every error you encounter. Do not ask the user.**

---

## Current Machine State (verified)

- **UE5 built:** `/home/song99/UnrealEngine5_carla/Engine/Binaries/Linux/UnrealEditor` exists
- **CARLA built:** `/home/song99/carla/Build/` exists, C++ libs compiled, Python API installed
- **CARLA NOT packaged:** `Build/Package/CarlaUnreal.sh` does NOT exist — cook segfaults. Use UnrealEditor `-game` mode instead.
- **carla Python API:** installed for system Python 3.10 (`/usr/bin/python3`)
- **Bridge venv:** `/home/song99/carla/carla-web-bridge/.venv/` exists with Python 3.10, carla module installed
- **Frontend:** `/home/song99/carla/carla-web/` — Vite + React, builds clean (`npm run build` passes)
- **GPU:** 4x NVIDIA RTX A6000 (48GB each). Other users occupy GPUs 1-3 (~35GB each). **GPU 0 has ~12GB free — use `CUDA_VISIBLE_DEVICES=0`.**
- **Ports:** 42691 (frontend), 42692 (bridge), 2000 (CARLA RPC)

---

## Task: Start All 3 Services and Verify They Work Together

### Step 1: Kill Any Existing Processes

```bash
pkill -9 -f UnrealEditor 2>/dev/null
pkill -9 -f uvicorn 2>/dev/null
pkill -9 -f "vite" 2>/dev/null
lsof -ti:42691,42692,2000 2>/dev/null | xargs kill -9 2>/dev/null
sleep 2
```

Verify ports are free:
```bash
ss -tlnp | grep -E '42691|42692|2000'
```
Must show nothing. If any port is still occupied, find and kill the process.

### Step 2: Start CARLA UE5 Server

```bash
export CARLA_UNREAL_ENGINE_PATH=/home/song99/UnrealEngine5_carla
export CUDA_VISIBLE_DEVICES=0

cd /home/song99/carla
$CARLA_UNREAL_ENGINE_PATH/Engine/Binaries/Linux/UnrealEditor \
  $(pwd)/Unreal/CarlaUnreal/CarlaUnreal.uproject \
  -game -RenderOffScreen -nosound -unattended \
  -ResX=1280 -ResY=720 \
  -carla-rpc-port=2000 &
CARLA_PID=$!
echo "CARLA PID: $CARLA_PID"
```

**Resolution set to 1280x720** to reduce VRAM usage (GPU 0 is shared).

### Step 3: Wait for CARLA to Be Ready

CARLA takes 2-5 minutes on first launch (shader compilation + asset loading). Wait patiently.

```bash
echo "Waiting for CARLA server..."
for i in $(seq 1 600); do
  if /usr/bin/python3 -c "
import carla
c = carla.Client('localhost', 2000)
c.set_timeout(2.0)
ver = c.get_server_version()
w = c.get_world()
m = w.get_map().name
print(f'CARLA {ver} ready on map {m}')
" 2>/dev/null; then
    echo "CARLA IS READY"
    break
  fi
  if ! kill -0 $CARLA_PID 2>/dev/null; then
    echo "ERROR: CARLA process died (PID $CARLA_PID)"
    echo "Check logs. Common causes:"
    echo "  - GPU out of memory (other processes using VRAM)"
    echo "  - Missing assets"
    echo "  - Signal 11 (segfault) during shader compilation"
    echo ""
    echo "Try: nvidia-smi to check GPU memory"
    echo "Try: reduce resolution to -ResX=640 -ResY=480"
    exit 1
  fi
  sleep 1
done
```

**If CARLA crashes (Signal 11):**
1. Check GPU memory: `nvidia-smi --query-compute-apps=pid,name,used_memory --format=csv`
2. If GPU 0 doesn't have at least 8GB free, try a different GPU: `export CUDA_VISIBLE_DEVICES=3`
3. Try lower resolution: `-ResX=640 -ResY=480`
4. Try a smaller map by adding `-carla-map=Town01` to the launch flags

**If CARLA hangs but doesn't crash:**
- This is normal on first launch. Shader compilation can take 3-5 minutes.
- Check if the process is alive: `kill -0 $CARLA_PID && echo alive`
- Check GPU activity: `nvidia-smi` — if GPU 0 shows utilization, CARLA is working.

### Step 4: Start Python Bridge

```bash
cd /home/song99/carla/carla-web-bridge
source .venv/bin/activate

export CARLA_HOST=localhost
export CARLA_PORT=2000
export BRIDGE_PORT=42692
export CORS_ORIGINS="http://localhost:42691"

uvicorn src.main:app --host 0.0.0.0 --port 42692 --log-level info &
BRIDGE_PID=$!
echo "Bridge PID: $BRIDGE_PID"

deactivate 2>/dev/null
sleep 3
```

**Verify bridge is running and connected to CARLA:**
```bash
curl -s http://localhost:42692/health | python3 -m json.tool
```

Expected output:
```json
{
    "status": "ok",
    "carla_connected": true,
    "ws_clients": 0,
    "active_sensors": 0
}
```

If `carla_connected` is `false`, the bridge hasn't connected yet. Wait 10 seconds and retry — it auto-reconnects.

If the bridge fails to start, check:
- Port conflict: `lsof -i:42692`
- Missing deps: `cd carla-web-bridge && source .venv/bin/activate && pip install -r requirements.txt`
- carla module: `python3 -c "import carla"`

### Step 5: Start React Frontend

```bash
cd /home/song99/carla/carla-web
npm run dev -- --port 42691 &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"
sleep 5
```

**Verify frontend is serving:**
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:42691
```
Must return `200`.

### Step 6: Verify Full Stack Integration

Run ALL of these checks. Every one must pass.

```bash
echo "=== VERIFICATION ==="

# 1. CARLA server
/usr/bin/python3 -c "
import carla
c = carla.Client('localhost', 2000)
c.set_timeout(5.0)
w = c.get_world()
print(f'[OK] CARLA: {c.get_server_version()}, map: {w.get_map().name}')
print(f'[OK] Actors: {len(w.get_actors())}')
"

# 2. Bridge health
echo ""
curl -s http://localhost:42692/health | python3 -c "
import sys, json
h = json.load(sys.stdin)
print(f'[{\"OK\" if h[\"carla_connected\"] else \"FAIL\"}] Bridge: carla_connected={h[\"carla_connected\"]}')
"

# 3. Bridge API returns real data
echo ""
curl -s http://localhost:42692/api/simulation/status | python3 -c "
import sys, json
s = json.load(sys.stdin)
print(f'[OK] Simulation: map={s.get(\"map\",\"?\")}, tick={s.get(\"current_tick\",0)}')
"

# 4. Weather API
curl -s http://localhost:42692/api/world/weather | python3 -c "
import sys, json
w = json.load(sys.stdin)
print(f'[OK] Weather: sun_alt={w.get(\"sun_altitude_angle\",\"?\")}, cloudiness={w.get(\"cloudiness\",\"?\")}')
"

# 5. Blueprints API
curl -s http://localhost:42692/api/blueprints/vehicles | python3 -c "
import sys, json
bps = json.load(sys.stdin)
print(f'[OK] Vehicle blueprints: {len(bps)} available')
"

# 6. Spawn a test vehicle
curl -s -X POST http://localhost:42692/api/actors/spawn/vehicle \
  -H 'Content-Type: application/json' \
  -d '{\"blueprint\":\"vehicle.tesla.model3\",\"transform\":{\"location\":{\"x\":0,\"y\":0,\"z\":2},\"rotation\":{\"pitch\":0,\"yaw\":0,\"roll\":0}},\"autopilot\":true}' | python3 -c "
import sys, json
r = json.load(sys.stdin)
print(f'[OK] Spawned vehicle: id={r.get(\"id\",\"?\")}, type={r.get(\"type_id\",\"?\")}')
"

# 7. Actor list
curl -s http://localhost:42692/api/actors | python3 -c "
import sys, json
actors = json.load(sys.stdin)
print(f'[OK] Actors in world: {len(actors)}')
"

# 8. Frontend
STATUS=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:42691)
echo "[$([ \"$STATUS\" = '200' ] && echo 'OK' || echo 'FAIL')] Frontend: HTTP $STATUS"

# 9. WebSocket
/usr/bin/python3 -c "
import asyncio, websockets
async def test():
    async with websockets.connect('ws://localhost:42692/ws') as ws:
        print('[OK] WebSocket: connected')
asyncio.run(test())
" 2>/dev/null || echo "[FAIL] WebSocket: connection failed"

echo ""
echo "=== ALL CHECKS DONE ==="
echo "Open http://localhost:42691 in your browser"
```

### Step 7: If Any Check Fails

**CARLA not ready:**
- Wait longer. First launch takes up to 5 minutes.
- Check `nvidia-smi` for GPU memory.
- Check if process is alive: `kill -0 $CARLA_PID`

**Bridge `carla_connected: false`:**
- Bridge auto-reconnects. Wait 10 seconds, retry.
- Check bridge logs in terminal for errors.

**Vehicle spawn fails (no spawn points):**
- The map may not have loaded fully. Try a different spawn point:
```bash
curl -s http://localhost:42692/api/world/spawn-points | python3 -c "
import sys, json
pts = json.load(sys.stdin)
print(f'{len(pts)} spawn points available')
if pts: print(f'First: {pts[0]}')
"
```
- Use the first spawn point's coordinates in the spawn request.

**Frontend returns non-200:**
- Check `cd carla-web && npm run dev -- --port 42691` output for errors.
- Try `npm install` first if node_modules is missing.

**WebSocket fails:**
- Bridge might not have the `/ws` endpoint running. Check bridge logs.
- Try: `pip install websockets` in the test environment.

---

## What the User Should See in the Browser

After opening `http://localhost:42691`:

1. **Top bar:** Connection status badge should turn GREEN ("Connected")
2. **Left panel:** Actor list showing traffic lights, spawned vehicles
3. **Main viewport:** "Connecting to simulation..." → then camera fallback showing the CARLA scene
4. **Bottom panel:** Sensor tabs available for adding camera/lidar feeds
5. **Controls:** Play/Pause/Step buttons should be functional
6. **Weather:** Weather panel should show current weather params with sliders

If the connection badge stays RED:
- Bridge URL may be wrong. Check Settings page → Bridge URL should be `http://localhost:42692`
- Check browser console (F12) for CORS errors or connection failures

---

## Cleanup (when done)

```bash
kill $CARLA_PID $BRIDGE_PID $FRONTEND_PID 2>/dev/null
```

Or just Ctrl+C in the terminal running `run.sh`.
