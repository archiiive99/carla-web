# Testing Checklist — Layer by Layer

Each layer must be verified independently before testing end-to-end.

---

## Layer 0: Prerequisites

```bash
# Python CARLA API importable?
python3 -c "import carla; print('OK:', carla.__file__)"

# TurboJPEG available?
python3 -c "from turbojpeg import TurboJPEG; t = TurboJPEG(); print('TurboJPEG OK')"
# If fails: sudo apt-get install -y libturbojpeg

# Node.js + npm?
node --version   # expect v24+
npm --version

# Frontend deps installed?
ls carla-web/node_modules/.package-lock.json
# If missing: cd carla-web && npm install

# Bridge venv + deps?
ls carla-web-bridge/.venv/bin/activate
# If missing: cd carla-web-bridge && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
```

---

## Layer 1: CARLA Server

```bash
# Is CARLA running?
python3 -c "
import carla
c = carla.Client('localhost', 58338)
c.set_timeout(5.0)
print('Server version:', c.get_server_version())
w = c.get_world()
print('Map:', w.get_map().name)
print('Actors:', len(w.get_actors()))
print('Spawn points:', len(w.get_map().get_spawn_points()))
"

# If not running:
./run_carla.sh --gpu 3
# Wait ~60-120s for UE5 to load
./run_carla.sh --status
```

---

## Layer 2: Bridge CARLA Connection

```bash
# Start bridge standalone
cd carla-web-bridge
source .venv/bin/activate
uvicorn src.main:app --host 0.0.0.0 --port 58337 --reload --reload-dir src

# In another terminal, test health:
curl -s http://localhost:58337/health | python3 -m json.tool
# Expected: {"status":"ok", "carla_connected": true, ...}

# Test realtime session:
curl -s http://localhost:58337/api/realtime/session | python3 -m json.tool
# Expected: {"default_vehicle_id": <N>, "default_camera_id": <N>, "session_ready": true}
```

---

## Layer 3: WebSocket Binary Frames

```python
#!/usr/bin/env python3
"""Test WebSocket receives binary frames from bridge."""
import asyncio
import json
import struct
import websockets

async def test_ws():
    # 1. Get camera sensor ID
    import urllib.request
    resp = urllib.request.urlopen("http://localhost:58337/api/realtime/session")
    session = json.loads(resp.read())
    camera_id = session["default_camera_id"]
    print(f"Camera sensor ID: {camera_id}")
    
    # 2. Connect WebSocket
    async with websockets.connect("ws://localhost:58337/ws") as ws:
        # 3. Subscribe to camera
        await ws.send(json.dumps({"action": "subscribe", "sensor_id": camera_id}))
        print("Subscribed, waiting for frames...")
        
        # 4. Receive frames
        for i in range(10):
            data = await asyncio.wait_for(ws.recv(), timeout=5.0)
            if isinstance(data, bytes) and len(data) >= 5:
                channel = data[0]
                payload_len = struct.unpack("<I", data[1:5])[0]
                print(f"Frame {i}: channel=0x{channel:02x}, payload={payload_len} bytes, total={len(data)}")
                
                if channel == 0x01:  # Camera
                    sid, w, h, frame, ts = struct.unpack("<IIIId", data[5:29])
                    jpeg_size = payload_len - 24
                    print(f"  Camera: sensor={sid}, {w}x{h}, frame={frame}, jpeg={jpeg_size} bytes")
                    
                    # Verify JPEG magic bytes
                    jpeg_start = data[29:31]
                    if jpeg_start == b'\xff\xd8':
                        print("  JPEG header: valid")
                    else:
                        print(f"  JPEG header: INVALID ({jpeg_start.hex()})")
                elif channel == 0x10:  # World tick
                    frame_num, ts, count = struct.unpack("<IdI", data[5:21])
                    print(f"  WorldTick: frame={frame_num}, actors={count}")
        
        print("Test PASSED: received 10 frames")

asyncio.run(test_ws())
```

Save as `test_ws.py` and run: `python3 test_ws.py`

---

## Layer 4: Frontend Dev Server

```bash
cd carla-web
npx vite --port 58336 --host 0.0.0.0

# Verify in browser:
# 1. Open http://localhost:58336
# 2. Open DevTools → Console (no errors)
# 3. Open DevTools → Network → WS tab → verify WebSocket connected to ws://localhost:58337/ws
# 4. Check binary messages flowing in WebSocket inspector
```

---

## Layer 5: End-to-End

### Browser Console Checks
```javascript
// In browser DevTools console:

// 1. Check if WebSocket is connected
// (depends on implementation, look for status indicator in UI)

// 2. Check for frame rendering
// Look for a canvas element with camera feed
document.querySelectorAll('canvas')

// 3. Check for errors
// No WebSocket errors, no CORS errors, no worker errors
```

### Visual Checks
- [ ] Camera feed visible and updating (not frozen)
- [ ] Frame rate reasonable (10-30 FPS visual)
- [ ] No CORS errors in console
- [ ] No WebSocket disconnection/reconnection loops
- [ ] Actor positions updating on viewport/minimap
- [ ] No memory leaks (monitor browser task manager for 60s)

### Stability Test
```bash
# Let it run for 60+ seconds, then check:
# - Bridge logs: tail -20 /tmp/bridge.log
# - Frontend logs: tail -20 /tmp/frontend.log
# - No crash, no hung connections
# - Memory usage stable (not growing unbounded)
```

---

## Automated Smoke Test Script

```bash
#!/bin/bash
set -e

echo "=== CARLA Web Smoke Test ==="

echo "[1/5] CARLA server..."
python3 -c "import carla; c=carla.Client('localhost',58338); c.set_timeout(5); print('OK:', c.get_server_version())"

echo "[2/5] Bridge health..."
curl -sf http://localhost:58337/health | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['carla_connected'], 'Not connected'; print('OK:', d)"

echo "[3/5] Realtime session..."
curl -sf http://localhost:58337/api/realtime/session | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['session_ready'], 'Not ready'; print('OK:', d)"

echo "[4/5] WebSocket frame test..."
python3 -c "
import asyncio, json, struct, websockets, urllib.request
async def test():
    resp = urllib.request.urlopen('http://localhost:58337/api/realtime/session')
    cam_id = json.loads(resp.read())['default_camera_id']
    async with websockets.connect('ws://localhost:58337/ws') as ws:
        await ws.send(json.dumps({'action':'subscribe','sensor_id':cam_id}))
        for i in range(3):
            data = await asyncio.wait_for(ws.recv(), timeout=5)
            if isinstance(data, bytes) and data[0] == 0x01:
                print(f'  Frame {i}: {len(data)} bytes, JPEG valid={data[29:31]==bytes([0xff,0xd8])}')
    print('OK')
asyncio.run(test())
"

echo "[5/5] Frontend reachable..."
curl -sf http://localhost:58336 | head -c 100
echo ""
echo "OK"

echo ""
echo "=== ALL CHECKS PASSED ==="
```
