# Phase 0: Camera Feed MUST Show Real Frames

## THIS IS THE PREREQUISITE FOR EVERYTHING ELSE

**Do NOT proceed to any other phase until the browser shows actual live camera frames from CARLA.** Not "Waiting for bridge camera...". Not a black canvas. Not a frozen image. Real, live, updating frames that change every 50ms.

This is the single most important requirement. If the camera feed doesn't work, the entire dashboard is useless.

---

## What "Working" Means — Precisely

You must verify ALL of the following with Playwright:

1. **The canvas element exists** in the DOM and is visible
2. **The canvas is NOT black** — pixel samples at the center have non-zero RGB values
3. **The canvas is NOT frozen** — pixel samples taken 2 seconds apart are DIFFERENT
4. **There is NO "Waiting for..." text** visible anywhere on the page
5. **The FPS counter** (if displayed) shows a value > 0
6. **The browser console** has zero WebSocket errors

### Playwright Verification Script

Save this as `/data1/song99/carla/carla-web/e2e/camera-feed.spec.ts` and run it after every change:

```typescript
import { test, expect } from "@playwright/test"

test("camera feed shows real live frames", async ({ page }) => {
  await page.goto("http://127.0.0.1:58336")
  
  // Wait for page to load and WebSocket to connect
  await page.waitForTimeout(8000)
  
  // FAIL if "Waiting" text is visible
  const waitingCount = await page.locator("text=/[Ww]aiting/").count()
  expect(waitingCount, "Page still shows 'Waiting...' text — camera feed is NOT rendering").toBe(0)
  
  // Find canvas elements
  const canvases = page.locator("canvas")
  const canvasCount = await canvases.count()
  expect(canvasCount, "No canvas elements found — camera component is not rendering").toBeGreaterThan(0)
  
  // Sample pixels from the first large canvas
  const firstCanvas = canvases.first()
  const box = await firstCanvas.boundingBox()
  expect(box, "Canvas has no bounding box — it may be hidden").not.toBeNull()
  expect(box!.width, "Canvas width is too small").toBeGreaterThan(50)
  expect(box!.height, "Canvas height is too small").toBeGreaterThan(50)
  
  // Sample pixel at center — must not be all black
  const pixel1 = await firstCanvas.evaluate((el: HTMLCanvasElement) => {
    const ctx = el.getContext("2d")
    if (!ctx) return null
    const d = ctx.getImageData(Math.floor(el.width / 2), Math.floor(el.height / 2), 1, 1).data
    return [d[0], d[1], d[2]]
  })
  expect(pixel1, "Canvas 2D context is null").not.toBeNull()
  const brightness1 = pixel1![0] + pixel1![1] + pixel1![2]
  expect(brightness1, `Canvas is all black (${pixel1}) — no image data is being drawn`).toBeGreaterThan(5)
  
  // Wait 2 seconds and sample again — pixels must CHANGE (live feed, not frozen)
  await page.waitForTimeout(2000)
  
  const pixel2 = await firstCanvas.evaluate((el: HTMLCanvasElement) => {
    const ctx = el.getContext("2d")
    if (!ctx) return null
    const d = ctx.getImageData(Math.floor(el.width / 2), Math.floor(el.height / 2), 1, 1).data
    return [d[0], d[1], d[2]]
  })
  expect(pixel2, "Second pixel sample failed").not.toBeNull()
  
  // At least some pixels should differ (the car is moving, scene changes)
  const changed = pixel1![0] !== pixel2![0] || pixel1![1] !== pixel2![1] || pixel1![2] !== pixel2![2]
  // Sample more points if center didn't change
  if (!changed) {
    const pixel3 = await firstCanvas.evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext("2d")
      if (!ctx) return null
      const d = ctx.getImageData(Math.floor(el.width / 4), Math.floor(el.height / 4), 1, 1).data
      return [d[0], d[1], d[2]]
    })
    const pixel4 = await firstCanvas.evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext("2d")
      if (!ctx) return null
      await new Promise(r => setTimeout(r, 1000))
      const d = ctx.getImageData(Math.floor(el.width / 4), Math.floor(el.height / 4), 1, 1).data
      return [d[0], d[1], d[2]]
    })
    const changed2 = pixel3![0] !== pixel4![0] || pixel3![1] !== pixel4![1] || pixel3![2] !== pixel4![2]
    expect(changed2, `Canvas pixels are not changing — feed is frozen. Sample1: ${pixel1}, Sample2: ${pixel2}`).toBe(true)
  }
  
  // Take screenshot for visual inspection
  await page.screenshot({ path: "/tmp/carla-camera-feed-test.png", fullPage: true })
  
  // Check no console errors
  const errors: string[] = []
  page.on("console", msg => {
    if (msg.type() === "error") errors.push(msg.text())
  })
  await page.waitForTimeout(3000)
  
  // Allow some non-critical errors but fail on WebSocket or worker errors
  const criticalErrors = errors.filter(e => 
    e.includes("WebSocket") || e.includes("Worker") || e.includes("TypeError") || e.includes("ReferenceError")
  )
  expect(criticalErrors, `Critical browser errors found: ${criticalErrors.join("; ")}`).toHaveLength(0)
})
```

Run it:
```bash
cd /data1/song99/carla/carla-web
npx playwright test e2e/camera-feed.spec.ts
```

**This test MUST pass before you do anything else.**

---

## Debugging the Camera Feed — Complete Guide

### Layer 1: Does the bridge have a camera?

```bash
curl -s http://127.0.0.1:58337/api/realtime/session | python3 -m json.tool
```

**Expected output:**
```json
{
  "default_vehicle_id": 171,
  "default_camera_id": 172,
  "session_ready": true
}
```

**If `session_ready` is false:**
- Check bridge logs: `tmux capture-pane -t carla-web -p -S -50`
- Common causes: CARLA not connected, no spawn points, blueprint not found
- Fix in `carla-web-bridge/src/realtime_session.py`

**If `default_camera_id` is null but `default_vehicle_id` exists:**
- Camera spawn failed — check bridge logs for sensor spawn errors
- Common cause: CARLA camera blueprint attributes wrong

### Layer 2: Is the bridge sending camera frames over WebSocket?

```bash
python3 -c "
import asyncio, json, struct, websockets, urllib.request

async def test():
    resp = urllib.request.urlopen('http://127.0.0.1:58337/api/realtime/session')
    session = json.loads(resp.read())
    cam_id = session.get('default_camera_id')
    if not cam_id:
        print('ERROR: No camera. Session:', session)
        return
    
    print(f'Camera ID: {cam_id}')
    
    async with websockets.connect('ws://127.0.0.1:58337/ws') as ws:
        await ws.send(json.dumps({'action': 'subscribe', 'sensor_id': cam_id}))
        print('Subscribed. Waiting for frames...')
        
        frame_count = 0
        for i in range(20):
            try:
                data = await asyncio.wait_for(ws.recv(), timeout=5)
            except asyncio.TimeoutError:
                print(f'TIMEOUT: No data received after 5 seconds (got {frame_count} frames total)')
                break
            
            if isinstance(data, bytes) and len(data) > 5:
                channel = data[0]
                payload_len = struct.unpack('<I', data[1:5])[0]
                
                if channel == 0x01:  # Camera
                    frame_count += 1
                    sid, w, h, frame, ts = struct.unpack('<IIIId', data[5:29])
                    jpeg_size = len(data) - 29
                    is_valid_jpeg = data[29:31] == b'\xff\xd8'
                    print(f'  Camera frame #{frame_count}: {w}x{h}, frame={frame}, jpeg={jpeg_size}B, valid={is_valid_jpeg}')
                elif channel == 0x10:  # World tick
                    pass  # ignore ticks
        
        if frame_count == 0:
            print('ERROR: No camera frames received! Check bridge sensor_manager callback chain.')
        else:
            print(f'OK: Received {frame_count} camera frames')

asyncio.run(test())
"
```

**If no frames arrive:**
- Bridge is not broadcasting. Check `sensor_manager.py` callback chain.
- Common cause: `_on_sensor_data` → `_process_sensor_data` → `_encode_camera` → `broadcast_raw` — any step could fail silently.
- Add logging: `logger.info("Camera frame %d: %d bytes", frame, len(jpeg))` in `_encode_camera`

**If frames arrive but JPEG is invalid:**
- TurboJPEG encoding failing, or raw data format wrong
- Check `compression/image.py` — try the Pillow fallback
- Check `data.raw_data` length matches `width * height * 4` (BGRA)

### Layer 3: Is the frontend connecting and subscribing?

Open the browser DevTools (or use Playwright to check):

1. **WebSocket connection**: Network tab → WS → should see a connection to `ws://127.0.0.1:58337/ws`
2. **Subscribe message sent**: In the WS messages, look for `{"action":"subscribe","sensor_id":172}` (or the binary equivalent)
3. **Binary frames received**: After subscribe, binary messages should flow in

**If the frontend is NOT subscribing:**
The frontend needs to:
1. Call `GET /api/realtime/session` to get `default_camera_id`
2. Send a subscribe message with that sensor ID over the WebSocket

Check the code in:
- `src/contexts/WorkerContext.tsx` — where the worker is created and camera subscription happens
- `src/workers/ws-receiver.worker.ts` — where subscribe messages are sent
- `src/stores/sensorStore.ts` — where subscriptions are tracked
- `src/hooks/useSensorData.ts` → `useCameraSensorData` — where bitmap data arrives

**The subscription gap is the #1 cause of "Waiting for bridge camera...":**
The worker connects to WebSocket but never sends a subscribe message → bridge never sends frames → frontend waits forever.

### Layer 4: Is the frontend decoding and rendering frames?

Even if frames arrive at the WebSocket, the decode-and-render chain can break at any point:

```
ws-receiver.worker receives ArrayBuffer
  → parseFrame() extracts channel + payload
  → For camera: sends payload to image-decoder.worker via MessagePort
  → image-decoder.worker extracts 24-byte header + JPEG bytes
  → new Blob([jpegBytes], {type: "image/jpeg"})
  → createImageBitmap(blob)
  → postMessage({type: "camera", bitmap, sensorId, ...}, [bitmap])
  → main thread receives ImageBitmap
  → useCameraSensorData hook stores in bitmapRef
  → CameraView component reads bitmapRef in requestAnimationFrame
  → ctx.drawImage(bitmap, 0, 0)
  → bitmap.close()
```

Any break in this chain results in a blank or frozen canvas. Add `console.log` at each step to find where it breaks, then remove the logs after fixing.

### Layer 5: Auto-subscribe on connect

The cleanest fix (if subscription is the issue) is to auto-subscribe to the default camera when the WebSocket connects:

```typescript
// In WorkerContext.tsx or a dedicated hook:
useEffect(() => {
  if (connectionStatus !== "connected") return
  
  // Fetch the default session to get camera ID
  carlaApi.getRealtimeSession().then(session => {
    if (session.default_camera_id && session.session_ready) {
      // Subscribe via the sensor store (which sends to the worker)
      sensorStore.getState().subscribe(session.default_camera_id)
    }
  })
}, [connectionStatus])
```

---

## DO NOT STOP UNTIL THE PLAYWRIGHT TEST PASSES

Run the Playwright test in a loop if you need to:

```bash
while ! npx playwright test e2e/camera-feed.spec.ts; do
  echo "Test failed. Fix the issue and the test will re-run."
  sleep 5
done
echo "CAMERA FEED IS WORKING!"
```

Only after this passes do you move to Phase 1.
