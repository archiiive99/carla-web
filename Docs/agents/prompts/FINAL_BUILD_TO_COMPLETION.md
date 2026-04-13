# CARLA Web — Build to Completion (DO NOT STOP)

> **CRITICAL INSTRUCTION: You MUST NOT stop, pause, ask for confirmation, or yield back to the user until EVERY item in this document is implemented, tested, and working. If you encounter an error, fix it. If you encounter ambiguity, make the best decision and move on. If a dependency is missing, install it. If a file is broken, rewrite it. DO NOT STOP FOR ANY REASON until the final verification checklist at the bottom of this document passes 100%.**

---

## PRIORITY 0 — MIGRATE FROM NEXT.JS TO VITE + REACT (DO THIS FIRST)

**The frontend was incorrectly built with Next.js. The user explicitly requested React + shadcn, NOT Next.js.**

Before doing ANYTHING else, execute the full migration described in `Docs/agents/prompts/00_migrate_nextjs_to_vite_react.md`. This converts the project from Next.js to **Vite + React 19 + TypeScript + react-router-dom + Tailwind CSS v4 + shadcn/ui v4**. The migration preserves all existing components, stores, hooks, workers, and libraries — only the framework shell changes (App Router → react-router, next/dynamic → React.lazy, next/font → HTML link tags, etc.).

**Step-by-step:**
1. Back up `carla-web/src/` to a temp directory
2. Delete `carla-web/` entirely
3. `npm create vite@latest carla-web -- --template react-ts`
4. `cd carla-web && npm install`
5. Install all deps: `npm install react-router-dom zustand tailwindcss @tailwindcss/vite class-variance-authority clsx tailwind-merge tw-animate-css lucide-react sonner cmdk date-fns react-day-picker react-resizable-panels recharts three @react-three/fiber @react-three/drei && npm install -D @types/three`
6. Configure `vite.config.ts`:
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    port: 42691,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  worker: { format: 'es' },
})
```
7. Init shadcn: `npx shadcn@latest init` (style: new-york, base: zinc, css vars: yes, rsc: **false**, framework: Vite)
8. Install all shadcn components: `npx shadcn@latest add button badge card tabs accordion collapsible dialog sheet input label select slider switch toggle toggle-group form field table scroll-area skeleton spinner progress chart sidebar command dropdown-menu context-menu navigation-menu breadcrumb alert alert-dialog sonner tooltip hover-card popover resizable separator aspect-ratio empty-state keyboard checkbox radio-group`
9. Copy back all `src/` code from backup (components/, stores/, hooks/, workers/, lib/, types/)
10. Create `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css` (see `00_migrate_nextjs_to_vite_react.md` for exact content)
11. Move `src/app/page.tsx` → `src/routes/SimulationPage.tsx` (remove Metadata export, remove `'use client'`)
12. Move `src/app/settings/page.tsx` → `src/routes/SettingsPage.tsx`
13. Move `src/app/globals.css` → `src/index.css`
14. Find and replace ALL `next/dynamic` → `React.lazy` + `Suspense`
15. Find and remove ALL `'use client'` directives
16. Find and replace ALL `next/font` → remove (fonts in `index.html` via `<link>`)
17. Find and replace ALL `next/image` → `<img>`
18. Copy `Docs/carla_ue5_logo.png` → `public/favicon.png`
19. Run `npm run build` — fix EVERY error until it passes clean
20. Run `npm run dev` — verify the app loads at `http://localhost:42691`

**After migration is complete, verify `npm run build` passes with zero errors before continuing.**

---

## CURRENT STATE (Read This First)

The project is approximately **85% complete**. Two codebases exist:

- **Frontend** (`carla-web/`): Vite + React 19 + TypeScript + shadcn/ui v4 + Zustand + Web Workers
- **Backend** (`carla-web-bridge/`): Python FastAPI + WebSocket + CARLA Python API bridge

### What Already Works (DO NOT REWRITE — build on top)

**Frontend — DONE:**
- `src/types/carla.ts` — All CARLA domain types (CarlaActor, VehicleControl, CarlaWeatherParams, SensorType enum, etc.)
- `src/types/api.ts` — All REST API request/response types
- `src/types/ws.ts` — Binary WebSocket protocol types + ChannelId enum
- `src/stores/simulationStore.ts` — Connection status, weather, play/pause/step, map loading
- `src/stores/actorStore.ts` — Actor Map, selection, spawn/destroy, autopilot, classification by type
- `src/stores/sensorStore.ts` — Sensor subscriptions, spawn/destroy
- `src/stores/uiStore.ts` — Panel visibility, tabs, sensor grid layout, theme
- `src/stores/performanceStore.ts` — FPS, latency, bandwidth tracking
- `src/workers/ws-receiver.worker.ts` — WebSocket connection, binary frame parsing, routing to other workers
- `src/workers/image-decoder.worker.ts` — JPEG → ImageBitmap decode
- `src/workers/lidar-processor.worker.ts` — Point cloud downsample + height coloring
- `src/workers/telemetry-aggregator.worker.ts` — Batch actor transforms at 10Hz
- `src/lib/carla-api.ts` — 30+ typed fetch methods for every REST endpoint
- `src/lib/ws-protocol.ts` — Binary frame encoder/decoder for all 14 channels
- `src/lib/sensor-registry.ts` — Sensor type → lazy component + icon + display name mapping
- `src/hooks/useWebSocket.ts` — Creates 4 workers, sets up MessageChannels
- `src/hooks/usePerformanceMonitor.ts` — rAF-based FPS + bandwidth tracking
- `src/hooks/useSensorData.ts` — useCameraSensorData, useLidarSensorData, useImuSensorData, useGnssSensorData
- `src/components/layout/ResizableLayout.tsx` — 4-panel ResizablePanelGroup with localStorage persistence
- `src/components/viewport/MainViewport.tsx` — Pixel Streaming → 5s timeout → camera fallback
- `src/components/sensors/CameraView.tsx` — Canvas-based ImageBitmap rendering via useCameraSensorData
- `src/components/sensors/LidarView.tsx` — React.lazy Three.js point cloud
- `src/components/controls/SimulationControls.tsx` — Play/Pause/Step buttons wired to simulationStore
- `src/components/ui/` — 50+ shadcn components installed and importable

**Backend — DONE:**
- All 8 route modules fully implemented (simulation, world, actors, sensors, traffic, blueprints, navigation, recording)
- WebSocket handler + binary protocol codec
- CARLA client manager with auto-reconnect
- Sensor manager with callback → compress → broadcast pipeline
- WebSocket broadcaster with per-client subscriptions

---

## WHAT IS BROKEN OR MISSING — FIX EVERY SINGLE ONE

---

### TASK 1: Fix ImuChart.tsx — Replace Fake Data with Real Sensor Data

**The problem:** `src/components/sensors/ImuChart.tsx` generates fake sine wave data with `Math.sin()` + `Math.random()` in a `useEffect` + `setInterval`. This is demo garbage, not real sensor data.

**The fix:**

1. Read `src/hooks/useSensorData.ts` and find the `useImuSensorData` hook. It should return `{ accelerometer, gyroscope, compass }` refs updated by the telemetry worker.

2. If `useImuSensorData` doesn't exist or doesn't work, create it:
```typescript
// In useSensorData.ts, add:
export function useImuSensorData(sensorId: number) {
  const accelBufferRef = useRef<{ x: number; y: number; z: number }[]>([])
  const gyroBufferRef = useRef<{ x: number; y: number; z: number }[]>([])
  const compassRef = useRef<number>(0)
  const fpsRef = useRef<number>(0)
  // Listen to messages from ws-receiver worker on the IMU channel
  // On each message: push to buffer (max 200 samples), update compass
  // Return refs, not state (no re-renders)
  return { accelBuffer: accelBufferRef, gyroBuffer: gyroBufferRef, compass: compassRef, fps: fpsRef }
}
```

3. Rewrite `ImuChart.tsx`:
   - Remove ALL `Math.sin`, `Math.random`, fake data generation
   - Call `useImuSensorData(sensorId)` to get real buffers
   - Use a `useRef` + `setInterval(100)` (10Hz) to flush buffer refs into Recharts data state
   - Recharts `<LineChart>` with `<Line>` for X, Y, Z on accelerometer
   - Second `<LineChart>` for gyroscope X, Y, Z
   - Compass displayed as a `NumericReadout` below charts
   - `isAnimationActive={false}` on all Recharts components
   - Use shadcn `Chart` component (`ChartContainer`, `ChartTooltip`, `ChartTooltipContent`)
   - Line colors: X=`hsl(var(--chart-1))`, Y=`hsl(var(--chart-2))`, Z=`hsl(var(--chart-3))`
   - Wrap in shadcn `Card` with `CardHeader` ("IMU — Accelerometer", "IMU — Gyroscope")
   - Sliding window: keep last 200 data points, shift oldest out

4. Verify: when connected to CARLA with an IMU sensor active, the chart should show real acceleration/rotation data, not sine waves.

---

### TASK 2: Fix Keyboard Shortcuts — Wire to Actual Store Actions

**The problem:** `src/hooks/useKeyboardShortcuts.ts` has a `useEffect` with `keydown` listener but the handler body only does `console.log`.

**The fix — rewrite the handler body:**

```typescript
import { useSimulationStore } from '@/stores/simulationStore'
import { useActorStore } from '@/stores/actorStore'
import { useUIStore } from '@/stores/uiStore'

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      const sim = useSimulationStore.getState()
      const ui = useUIStore.getState()
      const actors = useActorStore.getState()

      switch (e.code) {
        case 'Space':
          e.preventDefault()
          sim.isRunning && !sim.isPaused ? sim.pause() : sim.play()
          break
        case 'KeyN':
          e.preventDefault()
          sim.step()
          break
        case 'KeyB':
          e.preventDefault()
          ui.toggleLeftPanel()
          break
        case 'Escape':
          actors.selectActor(null)
          break
        case 'KeyK':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault()
            // Dispatch custom event that CommandPalette listens to
            window.dispatchEvent(new CustomEvent('open-command-palette'))
          }
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
```

In `CommandPalette.tsx`, add a listener:
```typescript
useEffect(() => {
  const handler = () => setOpen(true)
  window.addEventListener('open-command-palette', handler)
  return () => window.removeEventListener('open-command-palette', handler)
}, [])
```

---

### TASK 3: Fix SpawnPanel.tsx — Full Working Spawn Logic

**The problem:** Dialog UI shell exists but form submission doesn't call the API. Blueprint dropdowns are empty.

**What to build — Vehicle tab:**

```typescript
// Inside the Vehicle tab of SpawnPanel:
const [blueprints, setBlueprints] = useState<Blueprint[]>([])
const [selectedBp, setSelectedBp] = useState<string>('')
const [position, setPosition] = useState({ x: 0, y: 0, z: 0 })
const [autopilot, setAutopilot] = useState(true)
const [loading, setLoading] = useState(false)
const { spawnVehicle } = useActorStore()
const api = new CarlaApi(bridgeUrl)  // or import the singleton

// On dialog open, fetch blueprints:
useEffect(() => {
  api.getVehicleBlueprints().then(setBlueprints).catch(err => toast.error(err.message))
}, [])

// Blueprint selector — use shadcn Command (searchable):
<Command>
  <CommandInput placeholder="Search vehicle..." />
  <CommandList>
    <CommandGroup heading="Vehicles">
      {blueprints.map(bp => (
        <CommandItem key={bp.id} onSelect={() => setSelectedBp(bp.id)}>
          <Car className="mr-2 h-4 w-4" />
          {bp.id}
        </CommandItem>
      ))}
    </CommandGroup>
  </CommandList>
</Command>

// Position inputs — three number Inputs in a row:
<div className="grid grid-cols-3 gap-2">
  <div>
    <Label className="text-xs">X</Label>
    <Input type="number" value={position.x} onChange={e => setPosition(p => ({...p, x: parseFloat(e.target.value) || 0}))} className="font-mono" />
  </div>
  // same for Y, Z
</div>

// Or a "Random Spawn Point" button:
<Button variant="outline" onClick={async () => {
  const points = await api.getSpawnPoints()
  const random = points[Math.floor(Math.random() * points.length)]
  setPosition(random.location)
}}>Random Position</Button>

// Autopilot checkbox:
<div className="flex items-center gap-2">
  <Checkbox checked={autopilot} onCheckedChange={setAutopilot} />
  <Label>Enable autopilot</Label>
</div>

// Submit button:
<Button disabled={!selectedBp || loading} onClick={async () => {
  setLoading(true)
  try {
    await spawnVehicle({
      blueprint: selectedBp,
      transform: { location: position, rotation: { pitch: 0, yaw: 0, roll: 0 } },
      autopilot,
    })
    toast.success(`Spawned ${selectedBp}`)
    onClose()  // close dialog
  } catch (err) {
    toast.error(`Spawn failed: ${err.message}`)
  } finally {
    setLoading(false)
  }
}}>
  {loading ? <Spinner className="mr-2 h-4 w-4" /> : null}
  Spawn Vehicle
</Button>
```

**Walker tab:** Same pattern, replace `getVehicleBlueprints` → `getWalkerBlueprints`, `spawnVehicle` → `spawnWalker`, remove autopilot checkbox.

**Sensor tab:**
- Sensor type selector: `Select` grouped by category (Camera, LiDAR, Radar, IMU, GNSS, Event)
- Parent actor selector: `Select` populated from `actorStore.actors` (filter to vehicles + walkers only)
- Dynamic attribute form: when sensor type changes, fetch blueprint attributes from `api.getSensorBlueprints()`, find the matching type, render an `Input` or `Slider` for each attribute (e.g., `image_size_x: 1920`, `fov: 90`, `channels: 64`)
- Transform relative to parent: X/Y/Z/Pitch/Yaw/Roll inputs, default `{ x: 0, y: 0, z: 2.5, pitch: 0, yaw: 0, roll: 0 }` (on top of vehicle)
- Auto-subscribe checkbox (default checked)
- On submit: `sensorStore.spawnSensor({ type, parentId, transform, attributes })`, if auto-subscribe then `sensorStore.subscribe(newSensorId)`

---

### TASK 4: Fix Speed Multiplier

**The problem:** Speed `Select` in SimulationControls shows 0.5x/1x/2x/5x/10x but selecting a value does nothing.

**The fix:**

In `SimulationControls.tsx`, find the speed `Select` `onValueChange` handler and add:

```typescript
const api = new CarlaApi(bridgeUrl)

<Select
  value={String(speed)}
  onValueChange={async (val) => {
    const multiplier = parseFloat(val)
    setSpeed(multiplier)
    try {
      // In sync mode: fixed_delta_seconds controls speed
      // Default is 0.05 (20 FPS). Multiply by 1/speed to go faster.
      await api.setSettings({
        synchronous_mode: true,
        fixed_delta_seconds: 0.05 / multiplier,
      })
    } catch (err) {
      toast.error(`Failed to set speed: ${err.message}`)
    }
  }}
>
```

Also verify the bridge endpoint `POST /api/simulation/settings` in `carla-web-bridge/src/routes/simulation.py` accepts `fixed_delta_seconds` and applies it via `world.apply_settings()`.

---

### TASK 5: Verify + Fix WeatherControls.tsx

Read `src/components/controls/WeatherControls.tsx`. It must have:

**Preset section:**
- A `Select` or `Command` with all 22 presets grouped:
  ```
  Noon: ClearNoon, CloudyNoon, WetNoon, WetCloudyNoon, MidRainyNoon, HardRainNoon, SoftRainNoon
  Sunset: ClearSunset, CloudySunset, WetSunset, WetCloudySunset, MidRainSunset, HardRainSunset, SoftRainSunset
  Night: ClearNight, CloudyNight, WetNight, WetCloudyNight, SoftRainNight, MidRainyNight, HardRainNight
  Special: DustStorm
  ```
- On select: `simulationStore.getState().setWeatherPreset(presetName)`

**Advanced sliders** inside a `Collapsible` (collapsed by default):

For EACH of these 14 parameters, render a labeled `Slider` + monospace value display:

```typescript
const WEATHER_PARAMS = [
  { key: 'sun_altitude_angle', label: 'Sun Altitude', min: -90, max: 90, step: 1, unit: '°' },
  { key: 'sun_azimuth_angle', label: 'Sun Azimuth', min: 0, max: 360, step: 1, unit: '°' },
  { key: 'cloudiness', label: 'Cloudiness', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'precipitation', label: 'Precipitation', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'precipitation_deposits', label: 'Puddles', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'wind_intensity', label: 'Wind', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'fog_density', label: 'Fog Density', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'fog_distance', label: 'Fog Distance', min: 0, max: 500, step: 5, unit: 'm' },
  { key: 'fog_falloff', label: 'Fog Falloff', min: 0, max: 5, step: 0.1, unit: '' },
  { key: 'wetness', label: 'Wetness', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'dust_storm', label: 'Dust Storm', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'scattering_intensity', label: 'Scattering', min: 0, max: 5, step: 0.1, unit: '' },
  { key: 'mie_scattering_scale', label: 'Mie Scattering', min: 0, max: 5, step: 0.1, unit: '' },
  { key: 'rayleigh_scattering_scale', label: 'Rayleigh Scattering', min: 0, max: 5, step: 0.1, unit: '' },
]

// Render each:
{WEATHER_PARAMS.map(param => (
  <div key={param.key} className="flex items-center gap-3">
    <Label className="w-32 text-xs shrink-0">{param.label}</Label>
    <Slider
      min={param.min} max={param.max} step={param.step}
      value={[weather[param.key]]}
      onValueChange={([val]) => debouncedSetWeather({ [param.key]: val })}
      className="flex-1"
    />
    <span className="w-16 text-right font-mono text-xs tabular-nums">
      {weather[param.key]?.toFixed(param.step < 1 ? 1 : 0)}{param.unit}
    </span>
  </div>
))}
```

Debounce: use a 300ms debounce on `setWeather`:
```typescript
const debouncedSetWeather = useMemo(
  () => debounce((params: Partial<CarlaWeatherParams>) => {
    simulationStore.getState().setWeather(params)
  }, 300),
  []
)
```

If any of this is missing, implement it. If it exists but is broken, fix it.

---

### TASK 6: Verify + Fix RadarView.tsx

Read `src/components/sensors/RadarView.tsx`. It must render a 2D polar plot on a `<canvas>`:

```typescript
// Drawing logic (in a useEffect or rAF callback):
const ctx = canvasRef.current.getContext('2d')
const cx = width / 2, cy = height / 2
const maxRange = 100 // meters

// Clear
ctx.fillStyle = '#0a0a0a'
ctx.fillRect(0, 0, width, height)

// Draw concentric range circles
ctx.strokeStyle = '#333'
ctx.lineWidth = 1
for (const range of [10, 20, 50, 100]) {
  const r = (range / maxRange) * Math.min(cx, cy) * 0.9
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()
  // Label
  ctx.fillStyle = '#666'
  ctx.font = '10px monospace'
  ctx.fillText(`${range}m`, cx + r + 2, cy)
}

// Draw azimuth lines (every 30°)
for (let deg = 0; deg < 360; deg += 30) {
  const rad = (deg * Math.PI) / 180
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + Math.sin(rad) * cy * 0.9, cy - Math.cos(rad) * cy * 0.9)
  ctx.strokeStyle = '#222'
  ctx.stroke()
}

// Draw detections
for (const det of detections) {
  const r = (det.depth / maxRange) * Math.min(cx, cy) * 0.9
  const angle = det.azimuth // radians
  const x = cx + Math.sin(angle) * r
  const y = cy - Math.cos(angle) * r

  // Color by velocity
  if (Math.abs(det.velocity) < 0.5) {
    ctx.fillStyle = '#ffffff'  // stationary
  } else if (det.velocity > 0) {
    ctx.fillStyle = `hsl(0, 80%, ${50 + det.velocity * 3}%)`  // receding = red
  } else {
    ctx.fillStyle = `hsl(220, 80%, ${50 + Math.abs(det.velocity) * 3}%)`  // approaching = blue
  }

  ctx.beginPath()
  ctx.arc(x, y, 3, 0, Math.PI * 2)
  ctx.fill()
}

// Overlay text
ctx.fillStyle = '#aaa'
ctx.font = '11px monospace'
ctx.fillText(`Detections: ${detections.length}`, 8, 16)
```

Data source: use a `useRadarSensorData` hook or subscribe to the WebSocket radar channel. If the hook doesn't exist, create one in `useSensorData.ts` that reads Float32Array (velocity, azimuth, altitude, depth) per detection.

Wrap in shadcn `Card` with `CardHeader` "Radar" and detection count badge.

---

### TASK 7: Verify + Fix GnssView.tsx

Must show:
```typescript
<Card>
  <CardHeader><CardTitle className="text-sm">GNSS</CardTitle></CardHeader>
  <CardContent className="space-y-3">
    <div className="grid grid-cols-3 gap-2 text-xs">
      <div>
        <span className="text-muted-foreground">Lat</span>
        <div ref={latRef} className="font-mono tabular-nums text-sm">--</div>
      </div>
      <div>
        <span className="text-muted-foreground">Lon</span>
        <div ref={lonRef} className="font-mono tabular-nums text-sm">--</div>
      </div>
      <div>
        <span className="text-muted-foreground">Alt</span>
        <div ref={altRef} className="font-mono tabular-nums text-sm">--</div>
      </div>
    </div>
    <canvas ref={canvasRef} className="w-full h-40 rounded border border-border" />
  </CardContent>
</Card>
```

Canvas draws: dark background, grid lines every 10 units, green dot at current position, fading trail of last 100 positions (alpha decreasing from 1.0 to 0.0).

Use `useGnssSensorData(sensorId)` from `useSensorData.ts`. Update lat/lon/alt refs via `ref.current.textContent = value.toFixed(6)` (no React state, no re-renders).

---

### TASK 8: Verify + Fix CollisionLog.tsx and LaneInvasionLog.tsx

**CollisionLog.tsx:**
```typescript
interface CollisionEvent {
  timestamp: number
  frame: number
  otherActorId: number
  otherActorType: string
  impulse: { x: number; y: number; z: number }
  magnitude: number // sqrt(x²+y²+z²)
}

// Render:
<Card>
  <CardHeader><CardTitle className="text-sm">Collisions</CardTitle></CardHeader>
  <CardContent className="p-0">
    <ScrollArea className="h-48">
      {events.length === 0 ? (
        <div className="p-4 text-center text-sm text-muted-foreground">No collisions</div>
      ) : (
        events.map((evt, i) => (
          <div key={i} className="flex items-center gap-2 px-3 py-1.5 border-b border-border text-xs">
            <span className="font-mono text-muted-foreground w-20 shrink-0">
              {evt.timestamp.toFixed(1)}s
            </span>
            <Badge variant={evt.magnitude > 1000 ? 'destructive' : evt.magnitude > 100 ? 'default' : 'secondary'} className="text-[10px]">
              {evt.magnitude > 1000 ? 'HEAVY' : evt.magnitude > 100 ? 'MEDIUM' : 'LIGHT'}
            </Badge>
            <span className="truncate">{evt.otherActorType}</span>
            <span className="ml-auto font-mono">{evt.magnitude.toFixed(0)}N</span>
          </div>
        ))
      )}
    </ScrollArea>
  </CardContent>
</Card>
```

Listen to collision events from the WebSocket (channel 0x09). Parse `other_actor_id` + `impulse_xyz`, compute magnitude, push to event array (cap at 500).

**LaneInvasionLog.tsx:** Same structure, different event data. Listen to channel 0x0A. Show crossed marking types as badges.

---

### TASK 9: Verify Camera Sensor Variants

Each of these must exist as a file in `src/components/sensors/`. If any is missing, create it. They are thin wrappers:

```typescript
// src/components/sensors/DepthView.tsx
import CameraView from './CameraView'
export default function DepthView({ sensorId, className }: { sensorId: number; className?: string }) {
  return <CameraView sensorId={sensorId} sensorType="sensor.camera.depth" className={className} />
}
```

Create the same pattern for:
- `DepthView.tsx` — sensorType: `sensor.camera.depth`
- `SegmentationView.tsx` — sensorType: `sensor.camera.semantic_segmentation`
- `InstanceSegView.tsx` — sensorType: `sensor.camera.instance_segmentation`
- `OpticalFlowView.tsx` — sensorType: `sensor.camera.optical_flow`
- `NormalsView.tsx` — sensorType: `sensor.camera.normals`
- `DvsView.tsx` — sensorType: `sensor.camera.dvs`

`CameraView.tsx` should already use `sensorType` to determine the header label. Verify it does. If it hardcodes "RGB Camera", fix it to read the display name from `SENSOR_REGISTRY` in `sensor-registry.ts`.

---

### TASK 10: Verify + Fix SensorPanel.tsx

Read `src/components/sensors/SensorPanel.tsx`. It must:

1. Read `sensorGridLayout` from `uiStore` — a 2D array of sensor IDs: `[['123', ''], ['456', '789']]`
2. Render a CSS grid: `grid-cols-{columns}` where columns = layout[0].length
3. Each cell: if sensor ID present → render the appropriate sensor component from `SENSOR_REGISTRY[type].component`. If empty → show `EmptyState` with plus icon.
4. Clicking empty cell → open a `Command` dialog listing all sensors from `sensorStore.sensors`. On select → update grid layout.
5. Each sensor cell has a header bar with: sensor name, maximize button (`Maximize2` icon), close button (`X` icon).
6. Maximize: temporarily set that sensor to fill the entire panel. Show a "restore" button to go back.
7. Grid size selector: `Select` with options "1×1", "2×1", "2×2", "3×2" — changes the layout array dimensions.

---

### TASK 11: Implement ActorDetails + VehicleDetails + SensorDetails

**These go in `src/components/actors/`.**

**`ActorDetails.tsx`** — dispatched from RightPanel when `actorStore.selectedActorId` is set:

```typescript
const actor = useActorStore(s => s.actors.get(s.selectedActorId!))
if (!actor) return <div className="p-4 text-sm text-muted-foreground">Select an actor</div>

return (
  <div className="p-3 space-y-3 overflow-y-auto h-full">
    {/* Header */}
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="font-mono text-xs">{actor.id}</Badge>
      <span className="text-sm font-medium truncate">{actor.type_id}</span>
    </div>

    {/* Transform */}
    <Accordion type="multiple" defaultValue={['transform', 'controls']}>
      <AccordionItem value="transform">
        <AccordionTrigger className="text-xs">Transform</AccordionTrigger>
        <AccordionContent>
          <div className="grid grid-cols-3 gap-1 text-xs">
            <div><Label className="text-[10px] text-muted-foreground">X</Label><div className="font-mono">{actor.transform.location.x.toFixed(1)}</div></div>
            <div><Label className="text-[10px] text-muted-foreground">Y</Label><div className="font-mono">{actor.transform.location.y.toFixed(1)}</div></div>
            <div><Label className="text-[10px] text-muted-foreground">Z</Label><div className="font-mono">{actor.transform.location.z.toFixed(1)}</div></div>
          </div>
          <div className="grid grid-cols-3 gap-1 text-xs mt-1">
            <div><Label className="text-[10px] text-muted-foreground">Pitch</Label><div className="font-mono">{actor.transform.rotation.pitch.toFixed(1)}°</div></div>
            <div><Label className="text-[10px] text-muted-foreground">Yaw</Label><div className="font-mono">{actor.transform.rotation.yaw.toFixed(1)}°</div></div>
            <div><Label className="text-[10px] text-muted-foreground">Roll</Label><div className="font-mono">{actor.transform.rotation.roll.toFixed(1)}°</div></div>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Velocity */}
      <AccordionItem value="velocity">
        <AccordionTrigger className="text-xs">Velocity</AccordionTrigger>
        <AccordionContent>
          <div className="font-mono text-sm">
            {Math.sqrt(actor.velocity.x**2 + actor.velocity.y**2 + actor.velocity.z**2).toFixed(1)} m/s
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Vehicle-specific or Sensor-specific */}
      {actor.type_id.startsWith('vehicle.') && <VehicleDetails actorId={actor.id} />}
      {actor.type_id.startsWith('sensor.') && <SensorDetails actorId={actor.id} />}
    </Accordion>

    {/* Actions */}
    <div className="flex gap-2 pt-2 border-t">
      <Button variant="outline" size="sm" onClick={() => /* teleport spectator to actor position */}>
        <Navigation className="mr-1 h-3 w-3" /> Teleport
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" size="sm"><Trash2 className="mr-1 h-3 w-3" /> Destroy</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Destroy actor {actor.id}?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the actor from the simulation.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => actorStore.getState().destroyActor(actor.id)}>Destroy</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  </div>
)
```

**`VehicleDetails.tsx`:**
- Autopilot: `<Switch checked={autopilot} onCheckedChange={v => actorStore.getState().setAutopilot(actorId, v)} />`
- Lights: `<ToggleGroup>` with icons for Position, LowBeam, HighBeam, Brake, LeftBlinker, RightBlinker, Fog
- Speed/Gear display as monospace readouts

**`SensorDetails.tsx`:**
- Show sensor type, parent actor ID
- Subscribe/Unsubscribe button: `<Button onClick={() => sensorStore.getState().subscribe(actorId)}>Subscribe</Button>`
- List sensor attributes as readonly `Input` fields

---

### TASK 12: Implement TrafficManagerPanel.tsx

Place in `src/components/actors/TrafficManagerPanel.tsx`. Open via a `Sheet` (side panel) from a button in LeftPanel.

```typescript
<Sheet>
  <SheetTrigger asChild>
    <Button variant="outline" size="sm" className="w-full"><Sliders className="mr-2 h-4 w-4" />Traffic Manager</Button>
  </SheetTrigger>
  <SheetContent side="left" className="w-96">
    <SheetHeader><SheetTitle>Traffic Manager</SheetTitle></SheetHeader>
    <div className="space-y-4 mt-4">
      {/* Global speed */}
      <div>
        <Label>Global Speed Difference</Label>
        <div className="flex items-center gap-2">
          <Slider min={-50} max={50} step={1} value={[globalSpeed]} onValueChange={([v]) => {
            setGlobalSpeed(v)
            api.setGlobalSpeed(v)
          }} />
          <span className="font-mono text-xs w-12 text-right">{globalSpeed}%</span>
        </div>
      </div>

      {/* Per-vehicle table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Vehicle</TableHead>
            <TableHead className="text-xs">Speed %</TableHead>
            <TableHead className="text-xs">Lane</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vehicles.map(v => (
            <TableRow key={v.id}>
              <TableCell className="font-mono text-xs">{v.type_id.split('.').pop()}</TableCell>
              <TableCell>
                <Input type="number" className="h-7 w-16 text-xs font-mono" defaultValue={0}
                  onBlur={e => api.setVehicleSpeed(v.id, parseFloat(e.target.value))} />
              </TableCell>
              <TableCell>
                <Switch defaultChecked onCheckedChange={val => api.setVehicleLane(v.id, val)} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  </SheetContent>
</Sheet>
```

---

### TASK 13: Implement MiniMap.tsx

Place in `src/components/map/MiniMap.tsx`. Add as a tab in BottomPanel.

```typescript
export default function MiniMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const actors = useActorStore(s => s.actors)
  const selectedId = useActorStore(s => s.selectedActorId)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    let animId: number
    const draw = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')!
      const w = canvas.width, h = canvas.height

      ctx.fillStyle = '#111'
      ctx.fillRect(0, 0, w, h)

      // Grid
      ctx.strokeStyle = '#222'
      ctx.lineWidth = 0.5
      const gridSize = 50 * zoom
      for (let x = (offset.x % gridSize); x < w; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
      }
      for (let y = (offset.y % gridSize); y < h; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
      }

      // Actors
      actors.forEach(actor => {
        const sx = w/2 + (actor.transform.location.x * zoom) + offset.x
        const sy = h/2 - (actor.transform.location.y * zoom) + offset.y

        if (sx < -10 || sx > w+10 || sy < -10 || sy > h+10) return

        const isSelected = actor.id === selectedId
        const isVehicle = actor.type_id.startsWith('vehicle.')
        const isWalker = actor.type_id.startsWith('walker.')

        ctx.fillStyle = isSelected ? '#3b82f6' : isVehicle ? '#22c55e' : isWalker ? '#eab308' : '#888'
        ctx.beginPath()
        ctx.arc(sx, sy, isSelected ? 5 : 3, 0, Math.PI * 2)
        ctx.fill()

        if (isSelected) {
          ctx.strokeStyle = '#3b82f6'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(sx, sy, 8, 0, Math.PI * 2)
          ctx.stroke()
        }
      })

      animId = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(animId)
  }, [actors, selectedId, offset, zoom])

  // Pan: mouse drag. Zoom: wheel.
  // onClick: find nearest actor and select it.

  return <canvas ref={canvasRef} className="w-full h-full" width={600} height={300} />
}
```

---

### TASK 14: Implement EventLog.tsx

Place in `src/components/shared/EventLog.tsx`. Render in BottomPanel "Events" tab.

- Maintain a `useRef<Event[]>([])` array (max 500 events)
- Listen to WebSocket channels 0x09 (collision), 0x0A (lane invasion) for sensor events
- Also push custom events: actor spawned/destroyed (from actorStore subscribe), connection status changes, weather changes
- Render with `ScrollArea` and `useVirtualizer` from `@tanstack/react-virtual` if > 50 events
- Filter `ToggleGroup` at the top: All | Collision | Lane | Spawn | Connection
- Each event row: `<div className="flex items-center gap-2 px-3 py-1 text-xs border-b">` with timestamp, type Badge, description
- Auto-scroll switch at top-right

---

### TASK 15: Implement RecordingControls.tsx

Place in `src/components/scenario/RecordingControls.tsx`. Accessible via a `Popover` in TopBar.

- Record button: `<Button variant={isRecording ? 'destructive' : 'outline'} onClick={toggle}>` with `Circle` icon (red fill when recording)
- Filename input before recording starts
- `api.startRecording(filename)` / `api.stopRecording()`
- Recording list: `api.getRecordings()` → render in `ScrollArea`
- Replay section: select recording → `api.startReplay({ filename, start: 0, duration: 0, cameraId: 0 })`
- Replay transport: Play/Pause button, seek `Slider`, speed `Select` (0.5x, 1x, 2x)
- Stop replay button

---

### TASK 16: Implement Settings Page

`src/routes/SettingsPage.tsx`:

```typescript
export default function SettingsPage() {
  const [bridgeUrl, setBridgeUrl] = useState(localStorage.getItem('bridgeUrl') || 'http://localhost:42692')
  const [psUrl, setPsUrl] = useState(localStorage.getItem('pixelStreamingUrl') || 'ws://localhost:42680')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null)

  const save = () => {
    localStorage.setItem('bridgeUrl', bridgeUrl)
    localStorage.setItem('pixelStreamingUrl', psUrl)
    toast.success('Settings saved')
  }

  const testConnection = async () => {
    setTesting(true)
    try {
      const res = await fetch(`${bridgeUrl}/health`)
      setTestResult(res.ok ? 'ok' : 'fail')
    } catch { setTestResult('fail') }
    finally { setTesting(false) }
  }

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-8">
      <h1 className="text-xl font-semibold">Settings</h1>

      <Card>
        <CardHeader><CardTitle className="text-sm">Connection</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Bridge URL</Label>
            <Input value={bridgeUrl} onChange={e => setBridgeUrl(e.target.value)} className="font-mono" />
          </div>
          <div>
            <Label>Pixel Streaming URL</Label>
            <Input value={psUrl} onChange={e => setPsUrl(e.target.value)} className="font-mono" />
          </div>
          <div className="flex gap-2">
            <Button onClick={testConnection} variant="outline" disabled={testing}>
              {testing ? <Spinner className="mr-2 h-4 w-4" /> : null} Test Connection
            </Button>
            {testResult === 'ok' && <Badge className="bg-green-600">Connected</Badge>}
            {testResult === 'fail' && <Badge variant="destructive">Failed</Badge>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Appearance</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <Label>Dark Mode</Label>
            <Switch defaultChecked onCheckedChange={v =>
              document.documentElement.classList.toggle('dark', v)
            } />
          </div>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => {
            localStorage.removeItem('panel-layout')
            toast.success('Layout reset — reload the page')
          }}>Reset Layout</Button>
        </CardContent>
      </Card>

      <Button onClick={save}>Save Settings</Button>
      <Button variant="ghost" asChild><a href="/">← Back to Simulation</a></Button>
    </div>
  )
}
```

---

### TASK 17: Verify + Fix CommandPalette.tsx

Must be a shadcn `CommandDialog` that opens on Cmd+K (wired in Task 2).

Groups: Simulation (play, pause, step), Weather (22 presets), Maps (available maps), Actors (list by ID/type).

Each item executes its action immediately on select and closes the dialog.

---

### TASK 18: Connection Flow

When `SimulationPage` mounts:
1. Read `bridgeUrl` from localStorage (default `http://localhost:42692`)
2. Call `simulationStore.connect(bridgeUrl)`
3. The store's `connect()` method should:
   - Set status to `'connecting'`
   - `fetch(bridgeUrl + '/health')` — if ok, set `'connected'`, fetch initial data
   - If fail, set `'error'`, retry in 5 seconds
   - On connected: `api.getStatus()`, `api.getActors()`, `api.getWeather()`, `api.getMaps()`
   - Initialize WebSocket connection via `useWebSocket` hook
4. TopBar shows: green badge "Connected" / yellow "Connecting..." / red "Disconnected"
5. If bridge is reachable but `carla_connected: false` in health check → show "Bridge OK, waiting for CARLA server..."

---

### TASK 19: Error Toasts

Search every `.catch` and every `try/catch` in all store actions and hooks. Every caught error must show:
```typescript
toast.error(`Operation failed: ${err instanceof Error ? err.message : String(err)}`)
```

Also add toasts for: actor spawned, actor destroyed, map loaded, weather changed, recording started/stopped.

---

### TASK 20: Loading States + Empty States

- `LeftPanel` actor list: show `<Skeleton className="h-8" />` repeated 5 times while `actorStore.actors.size === 0` and `simulationStore.connectionStatus === 'connected'`
- `LeftPanel` when no actors: `<EmptyState>No actors in simulation</EmptyState>`
- `RightPanel` when nothing selected: `<div className="flex items-center justify-center h-full text-sm text-muted-foreground">Select an actor to view details</div>`
- `SensorPanel` empty cell: `<EmptyState icon={Plus}>Click to add sensor</EmptyState>`
- `WeatherControls` preset dropdown: show `<Spinner />` while loading presets
- `SpawnPanel` blueprint list: show `<Spinner />` while loading blueprints

---

### TASK 21: Responsive Behavior

Add to `SimulationPage.tsx`:
```typescript
import { useMediaQuery } from '@/hooks/use-mobile' // from shadcn hooks
const isMobile = useMediaQuery('(max-width: 768px)')
```

If `isMobile`:
- Hide left and right panels by default
- Show a hamburger menu button in TopBar that toggles left panel as a `Sheet`
- BottomPanel fills full width
- Sensor grid forces 1 column

---

### TASK 22-24: Final Build and Verify

```bash
cd carla-web
npm run build        # Must pass with ZERO errors, ZERO warnings
npm run preview      # Open http://localhost:42691, verify app loads
```

Then check every single item in the verification checklist below.

---

## FINAL VERIFICATION CHECKLIST

**You are NOT done until every single box below is checked.**

### Build
- [ ] `npm run build` completes with **zero errors** and **zero warnings**
- [ ] `npm run lint` passes
- [ ] No TypeScript `any` types in new code

### Framework
- [ ] Project uses **Vite + React** (NOT Next.js)
- [ ] No `next/` imports anywhere in the codebase
- [ ] No `'use client'` directives anywhere
- [ ] `vite.config.ts` exists with port 42691 and SharedArrayBuffer headers

### Layout & Navigation
- [ ] App loads at `http://localhost:42691` with dark theme
- [ ] 4 panels visible: left (actors), center (viewport), right (details), bottom (sensors)
- [ ] Panels are resizable via drag handles
- [ ] Panels collapse and expand
- [ ] Panel sizes persist across page reload (localStorage)
- [ ] Keyboard shortcuts work: Space (play/pause), N (step), B (toggle sidebar), Escape (deselect), Cmd+K (command palette)
- [ ] Command palette opens, searches actors and actions, executes on select
- [ ] Status bar shows latency, bandwidth, FPS, tick rate
- [ ] `/settings` route loads the settings page
- [ ] Back button on settings page returns to simulation

### Connection
- [ ] TopBar shows connection status badge (green/yellow/red)
- [ ] App shows "Connecting..." when bridge is unreachable
- [ ] App shows "Bridge OK, waiting for CARLA..." when bridge is up but CARLA isn't
- [ ] Auto-reconnect works for WebSocket
- [ ] Initial data (actors, weather, maps) fetched automatically on connect

### Simulation Controls
- [ ] Play button starts simulation
- [ ] Pause button pauses simulation
- [ ] Step button advances one tick
- [ ] Speed selector (0.5x-10x) changes actual simulation tick rate via API
- [ ] Sync mode toggle works

### Weather
- [ ] Weather preset dropdown has all 22 presets grouped by time of day
- [ ] Selecting a preset calls API and updates simulation
- [ ] All 14 advanced parameter sliders work in Collapsible section
- [ ] Sliders debounce API calls (300ms)
- [ ] Current values shown as monospace numbers next to each slider

### Actor Management
- [ ] Actor list shows vehicles, walkers, sensors grouped by type with count badges
- [ ] Clicking actor selects it → details show in right panel
- [ ] Right-click actor → context menu with destroy and teleport options
- [ ] Spawn vehicle: blueprint Command search works, position input works, spawn button calls API, toast on success
- [ ] Spawn walker: same
- [ ] Spawn sensor: type selector, parent selector, dynamic attribute form, spawn works
- [ ] Destroy actor shows AlertDialog confirmation, then calls API

### Actor Details (Right Panel)
- [ ] Shows "Select an actor" when nothing selected
- [ ] Selected vehicle shows: transform (X/Y/Z/P/Y/R), velocity, speed, autopilot Switch, lights ToggleGroup
- [ ] Selected sensor shows: type, parent, attributes, subscribe/unsubscribe button
- [ ] "Teleport Spectator" button exists
- [ ] Destroy button with AlertDialog confirmation

### Traffic Manager
- [ ] TrafficManager Sheet opens from LeftPanel button
- [ ] Global speed slider calls API
- [ ] Per-vehicle speed inputs in table

### Sensors (ALL 16 types)
- [ ] RGB Camera renders live frames on canvas
- [ ] Depth Camera renders (colormap applied server-side)
- [ ] Semantic Segmentation renders with class colors
- [ ] Instance Segmentation renders
- [ ] Optical Flow renders
- [ ] Surface Normals renders
- [ ] DVS renders with event count
- [ ] LiDAR renders 3D point cloud in Three.js with orbit controls
- [ ] Semantic LiDAR renders with class colors
- [ ] Radar renders 2D polar plot with velocity coloring (blue=approaching, red=receding)
- [ ] IMU charts show REAL accelerometer + gyroscope data (NOT fake sine waves)
- [ ] GNSS shows lat/lon/alt with position trail canvas
- [ ] Collision events show in scrollable log with severity badges
- [ ] Lane invasion events show in scrollable log

### Sensor Panel
- [ ] Grid layout configurable (1×1, 2×1, 2×2, 3×2) via Select
- [ ] Click empty cell → Command dialog to pick sensor
- [ ] Maximize button fills the sensor panel with one sensor
- [ ] Close button removes sensor from grid
- [ ] Empty cells show "Click to add sensor" EmptyState

### Viewport
- [ ] Main viewport attempts Pixel Streaming, falls back to camera after 5s timeout
- [ ] HUD overlay shows FPS and coordinates when data available
- [ ] "Connecting..." skeleton with Spinner shows while waiting

### Map
- [ ] Map selector Command in controls shows available maps
- [ ] Loading a map shows progress/loading indicator
- [ ] MiniMap tab in BottomPanel shows actor positions (2D canvas, colored dots)
- [ ] Click on MiniMap dot selects actor

### Recording
- [ ] Record button in Popover starts recording (turns red)
- [ ] Stop recording works
- [ ] Recording list fetched and displayed
- [ ] Replay transport: play, seek slider, speed selector

### Event Log
- [ ] Events tab in BottomPanel shows collision, lane invasion, connection events
- [ ] Filter by event type via ToggleGroup
- [ ] Auto-scroll toggle works
- [ ] Empty state when no events

### Settings Page
- [ ] Bridge URL and Pixel Streaming URL inputs
- [ ] Test Connection button shows green/red result
- [ ] Settings persist to localStorage
- [ ] Dark/light mode toggle works
- [ ] Reset Layout button clears saved panel sizes

### Error Handling
- [ ] Failed API calls show Sonner error toasts
- [ ] WebSocket disconnect shows reconnecting indicator in TopBar
- [ ] Empty states shown when no data (actors, sensors, events)
- [ ] Loading skeletons shown while fetching data

### Performance
- [ ] Camera feeds render at 20+ FPS without main thread blocking
- [ ] LiDAR renders 200K points without frame drops
- [ ] No React re-renders from sensor frame data (canvas uses refs, not state)
- [ ] Three.js is lazy-loaded (separate chunk, not in initial bundle)
- [ ] Recharts is lazy-loaded (separate chunk)
- [ ] Initial JS bundle < 300KB gzipped

---

## REMEMBER

- **DO NOT STOP** until every checkbox above is verified.
- **DO NOT ASK** the user for confirmation — make decisions and keep building.
- **DO NOT REWRITE** working code — only fix what's broken or missing.
- **DO NOT ADD** unnecessary features beyond this checklist.
- If `npm run build` breaks at any point, fix it immediately before continuing.
- Work through tasks 1-21 sequentially, then tasks 22-24.
- After completing all tasks, run `npm run build` one final time and walk through every checkbox.
- Only then may you report completion to the user.
