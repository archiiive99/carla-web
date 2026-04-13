# Prompt 05 — Sensor Rendering Components

## Context

The data pipeline is built (Prompt 04): WebSocket client, Web Workers, Zustand stores. Now build the visual rendering components for every CARLA sensor type.

Read before starting:
- `Docs/agents/carla_web_implementation_prompt.md` — Sensor implementation checklist, CameraView/LidarView/RadarView details
- `Docs/agents/shadcn_component_mapping.md` — Section 3.4 (Bottom Panel), Section 7 (Custom Components)

Reference shadcn components: `ui/apps/v4/registry/new-york-v4/ui/card.tsx`, `ui/apps/v4/registry/new-york-v4/ui/chart.tsx`, `ui/apps/v4/registry/new-york-v4/ui/tabs.tsx`.

---

## Task

Build every sensor rendering component and the multi-sensor panel layout.

### 1. Sensor Panel Container (`src/components/sensors/SensorPanel.tsx`)

- Grid layout for multiple sensor views simultaneously
- Configurable grid: 1x1, 2x1, 2x2, 3x2, 3x3 (user selectable)
- Each grid cell can display any sensor type
- Grid cell selection: click empty cell → sensor picker `Command` (searchable list of available sensors)
- Grid cell actions: maximize (fill entire panel), detach (open in new window), remove
- Use shadcn `Card` for each cell container
- Empty cell: show shadcn `EmptyState` with "Click to add sensor" and a plus icon

### 2. Camera Sensors

**`src/components/sensors/CameraView.tsx`:**
Common base for all camera-type sensors (RGB, Depth, Segmentation, Instance Seg, Optical Flow, Normals, DVS).

```typescript
interface CameraViewProps {
  sensorId: number
  sensorType: SensorType  // determines header label and color coding
  className?: string
}
```

Implementation:
- Wrap in shadcn `Card` with `CardHeader` (sensor name, resolution badge, FPS badge) and `CardContent` (canvas)
- Use `<canvas>` element that fills the card content area
- Receive `ImageBitmap` from image-decoder worker via `useSensorData` hook
- Draw `ImageBitmap` to canvas via `canvas.getContext('2d').drawImage(bitmap, 0, 0)`
- **CRITICAL:** Use `requestAnimationFrame` to gate drawing — never draw faster than display refresh
- Show corner overlay: resolution (e.g., "1920x1080"), FPS counter, frame number
- Click to maximize (fill the entire bottom panel)
- Right-click context menu (`ContextMenu`): "Detach to window", "Save frame as PNG", "Copy to clipboard"
- On unmount: unsubscribe from sensor, release canvas resources

**Performance requirements:**
- Canvas draw: <1ms per frame
- No React re-renders on new frames (use refs for canvas and overlay text)
- Frame drop: if new bitmap arrives before previous draw completes, skip the previous one

**Sensor-specific variants (thin wrappers around CameraView):**

`src/components/sensors/DepthView.tsx` — Same as CameraView, label says "Depth Camera", colormap applied server-side.

`src/components/sensors/SegmentationView.tsx` — Same as CameraView, label says "Semantic Segmentation". Add a legend overlay showing class colors (toggle with button).

`src/components/sensors/InstanceSegView.tsx` — Label: "Instance Segmentation".

`src/components/sensors/OpticalFlowView.tsx` — Label: "Optical Flow".

`src/components/sensors/NormalsView.tsx` — Label: "Surface Normals".

`src/components/sensors/DvsView.tsx` — Label: "DVS Events". Show event count per second in overlay.

### 3. LiDAR Point Cloud (`src/components/sensors/LidarView.tsx`)

Full 3D point cloud renderer using Three.js:

```typescript
interface LidarViewProps {
  sensorId: number
  className?: string
}
```

Implementation:
- Wrap in shadcn `Card` container
- Use `@react-three/fiber` `<Canvas>` with `@react-three/drei` `OrbitControls`
- **Dynamically import** Three.js and R3F (`React.lazy` + `Suspense`, NOT next/dynamic)
- Receive `Float32Array` positions and colors from lidar-processor worker
- Use `BufferGeometry` with `Float32BufferAttribute` for position and color
- Use `Points` with `PointsMaterial` (size: 0.05, vertexColors: true) or custom `ShaderMaterial` for better performance:
  ```glsl
  // Vertex shader: pass color to fragment, set gl_PointSize based on distance
  // Fragment shader: discard if outside circle (round points), apply color
  ```
- Update geometry attributes on new data: `geometry.attributes.position.needsUpdate = true`
- **NEVER create new BufferGeometry per frame** — reuse and update attributes
- Object pool: pre-allocate position and color arrays at max point budget (200K)
- Orbit controls: left click rotate, right click pan, scroll zoom
- Grid helper on ground plane (optional toggle)
- Axis helper in corner
- Overlay: point count, scan rate (Hz), current point size
- Controls: point size slider (`Slider`), color mode selector (`Select`: height/intensity/semantic)
- Background: transparent or very dark (`#0a0a0a`)

**Performance targets:**
- 200K points at 10 FPS render update
- GPU draw call: single call (`Points` renders all in one draw)
- No Three.js object allocation per frame

### 4. Semantic LiDAR (`src/components/sensors/SemanticLidarView.tsx`)

- Extends LidarView
- Color by semantic tag (use CARLA's CityScapes palette)
- Add legend panel showing tag → color mapping
- Toggle between semantic coloring and intensity coloring

### 5. Radar Plot (`src/components/sensors/RadarView.tsx`)

2D polar plot of radar detections:
- Wrap in shadcn `Card`
- Use `<canvas>` with Canvas 2D context
- Draw polar grid: concentric circles for depth (10m, 20m, 50m, 100m), radial lines for azimuth
- Each detection: colored dot at (azimuth, depth) position
- Color by velocity: blue gradient = approaching, red gradient = receding, white = stationary
- Velocity threshold: |v| < 0.5 m/s = stationary
- On hover detection: show tooltip with exact velocity, azimuth, altitude, depth
- Overlay: detection count, update rate
- Auto-scale depth axis to fit max detection range

### 6. IMU Charts (`src/components/sensors/ImuChart.tsx`)

Real-time line charts for accelerometer and gyroscope:
- Wrap in shadcn `Card`
- Use shadcn `Chart` component (wraps Recharts) — reference `ui/apps/v4/registry/new-york-v4/ui/chart.tsx`
- Two chart areas: Accelerometer (X, Y, Z) and Gyroscope (X, Y, Z)
- Sliding window: last 200 samples
- Use `ChartContainer` with `ChartTooltip` and `ChartTooltipContent`
- Line colors: X = `--chart-1`, Y = `--chart-2`, Z = `--chart-3`
- **Performance:** Buffer samples in a ref, flush to chart data at 10Hz (not every sample)
- Disable Recharts animation: `isAnimationActive={false}`
- Show current values as `NumericReadout` below chart (monospace, updated via ref)
- Include compass heading display (from IMU compass value)

### 7. GNSS Display (`src/components/sensors/GnssView.tsx`)

GPS position display:
- Wrap in shadcn `Card`
- Show latitude, longitude, altitude as monospace numeric readouts
- Simple canvas-based position dot on a local coordinate grid (not a full map library — too heavy)
- Trail of last 100 positions as a fading line
- Optional: if Leaflet is later added, show on a real map tile

### 8. Event Sensors

**`src/components/sensors/CollisionLog.tsx`:**
- Scrollable event list using shadcn `ScrollArea`
- Each event: timestamp, other actor name/type, impulse magnitude
- Color code by severity: green (light), yellow (medium), red (heavy)
- Use `Badge` for severity indicator
- Virtualized if >50 events (use `@tanstack/react-virtual`)

**`src/components/sensors/LaneInvasionLog.tsx`:**
- Similar scrollable list
- Each event: timestamp, crossed marking types
- Badge for marking type (solid, broken, etc.)

### 9. Numeric Readout Component (`src/components/shared/NumericReadout.tsx`)

High-performance numeric display that updates via `useRef` (no React re-renders):

```typescript
interface NumericReadoutProps {
  label: string
  unit?: string
  precision?: number      // decimal places
  className?: string
}

// Returns a ref setter: (value: number) => void
// Internally uses useRef + direct DOM textContent mutation
// Styled with font-mono, tabular-nums for stable digit width
```

### 10. Sensor Type Registry (`src/lib/sensor-registry.ts`)

Map sensor type strings to components, icons, and display names:

```typescript
const SENSOR_REGISTRY: Record<SensorType, {
  component: React.LazyExoticComponent<any>
  displayName: string
  icon: LucideIcon
  category: 'camera' | 'lidar' | 'radar' | 'imu' | 'gnss' | 'event'
}> = {
  'sensor.camera.rgb': {
    component: lazy(() => import('@/components/sensors/CameraView')),
    displayName: 'RGB Camera',
    icon: Camera,
    category: 'camera',
  },
  // ... all 19 sensor types
}
```

### 11. Quality Checklist

- [ ] All 7 camera sensor types render correctly (RGB, Depth, Segmentation, Instance, OpticalFlow, Normals, DVS)
- [ ] LiDAR point cloud renders 200K points at 10+ FPS
- [ ] LiDAR does NOT allocate new GPU objects per frame
- [ ] Radar polar plot displays detections with velocity coloring
- [ ] IMU charts show real-time accelerometer and gyroscope data
- [ ] GNSS displays coordinates with position trail
- [ ] Collision and lane invasion events display in scrollable logs
- [ ] Multi-sensor grid supports 1x1 through 3x3 layouts
- [ ] Sensor picker works (search, select, add to grid)
- [ ] Sensor views can be maximized and detached
- [ ] No main thread blocking from sensor data processing
- [ ] Three.js is lazy-loaded (not in initial bundle)
- [ ] `npm run build` passes
