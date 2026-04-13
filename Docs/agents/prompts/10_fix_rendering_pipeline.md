# Prompt 10 — Fix Rendering Pipeline (Workers → Components)

> **CRITICAL: The frontend receives real CARLA data in Web Workers but DROPS IT because no component is connected to consume it. This prompt fixes every broken link in the data pipeline.**

---

## Execution Strategy

**Use divide-and-conquer. Do NOT attempt all tasks at once.**

Each task is an atomic unit. Complete one task fully, verify it compiles (`npm run build`), then move to the next. If a task fails, fix it before proceeding — do not leave broken code behind.

### Task Dependency Graph

```
Task 1 (WorkerContext)
  └─→ Task 2 (useSensorData hooks)
        ├─→ Task 3 (CameraView)
        ├─→ Task 4 (LidarScene)
        ├─→ Task 7 (ImuChart)
        └─→ Task 6 (CameraFallback)
Task 5 (Pixel Streaming URL) ← independent, do anytime
Task 8 (WebSocket subscribe) ← independent, but must be done before testing Tasks 3/4/7
Task 9 (World tick broadcast) ← backend only, independent
Task 10 (Message format verify) ← do last, after all others
```

### Execution Order (follow exactly)

```
Phase A — Foundation (must be first)
  [  ] 1.1  Read useWebSocket.ts — understand current worker creation and wiring
  [  ] 1.2  Create src/contexts/WorkerContext.tsx with WorkerProvider
  [  ] 1.3  Wrap SimulationPage (or App) with <WorkerProvider>
  [  ] 1.4  Refactor useWebSocket.ts to use WorkerContext (or remove if redundant)
  [  ] 1.5  npm run build — must pass before continuing

Phase B — Sensor Data Hooks (depends on Phase A)
  [  ] 2.1  Rewrite useCameraSensorData() to use useWorkers()
  [  ] 2.2  Rewrite useLidarSensorData() to use useWorkers()
  [  ] 2.3  Implement useImuSensorData() with wsReceiverWorker message listener
  [  ] 2.4  Implement useGnssSensorData() with wsReceiverWorker message listener
  [  ] 2.5  Implement useRadarSensorData() with wsReceiverWorker message listener
  [  ] 2.6  Implement useCollisionData() with wsReceiverWorker message listener
  [  ] 2.7  Implement useLaneInvasionData() with wsReceiverWorker message listener
  [  ] 2.8  npm run build — must pass before continuing

Phase C — Sensor Components (depends on Phase B, parallelize if possible)
  [  ] 3.1  Fix CameraView.tsx — use useCameraSensorData, draw ImageBitmap to canvas via rAF
  [  ] 3.2  Verify all camera variants (DepthView, SegmentationView, etc.) inherit from CameraView
  [  ] 3.3  npm run build — verify
  [  ] 4.1  Fix LidarScene.tsx — use useLidarSensorData, update BufferGeometry in useFrame
  [  ] 4.2  npm run build — verify
  [  ] 7.1  Fix ImuChart.tsx — remove fake data, use useImuSensorData, flush to Recharts at 10Hz
  [  ] 7.2  npm run build — verify
  [  ] 6.1  Fix RadarView.tsx — use useRadarSensorData, draw polar plot on canvas
  [  ] 6.2  Fix GnssView.tsx — use useGnssSensorData, draw position trail on canvas
  [  ] 6.3  Fix CollisionLog.tsx — use useCollisionData, render event list
  [  ] 6.4  Fix LaneInvasionLog.tsx — use useLaneInvasionData, render event list
  [  ] 6.5  npm run build — verify

Phase D — Viewport (independent of B/C, can start after Phase A)
  [  ] 5.1  Fix MainViewport.tsx — replace hardcoded ws://localhost:80 with configurable URL
  [  ] 5.2  Fix PixelStreamingClient.tsx — accept signalingUrl as prop
  [  ] 5.3  Fix CameraFallback.tsx — spawn spectator camera, render via CameraView
  [  ] 5.4  npm run build — verify

Phase E — WebSocket Subscribe Flow (must be done before integration testing)
  [  ] 8.1  Read ws-receiver.worker.ts — check if it handles outgoing 'subscribe' messages
  [  ] 8.2  If not, add self.onmessage handler for subscribe/unsubscribe → ws.send(JSON)
  [  ] 8.3  Update sensorStore.subscribe() to postMessage to wsReceiverWorker
  [  ] 8.4  Update sensorStore.unsubscribe() to postMessage to wsReceiverWorker
  [  ] 8.5  npm run build — verify

Phase F — Backend Fix (Python, independent of all frontend phases)
  [  ] 9.1  Read bridge src/sensor_manager.py — confirm world tick is NOT being broadcast
  [  ] 9.2  Add world.on_tick() callback that encodes and broadcasts actor transforms
  [  ] 9.3  Test: curl bridge /health, confirm no Python errors in logs

Phase G — Integration Verification (do last, after all other phases)
  [  ] 10.1  Read image-decoder.worker.ts output format, compare to useCameraSensorData input
  [  ] 10.2  Read lidar-processor.worker.ts output format, compare to useLidarSensorData input
  [  ] 10.3  Read ws-receiver.worker.ts IMU/GNSS/Radar output, compare to hook inputs
  [  ] 10.4  Fix any field name mismatches found in 10.1-10.3
  [  ] 10.5  npm run build — final pass, zero errors, zero warnings
  [  ] 10.6  Start bridge + frontend (./run_local.sh), open browser, verify no console errors
  [  ] 10.7  Walk through every checkbox in the Verification section below
```

### Rules

- **One phase at a time.** Do not start Phase B until Phase A passes `npm run build`.
- **One subtask at a time.** Mark each `[  ]` as `[x]` when done.
- **Build after each phase.** If build fails, fix immediately — do not proceed with broken code.
- **Read before writing.** Every subtask that says "Fix X.tsx" means: read the file first, understand it, then modify. Do NOT blindly paste the code from this prompt — the actual file may have different structure, imports, or naming.
- **Do NOT rewrite working code.** If a component already implements something correctly, leave it alone.
- **If a subtask is already done** (file already works correctly), mark it `[x]` and move on.

---

## The Problem

```
CARLA Server → Bridge (OK) → WebSocket (OK) → Workers decode data (OK) → ??? → Components render nothing
```

`useWebSocket` creates 4 workers. Sensor components have NO ACCESS to these workers. There is no Context, no Provider, no prop drilling, nothing. Workers decode frames into ImageBitmaps and Float32Arrays that are never consumed.

---

## Read Before Starting

- `src/hooks/useWebSocket.ts` — creates workers, sets up MessageChannels
- `src/hooks/useSensorData.ts` — hooks that expect worker refs but are never called
- `src/workers/ws-receiver.worker.ts` — routes binary frames to other workers
- `src/workers/image-decoder.worker.ts` — JPEG → ImageBitmap
- `src/workers/lidar-processor.worker.ts` — point cloud processing
- `src/workers/telemetry-aggregator.worker.ts` — actor transforms batching
- `src/components/sensors/CameraView.tsx` — canvas that never receives bitmaps
- `src/components/sensors/LidarScene.tsx` — Three.js scene with commented-out rendering
- `src/components/viewport/MainViewport.tsx` — hardcoded Pixel Streaming URL
- `src/components/viewport/PixelStreamingClient.tsx` — WebRTC with wrong URL
- `src/components/viewport/CameraFallback.tsx` — empty canvas

---

## Task 1: Create WorkerContext Provider

Create `src/contexts/WorkerContext.tsx`:

```typescript
import { createContext, useContext, useRef, useEffect, useState, type ReactNode } from 'react'
import { useSimulationStore } from '@/stores/simulationStore'

interface WorkerRefs {
  wsReceiverWorker: Worker | null
  imageDecoderWorker: Worker | null
  lidarProcessorWorker: Worker | null
  telemetryWorker: Worker | null
  // MessagePorts for direct component → worker communication
  imagePort: MessagePort | null
  lidarPort: MessagePort | null
  telemetryPort: MessagePort | null
}

const WorkerContext = createContext<WorkerRefs>({
  wsReceiverWorker: null,
  imageDecoderWorker: null,
  lidarProcessorWorker: null,
  telemetryWorker: null,
  imagePort: null,
  lidarPort: null,
  telemetryPort: null,
})

export function useWorkers() {
  return useContext(WorkerContext)
}

export function WorkerProvider({ children }: { children: ReactNode }) {
  const [refs, setRefs] = useState<WorkerRefs>({ ... })
  const bridgeUrl = useSimulationStore(s => s.bridgeUrl)
  const connectionStatus = useSimulationStore(s => s.connectionStatus)

  useEffect(() => {
    if (connectionStatus !== 'connected') return

    // 1. Create all 4 workers
    const wsReceiver = new Worker(
      new URL('@/workers/ws-receiver.worker.ts', import.meta.url),
      { type: 'module' }
    )
    const imageDecoder = new Worker(
      new URL('@/workers/image-decoder.worker.ts', import.meta.url),
      { type: 'module' }
    )
    const lidarProcessor = new Worker(
      new URL('@/workers/lidar-processor.worker.ts', import.meta.url),
      { type: 'module' }
    )
    const telemetryAgg = new Worker(
      new URL('@/workers/telemetry-aggregator.worker.ts', import.meta.url),
      { type: 'module' }
    )

    // 2. Create MessageChannels for inter-worker communication
    const imageChannel = new MessageChannel()
    const lidarChannel = new MessageChannel()
    const telemetryChannel = new MessageChannel()

    // 3. Send ports to ws-receiver so it can route data to processing workers
    wsReceiver.postMessage(
      {
        type: 'init',
        wsUrl: bridgeUrl.replace(/^http/, 'ws') + '/ws',
        imagePort: imageChannel.port1,
        lidarPort: lidarChannel.port1,
        telemetryPort: telemetryChannel.port1,
      },
      [imageChannel.port1, lidarChannel.port1, telemetryChannel.port1]
    )

    // 4. Send the other end of image channel to image decoder
    imageDecoder.postMessage(
      { type: 'init', port: imageChannel.port2 },
      [imageChannel.port2]
    )

    // 5. Send the other end of lidar channel to lidar processor
    lidarProcessor.postMessage(
      { type: 'init', port: lidarChannel.port2 },
      [lidarChannel.port2]
    )

    // 6. Send the other end of telemetry channel to telemetry aggregator
    telemetryAgg.postMessage(
      { type: 'init', port: telemetryChannel.port2 },
      [telemetryChannel.port2]
    )

    // 7. Create component-facing ports
    // Components need to LISTEN to decoded output from processing workers.
    // Image decoder outputs ImageBitmaps → components need a port to receive them.
    // Solution: image-decoder posts back to main thread via its own worker.onmessage.
    // Components subscribe by sensorId.

    setRefs({
      wsReceiverWorker: wsReceiver,
      imageDecoderWorker: imageDecoder,
      lidarProcessorWorker: lidarProcessor,
      telemetryWorker: telemetryAgg,
      imagePort: null, // not needed — components listen to worker.onmessage
      lidarPort: null,
      telemetryPort: null,
    })

    return () => {
      wsReceiver.terminate()
      imageDecoder.terminate()
      lidarProcessor.terminate()
      telemetryAgg.terminate()
    }
  }, [bridgeUrl, connectionStatus])

  return (
    <WorkerContext.Provider value={refs}>
      {children}
    </WorkerContext.Provider>
  )
}
```

**Important:** Check how `useWebSocket.ts` currently creates and wires workers. The WorkerProvider must replicate that exact wiring but expose the workers via Context. If `useWebSocket.ts` already does this correctly, refactor it into the provider instead of duplicating. The key change is: workers must be accessible to ANY component in the tree, not trapped inside a hook.

Wrap the app with `<WorkerProvider>` in `src/App.tsx` (or `src/routes/SimulationPage.tsx` — wherever the simulation UI lives).

---

## Task 2: Fix useSensorData Hooks

Rewrite `src/hooks/useSensorData.ts` to use the WorkerContext:

### useCameraSensorData

```typescript
export function useCameraSensorData(sensorId: number) {
  const { imageDecoderWorker } = useWorkers()
  const bitmapRef = useRef<ImageBitmap | null>(null)
  const fpsRef = useRef(0)
  const frameCountRef = useRef(0)
  const lastFpsTimeRef = useRef(performance.now())

  useEffect(() => {
    if (!imageDecoderWorker) return

    const handler = (e: MessageEvent) => {
      const { type, sensorId: sid, bitmap } = e.data
      if (type !== 'camera' || sid !== sensorId) return

      // Release previous bitmap to avoid memory leak
      if (bitmapRef.current) bitmapRef.current.close()
      bitmapRef.current = bitmap

      // FPS calculation
      frameCountRef.current++
      const now = performance.now()
      const elapsed = now - lastFpsTimeRef.current
      if (elapsed >= 1000) {
        fpsRef.current = Math.round((frameCountRef.current / elapsed) * 1000)
        frameCountRef.current = 0
        lastFpsTimeRef.current = now
      }
    }

    imageDecoderWorker.addEventListener('message', handler)
    return () => {
      imageDecoderWorker.removeEventListener('message', handler)
      if (bitmapRef.current) bitmapRef.current.close()
    }
  }, [imageDecoderWorker, sensorId])

  return { bitmapRef, fpsRef }
}
```

### useLidarSensorData

```typescript
export function useLidarSensorData(sensorId: number) {
  const { lidarProcessorWorker } = useWorkers()
  const positionsRef = useRef<Float32Array | null>(null)
  const colorsRef = useRef<Float32Array | null>(null)
  const pointCountRef = useRef(0)

  useEffect(() => {
    if (!lidarProcessorWorker) return

    const handler = (e: MessageEvent) => {
      const { type, sensorId: sid, positions, colors, pointCount } = e.data
      if (type !== 'lidar' || sid !== sensorId) return

      positionsRef.current = positions
      colorsRef.current = colors
      pointCountRef.current = pointCount
    }

    lidarProcessorWorker.addEventListener('message', handler)
    return () => lidarProcessorWorker.removeEventListener('message', handler)
  }, [lidarProcessorWorker, sensorId])

  return { positionsRef, colorsRef, pointCountRef }
}
```

### useImuSensorData, useGnssSensorData, useRadarSensorData, useCollisionData

These receive data via `wsReceiverWorker.onmessage` (channels 0x07-0x0A are posted to main thread, not routed to a processing worker). Implement each:

```typescript
export function useImuSensorData(sensorId: number) {
  const { wsReceiverWorker } = useWorkers()
  const accelRef = useRef({ x: 0, y: 0, z: 0 })
  const gyroRef = useRef({ x: 0, y: 0, z: 0 })
  const compassRef = useRef(0)
  const bufferRef = useRef<Array<{ accel: Vector3; gyro: Vector3; t: number }>>([])

  useEffect(() => {
    if (!wsReceiverWorker) return
    const handler = (e: MessageEvent) => {
      if (e.data.type !== 'imu' || e.data.sensorId !== sensorId) return
      accelRef.current = e.data.accelerometer
      gyroRef.current = e.data.gyroscope
      compassRef.current = e.data.compass
      bufferRef.current.push({
        accel: e.data.accelerometer,
        gyro: e.data.gyroscope,
        t: e.data.timestamp,
      })
      if (bufferRef.current.length > 200) bufferRef.current.shift()
    }
    wsReceiverWorker.addEventListener('message', handler)
    return () => wsReceiverWorker.removeEventListener('message', handler)
  }, [wsReceiverWorker, sensorId])

  return { accelRef, gyroRef, compassRef, bufferRef }
}
```

Same pattern for GNSS (lat/lon/alt refs), Radar (detections array ref), Collision (events array ref), Lane Invasion (events array ref).

---

## Task 3: Fix CameraView.tsx

Replace the broken rendering with the real data hook:

```typescript
import { useCameraSensorData } from '@/hooks/useSensorData'

export default function CameraView({ sensorId, sensorType, className }: CameraViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { bitmapRef, fpsRef } = useCameraSensorData(sensorId)
  const fpsDisplayRef = useRef<HTMLSpanElement>(null)
  const resDisplayRef = useRef<HTMLSpanElement>(null)

  // RAF rendering loop — draws latest bitmap to canvas
  useEffect(() => {
    let animId: number
    const draw = () => {
      const canvas = canvasRef.current
      const bitmap = bitmapRef.current
      if (canvas && bitmap) {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          // Resize canvas to match bitmap (only when dimensions change)
          if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
            canvas.width = bitmap.width
            canvas.height = bitmap.height
          }
          ctx.drawImage(bitmap, 0, 0)
        }
        // Update overlays via ref (no React re-render)
        if (fpsDisplayRef.current) fpsDisplayRef.current.textContent = `${fpsRef.current} FPS`
        if (resDisplayRef.current) resDisplayRef.current.textContent = `${bitmap.width}×${bitmap.height}`
      }
      animId = requestAnimationFrame(draw)
    }
    animId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animId)
  }, [bitmapRef, fpsRef])

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between p-2">
        <CardTitle className="text-xs">{displayName}</CardTitle>
        <div className="flex gap-2 text-[10px] text-muted-foreground font-mono">
          <span ref={resDisplayRef}>--</span>
          <span ref={fpsDisplayRef}>-- FPS</span>
        </div>
      </CardHeader>
      <CardContent className="p-0 relative">
        <canvas ref={canvasRef} className="w-full h-full object-contain" />
      </CardContent>
    </Card>
  )
}
```

**Key rules:**
- `bitmapRef.current` is read inside `requestAnimationFrame` — never triggers React re-render
- FPS/resolution displayed via `ref.textContent` — no state updates
- Canvas resizes only when bitmap dimensions change
- Previous bitmap is closed in the hook (memory management)

---

## Task 4: Fix LidarScene.tsx

Replace the commented-out rendering with real data:

```typescript
import { useLidarSensorData } from '@/hooks/useSensorData'
import { useFrame } from '@react-three/fiber'

export default function LidarScene({ sensorId }: { sensorId: number }) {
  const { positionsRef, colorsRef, pointCountRef } = useLidarSensorData(sensorId)
  const geometryRef = useRef<THREE.BufferGeometry>(null)

  // Pre-allocate buffers
  const MAX_POINTS = 200_000
  const [positionAttr] = useState(() => new THREE.Float32BufferAttribute(new Float32Array(MAX_POINTS * 3), 3))
  const [colorAttr] = useState(() => new THREE.Float32BufferAttribute(new Float32Array(MAX_POINTS * 3), 3))

  useFrame(() => {
    const geo = geometryRef.current
    const positions = positionsRef.current
    const colors = colorsRef.current
    const count = pointCountRef.current

    if (!geo || !positions || !colors || count === 0) return

    // Copy worker data into geometry attributes
    positionAttr.array.set(positions.subarray(0, count * 3))
    positionAttr.needsUpdate = true

    colorAttr.array.set(colors.subarray(0, count * 3))
    colorAttr.needsUpdate = true

    geo.setDrawRange(0, count)
  })

  return (
    <points>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute attach="attributes-position" {...positionAttr} />
        <bufferAttribute attach="attributes-color" {...colorAttr} />
      </bufferGeometry>
      <pointsMaterial size={0.05} vertexColors sizeAttenuation />
    </points>
  )
}
```

**Key rules:**
- NEVER create new BufferGeometry per frame
- positionAttr and colorAttr are created ONCE via useState initializer
- useFrame copies data and sets needsUpdate — this is the standard Three.js pattern
- setDrawRange limits rendering to actual point count

---

## Task 5: Fix Pixel Streaming URL

In `src/components/viewport/MainViewport.tsx`, find the hardcoded `ws://localhost:80` and make it configurable:

```typescript
// Read from localStorage or use default matching run.sh port
const signalingUrl = localStorage.getItem('pixelStreamingUrl') || 'ws://localhost:42680'
```

In `src/components/viewport/PixelStreamingClient.tsx`, accept it as a prop:

```typescript
interface PixelStreamingClientProps {
  signalingUrl: string
  onConnected?: () => void
  onDisconnected?: () => void
}
```

The signaling server runs on port 42680 as defined in `run.sh`. Match that default.

---

## Task 6: Fix CameraFallback.tsx

When Pixel Streaming fails, fall back to streaming an RGB camera via the worker pipeline:

```typescript
export default function CameraFallback() {
  // Spawn a spectator camera via REST API on mount
  const [spectatorSensorId, setSpectatorSensorId] = useState<number | null>(null)

  useEffect(() => {
    // Ask the bridge to create a spectator camera sensor
    const api = new CarlaApi()
    api.spawnSensor({
      type: 'sensor.camera.rgb',
      transform: { location: { x: 0, y: 0, z: 50 }, rotation: { pitch: -90, yaw: 0, roll: 0 } },
      parent_id: 0, // spectator or world
      attributes: { image_size_x: '1280', image_size_y: '720', fov: '110' },
    }).then(sensor => {
      setSpectatorSensorId(sensor.id)
      // Subscribe to the sensor via WebSocket
      // The ws-receiver worker will handle the subscription message
    }).catch(() => {
      // If spawn fails (no CARLA), show placeholder
    })

    return () => {
      if (spectatorSensorId) api.destroyActor(spectatorSensorId).catch(() => {})
    }
  }, [])

  if (!spectatorSensorId) {
    return <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
      Connecting to simulation...
    </div>
  }

  // Render via CameraView which now works with the fixed pipeline
  return <CameraView sensorId={spectatorSensorId} sensorType="sensor.camera.rgb" className="h-full" />
}
```

This gives a camera-based viewport when Pixel Streaming is unavailable.

---

## Task 7: Fix ImuChart.tsx — Use Real Data

Remove ALL `Math.sin`, `Math.random`, fake data generation. Use the real hook:

```typescript
import { useImuSensorData } from '@/hooks/useSensorData'

export default function ImuChart({ sensorId }: { sensorId: number }) {
  const { bufferRef, compassRef } = useImuSensorData(sensorId)
  const [chartData, setChartData] = useState<any[]>([])

  // Flush buffer to chart state at 10Hz
  useEffect(() => {
    const interval = setInterval(() => {
      const buf = bufferRef.current
      if (buf.length === 0) return
      setChartData(buf.map((s, i) => ({
        i,
        ax: s.accel.x, ay: s.accel.y, az: s.accel.z,
        gx: s.gyro.x, gy: s.gyro.y, gz: s.gyro.z,
      })))
    }, 100)
    return () => clearInterval(interval)
  }, [bufferRef])

  // ... render Recharts with chartData, compass with compassRef
}
```

---

## Task 8: Fix WebSocket Sensor Subscription

When a sensor is added to the SensorPanel grid or a camera fallback is created, the frontend must send a subscribe message to the bridge. Verify that:

1. `sensorStore.subscribe(sensorId)` sends a WebSocket text message: `{ "action": "subscribe", "sensor_id": 123 }`
2. The ws-receiver worker handles outgoing messages (not just incoming)
3. If the worker doesn't support sending, add a method:

```typescript
// In ws-receiver.worker.ts, handle messages from main thread:
self.onmessage = (e) => {
  if (e.data.type === 'subscribe') {
    const msg = JSON.stringify({ action: 'subscribe', sensor_id: e.data.sensorId })
    ws.send(msg)
  }
  if (e.data.type === 'unsubscribe') {
    const msg = JSON.stringify({ action: 'unsubscribe', sensor_id: e.data.sensorId })
    ws.send(msg)
  }
}
```

And in `sensorStore.subscribe()`:
```typescript
subscribe: (sensorId: number) => {
  const worker = /* get wsReceiverWorker from context or global ref */
  worker?.postMessage({ type: 'subscribe', sensorId })
  set(s => ({ subscriptions: new Set([...s.subscriptions, sensorId]) }))
}
```

The bridge will only stream data for sensors that have at least one subscriber. Without this, NO DATA FLOWS even if everything else is fixed.

---

## Task 9: Add World Tick Broadcasting to Bridge

The bridge never calls `encode_world_tick()`. In `src/sensor_manager.py` (or `src/main.py`), add:

```python
# In the lifespan or after CARLA connects:
def _on_world_tick(snapshot):
    """Broadcast all actor transforms every tick."""
    actors = carla_manager.world.get_actors()
    tick_data = encode_world_tick(snapshot.frame, snapshot.timestamp.elapsed_seconds, actors)
    asyncio.get_event_loop().call_soon_threadsafe(
        asyncio.ensure_future,
        ws_broadcaster.broadcast_world_tick(tick_data)
    )

# Register callback:
carla_manager.world.on_tick(_on_world_tick)
```

This enables the frontend's actorStore to receive real-time actor positions via WebSocket instead of polling REST.

---

## Task 10: Verify Worker Message Formats Match

Read BOTH sides and confirm the message shapes match:

**image-decoder.worker.ts output:**
```typescript
self.postMessage({ type: 'camera', sensorId, frame, width, height, bitmap }, [bitmap])
```

**useCameraSensorData expects:**
```typescript
e.data.type === 'camera' && e.data.sensorId === sensorId
e.data.bitmap // ImageBitmap
```

**lidar-processor.worker.ts output:**
```typescript
self.postMessage({ type: 'lidar', sensorId, positions, colors, pointCount }, [positions.buffer, colors.buffer])
```

**useLidarSensorData expects:**
```typescript
e.data.type === 'lidar' && e.data.sensorId === sensorId
e.data.positions // Float32Array
e.data.colors // Float32Array
e.data.pointCount // number
```

If any field names don't match, fix them. Read the actual worker code and the actual hook code — do NOT assume they match based on this prompt. Verify.

---

## Implementation Order

**Follow the phase order from the Execution Strategy at the top of this document.**

```
Phase A → Phase B → Phase C (+ Phase D in parallel) → Phase E → Phase F → Phase G
```

Do NOT skip phases. Do NOT proceed to the next phase until `npm run build` passes.

---

## Verification (Phase G — do this last)

Walk through every item. If any fails, go back and fix it.

### Build
- [ ] `npm run build` — zero errors, zero warnings
- [ ] `tsc --noEmit` — zero type errors

### Phase A: WorkerContext
- [ ] `src/contexts/WorkerContext.tsx` exists
- [ ] `WorkerProvider` wraps the simulation UI
- [ ] `useWorkers()` returns all 4 worker refs when connected
- [ ] `useWorkers()` returns all nulls when disconnected
- [ ] No duplicate worker creation (useWebSocket.ts refactored or removed)

### Phase B: Sensor Data Hooks
- [ ] `useCameraSensorData(sensorId)` returns `{ bitmapRef, fpsRef }` — both update on data
- [ ] `useLidarSensorData(sensorId)` returns `{ positionsRef, colorsRef, pointCountRef }` — all update on data
- [ ] `useImuSensorData(sensorId)` returns `{ accelRef, gyroRef, compassRef, bufferRef }` — all update on data
- [ ] `useGnssSensorData(sensorId)` returns `{ latRef, lonRef, altRef, trailRef }` — all update on data
- [ ] `useRadarSensorData(sensorId)` returns `{ detectionsRef }` — updates on data
- [ ] `useCollisionData(sensorId)` returns `{ eventsRef }` — updates on data
- [ ] `useLaneInvasionData(sensorId)` returns `{ eventsRef }` — updates on data
- [ ] No hook uses `Math.sin`, `Math.random`, or any fake data generator

### Phase C: Sensor Components
- [ ] CameraView draws real ImageBitmap to canvas (not blank)
- [ ] CameraView shows FPS and resolution via ref (no React state for these)
- [ ] All camera variants (Depth, Segmentation, Instance, OpticalFlow, Normals, DVS) work
- [ ] LidarScene renders point cloud in Three.js (not empty grid)
- [ ] LidarScene does NOT allocate new geometry per frame
- [ ] ImuChart shows real accelerometer/gyroscope data (not sine waves)
- [ ] RadarView draws polar plot with velocity-colored detections
- [ ] GnssView shows lat/lon/alt with position trail
- [ ] CollisionLog shows events with severity badges
- [ ] LaneInvasionLog shows events with marking type badges

### Phase D: Viewport
- [ ] Pixel Streaming URL defaults to `ws://localhost:42680`
- [ ] Pixel Streaming URL is configurable via localStorage `pixelStreamingUrl`
- [ ] CameraFallback spawns a spectator camera and renders it via CameraView
- [ ] When Pixel Streaming fails, fallback appears within 5 seconds

### Phase E: WebSocket Subscribe
- [ ] ws-receiver.worker.ts handles `{ type: 'subscribe', sensorId }` messages from main thread
- [ ] ws-receiver.worker.ts handles `{ type: 'unsubscribe', sensorId }` messages from main thread
- [ ] sensorStore.subscribe(id) sends subscribe message to worker
- [ ] sensorStore.unsubscribe(id) sends unsubscribe message to worker
- [ ] Without subscribing, no sensor data flows (bridge only streams to subscribers)

### Phase F: Backend
- [ ] Bridge broadcasts world tick (channel 0x10) every simulation tick
- [ ] World tick includes all actor transforms (position, rotation, velocity)
- [ ] No Python errors in bridge logs when CARLA is connected

### End-to-End (only testable with running CARLA server)
- [ ] Start `./run.sh` — all 4 services start
- [ ] Open `http://localhost:42691` — UI loads
- [ ] Spawn a vehicle via SpawnPanel — appears in actor list
- [ ] Attach RGB camera to vehicle — image appears in SensorPanel
- [ ] Attach LiDAR to vehicle — point cloud appears in SensorPanel
- [ ] Change weather — simulation visuals change
- [ ] Actor positions update in MiniMap in real time
- [ ] No console errors in browser DevTools
