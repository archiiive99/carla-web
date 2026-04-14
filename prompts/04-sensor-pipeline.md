# Sensor Data Pipeline — End to End

## Overview

```
CARLA UE5 Render Thread
  → SceneCaptureComponent2D renders to RenderTarget
  → PixelReader reads pixels asynchronously
  → Sensor::SendDataStream() serializes + streams via TCP
  
CARLA Python API (LibCarla)
  → sensor.listen(callback) receives deserialized data
  → callback runs on CARLA's internal thread (NOT asyncio)
  
carla-web-bridge
  → SensorManager._on_sensor_data() [CARLA thread]
  → ImageCompressor.compress_bgra_to_jpeg() [CARLA thread]
  → loop.call_soon_threadsafe() → broadcast_raw() [asyncio thread]
  → WebSocket.send_bytes() to subscribed clients
  
carla-web (Browser)
  → ws-receiver.worker onmessage
  → parseFrame() → parseCameraFrame()
  → createImageBitmap(new Blob([jpegData]))
  → postMessage({type:"camera", bitmap}) → main thread
  → canvas.drawImage(bitmap)
```

## Step-by-Step for RGB Camera

### 1. CARLA Server (C++ — DO NOT MODIFY)
- `SceneCaptureComponent2D_CARLA` captures the viewport
- Outputs BGRA8 pixel buffer (4 bytes per pixel)
- Sends via TCP streaming to connected Python client

### 2. Python Sensor Callback
```python
# In realtime_session.py, a camera is spawned:
sensor = world.spawn_actor(camera_bp, transform, attach_to=vehicle)
# In sensor_manager.py, we listen:
sensor.listen(lambda data, sid=sensor_id: self._on_sensor_data(sid, data))
```

The `data` object is a `carla.Image` with:
- `data.width` — image width (e.g., 960)
- `data.height` — image height (e.g., 540)
- `data.raw_data` — ctypes buffer, BGRA format, size = width * height * 4
- `data.frame` — simulation frame number
- `data.timestamp` — simulation timestamp (seconds)
- `data.type_id` — e.g., "sensor.camera.rgb"

### 3. JPEG Compression
```python
# sensor_manager.py → _encode_camera()
raw = bytes(data.raw_data)  # Convert ctypes → bytes
# compression/image.py:
if turbojpeg_available:
    arr = np.frombuffer(raw, dtype=np.uint8).reshape(height, width, 4)
    jpeg = turbojpeg.encode(arr, quality=80, pixel_format=TJPF_BGRA, flags=TJFLAG_FASTDCT)
else:
    # Pillow fallback: BGRA → RGB → JPEG
    arr = np.frombuffer(raw, dtype=np.uint8).reshape(height, width, 4)
    rgb = arr[:, :, [2, 1, 0]]  # BGRA → RGB
    img = Image.fromarray(rgb, "RGB")
    img.save(buf, format="JPEG", quality=80)
```

### 4. Binary Frame Packing
```python
# ws/protocol.py
payload = struct.pack("<IIIId", sensor_id, width, height, frame, timestamp) + jpeg_bytes
# Total header = 24 bytes
message = struct.pack("<BI", channel, len(payload)) + payload
# Total wire frame = 5 + 24 + len(jpeg_bytes)
```

### 5. WebSocket Broadcast
```python
# ws_broadcaster.py → broadcast_raw()
# Runs on asyncio event loop (dispatched via call_soon_threadsafe)
for conn in clients:
    if conn.client_id in target_clients:
        await conn.ws.send_bytes(message)
```

### 6. Browser Reception
```typescript
// ws-receiver.worker.ts
ws.onmessage = (event) => {
  const buffer = event.data as ArrayBuffer;
  const frame = parseFrame(buffer);
  // frame = { channel: 0x01, sensorId, width, height, frame, timestamp, data }
  
  // data is the JPEG bytes (ArrayBuffer)
  const blob = new Blob([frame.data], { type: "image/jpeg" });
  const bitmap = await createImageBitmap(blob);
  
  // Transfer bitmap to main thread (zero-copy)
  self.postMessage({ type: "camera", sensorId, bitmap }, [bitmap]);
};
```

### 7. Canvas Rendering
```typescript
// Main thread camera component
const canvas = canvasRef.current;
const ctx = canvas.getContext("2d");
ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
bitmap.close();  // IMPORTANT: release GPU memory
```

## Performance Considerations

### Bottlenecks (most likely to least)
1. **JPEG encoding** — TurboJPEG is 5-10x faster than Pillow. Always prefer it.
2. **bytes(data.raw_data)** — copies entire frame buffer. For 960x540 = ~2MB per frame.
3. **WebSocket send** — at 20 FPS with 50KB JPEG = ~1 MB/s per client.
4. **createImageBitmap** — async, GPU-accelerated in modern browsers.
5. **canvas.drawImage** — fast, hardware-accelerated.

### Frame Rate Control
- `sensor_tick: "0.05"` → CARLA generates frames at 20 FPS
- `SENSOR_FRAME_SKIP: 0` → send every frame (set to 1 to halve rate)
- Browser should smoothly handle 20 FPS JPEG decode

### Memory Leaks to Watch
- **ImageBitmap**: MUST call `bitmap.close()` after drawing, or GPU memory leaks
- **ArrayBuffer**: WebSocket messages are GC'd automatically
- **CARLA actors**: Must destroy sensors before vehicles, or callbacks fire on dead actors

## Subscription Flow

```
Browser connects → WebSocket /ws
  ↓
Bridge assigns client_id, adds to _clients pool
  ↓
Bridge has NO sensors initially... but _session_loop runs every 1s
  ↓
realtime_session.ensure_running() spawns vehicle + camera
  ↓
Camera sensor starts producing frames
  ↓
BUT: no client has subscribed to this sensor yet!
  ↓
Browser must send: {"action": "subscribe", "sensor_id": <camera_id>}
  ↓
OR: Frontend calls GET /api/realtime/session to discover camera_id, then subscribes
  ↓
Now frames flow to that client
```

**The auto-subscribe gap is a common failure point.** The frontend must discover the sensor ID and subscribe before any frames will arrive.
