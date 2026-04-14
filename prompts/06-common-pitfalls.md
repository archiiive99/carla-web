# Common Pitfalls & Solutions

## 1. CARLA Python API Import Failure

**Symptom**: `ModuleNotFoundError: No module named 'carla'`

**Cause**: The `carla` package is a compiled C extension (`carla.cpython-310-x86_64-linux-gnu.so`) that must be on the Python path.

**Fix**:
```bash
# Find the egg/wheel
find /data1/song99/carla -name "*.egg" -path "*/PythonAPI/*" 2>/dev/null
find /data1/song99/carla/Build -name "carla*" 2>/dev/null

# If built:
export PYTHONPATH="/data1/song99/carla/Build/PythonAPI/carla:$PYTHONPATH"

# Or in the bridge venv:
echo "/data1/song99/carla/Build/PythonAPI/carla" > .venv/lib/python3.10/site-packages/carla.pth

# Verify:
python3 -c "import carla; print(carla.__file__)"
```

---

## 2. TurboJPEG Not Found

**Symptom**: `ImportError: Unable to find libturbojpeg`

**Fix**:
```bash
sudo apt-get install -y libturbojpeg0-dev
# Or:
sudo apt-get install -y libturbojpeg

# If still failing, find and symlink:
find / -name "libturbojpeg*" 2>/dev/null
sudo ln -sf /usr/lib/x86_64-linux-gnu/libturbojpeg.so.0 /usr/lib/libturbojpeg.so
```

The bridge will fall back to Pillow if TurboJPEG is unavailable, but performance will be much worse.

---

## 3. CORS Errors

**Symptom**: Browser console shows `Access-Control-Allow-Origin` errors

**Cause**: Bridge CORS config doesn't include the frontend origin.

**Fix**: Set environment variable before starting bridge:
```bash
export CORS_ORIGINS="http://localhost:58336,http://127.0.0.1:58336"
```

Or edit `carla-web-bridge/src/config.py` defaults.

---

## 4. WebSocket Connection Refused

**Symptom**: `WebSocket connection to 'ws://localhost:58337/ws' failed`

**Checklist**:
1. Is the bridge running? `curl http://localhost:58337/health`
2. Is the WebSocket URL correct? Must be `ws://localhost:58337/ws`
3. Check frontend hardcoded URL in worker or hook code
4. Check for port conflicts: `ss -tlnp | grep 58337`

---

## 5. Connected But No Frames

**Symptom**: WebSocket connects, but no camera frames arrive

**Cause hierarchy (most common first)**:
1. **Client not subscribed** — Must send `{"action":"subscribe","sensor_id":N}` after connecting
2. **No camera sensor exists** — `GET /api/realtime/session` returns `session_ready: false`
3. **No subscribers** — `_on_sensor_data()` skips if `subs` set is empty
4. **CARLA not running** — Bridge connects in background; check `/health`
5. **Frame skip too high** — `SENSOR_FRAME_SKIP` > 0 drops frames

**Debug steps**:
```bash
# 1. Check session
curl -s http://localhost:58337/api/realtime/session

# 2. If session_ready=false, check CARLA connection
curl -s http://localhost:58337/health

# 3. Check bridge logs for errors
tail -50 /tmp/bridge.log
```

---

## 6. Binary Protocol Mismatch

**Symptom**: Garbled data, wrong image sizes, crashes on frame parse

**Root cause**: Backend and frontend disagree on byte layout.

**Verification**:
- Camera header: Python packs `<IIIId` (24 bytes), JS reads at offsets 0,4,8,12,16
- World tick header: Python packs `<IdI` (16 bytes), JS reads at offsets 0,4,12
- Check that **both sides use little-endian**
- A single field size change breaks everything downstream

**Quick test**: Log the first 30 bytes of a received frame in hex on both sides and compare.

---

## 7. SharedArrayBuffer / COOP-COEP

**Symptom**: `SharedArrayBuffer is not defined` or Web Worker creation fails

**Cause**: Missing security headers for cross-origin isolation.

**Fix** in `vite.config.ts`:
```typescript
server: {
  headers: {
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
  }
}
```

Note: These headers can break loading of external resources (fonts, images from CDN). If using CDN resources, add `crossorigin` attribute.

---

## 8. Event Loop Blocking

**Symptom**: Bridge hangs, WebSocket messages delayed by seconds, timeouts

**Cause**: CARLA sensor callback runs on CARLA's thread. If JPEG encoding blocks the asyncio event loop, everything stalls.

**Architecture requirement**:
```python
# WRONG — blocks event loop:
async def on_data(data):
    jpeg = compress(data)  # slow!
    await broadcast(jpeg)

# CORRECT — encode on CARLA thread, dispatch to asyncio:
def _on_sensor_data(self, sensor_id, data):  # called on CARLA thread
    payload = self._process_sensor_data(sensor_id, data)  # encode here (blocking OK)
    self._loop.call_soon_threadsafe(  # dispatch to asyncio
        asyncio.ensure_future,
        self._broadcaster.broadcast_raw(payload, subs),
    )
```

The current code does this correctly. Don't change this pattern.

---

## 9. ImageBitmap Memory Leak

**Symptom**: Browser tab memory grows continuously, eventually crashes

**Cause**: `createImageBitmap()` allocates GPU memory. Must call `bitmap.close()` after rendering.

```typescript
// WRONG:
ctx.drawImage(bitmap, 0, 0);
// bitmap never freed → GPU memory leak

// CORRECT:
ctx.drawImage(bitmap, 0, 0);
bitmap.close();
```

Also: if frames arrive faster than rendering, queue management is needed. Discard old frames.

---

## 10. Vehicle Spawn Failure

**Symptom**: `Unable to spawn default ego vehicle`

**Causes**:
- All spawn points occupied by other actors
- Map not loaded properly
- Blueprint not found

**Fix**: The `realtime_session.py` already tries up to 50 spawn points with a fallback elevated position. If still failing:
```python
# Check available spawn points
world = carla_manager.world
points = world.get_map().get_spawn_points()
print(f"Available: {len(points)} spawn points")

# Check existing vehicles
actors = world.get_actors()
vehicles = [a for a in actors if a.type_id.startswith("vehicle.")]
print(f"Existing vehicles: {len(vehicles)}")

# Destroy all to free spawn points
for v in vehicles:
    v.destroy()
```

---

## 11. Map Reload Breaks Everything

**Symptom**: After map change, sensors stop producing data

**Cause**: Map reload destroys all actors. The `world` object reference becomes stale.

**Current mitigation**:
- `carla_client.py` refreshes `world` on every access
- `_heartbeat_loop()` re-fetches world every 5 seconds
- `realtime_session.ensure_running()` checks if vehicle + camera are alive every 1 second

If session doesn't recover, restart the bridge.

---

## 12. Port Already in Use

**Symptom**: `[Errno 98] Address already in use`

**Fix**:
```bash
# Find and kill processes on the ports
kill_port() { lsof -ti :$1 | xargs -r kill -9; }
kill_port 58336  # frontend
kill_port 58337  # bridge
kill_port 58338  # CARLA (be careful!)

# Or use the kill script:
./kill_all.sh
```
