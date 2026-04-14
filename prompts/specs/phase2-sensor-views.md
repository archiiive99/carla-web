# Phase 2: Sensor Views — Complete Visualization for All CARLA Sensors

## Overview

CARLA supports 14 sensor types. Each sensor type needs a dedicated visualization component that:
1. Receives real-time data via WebSocket binary protocol
2. Renders the data visually (canvas, Three.js, charts, tables)
3. Wraps in shadcn `Card` with metadata badges
4. Handles empty/loading/error states gracefully
5. Can be placed in the SensorPanel grid

**Estimated scope**: 14 sensor components to verify and fix, ~5-8 to substantially modify or rewrite.

---

## Prerequisite: Phase 0 Must Be Complete

The RGB camera feed MUST be working before starting this phase. Run the Phase 0 Playwright test:
```bash
cd /data1/song99/carla/carla-web && npx playwright test e2e/camera-feed.spec.ts
```

If this fails, go back to Phase 0 and fix it first.

---

## Data Flow Recap

```
CARLA sensor callback (Python, CARLA thread)
  → sensor_manager._process_sensor_data() — encodes to binary
  → ws_broadcaster.broadcast_raw() — sends over WebSocket
  → ws-receiver.worker.ts — parses frame, routes by channel
  → For cameras: image-decoder.worker.ts → createImageBitmap → main thread
  → For LiDAR: lidar-processor.worker.ts → Float32Array → main thread
  → For IMU/GNSS/Radar/Collision/Lane: direct to main thread via postMessage
  → useSensorData hooks — store in refs
  → Sensor view components — read refs, render
```

## Existing Data Hooks

All defined in `src/hooks/useSensorData.ts`:

| Hook | Returns | Used By |
|------|---------|---------|
| `useCameraSensorData(sensorId)` | `bitmapRef: Ref<ImageBitmap\|null>`, `fpsRef: Ref<number>` | CameraView, DepthView, SegmentationView |
| `useLidarSensorData(sensorId)` | `positionsRef: Ref<Float32Array>`, `colorsRef: Ref<Float32Array>`, `pointCountRef: Ref<number>` | LidarScene |
| `useImuSensorData(sensorId)` | `accelRef`, `gyroRef`, `compassRef`, `bufferRef` | ImuChart |
| `useGnssSensorData(sensorId)` | `latRef`, `lonRef`, `altRef`, `trailRef` | GnssView |
| `useRadarSensorData(sensorId)` | `detectionsRef` | RadarView |
| `useLaneInvasionData(sensorId)` | `eventsRef` | LaneInvasionLog |
| `useCollisionData(sensorId)` | `eventsRef` | CollisionLog |

---

## Sensor Component Checklist

For EACH sensor component, verify:

- [ ] Component renders without crashing when sensorId is valid
- [ ] Component shows appropriate empty state when no data (Skeleton or "No data" message, NOT a crash)
- [ ] Component updates in real-time when data flows (verified via Playwright screenshots 2s apart)
- [ ] Wrapped in shadcn `Card` with `CardHeader` + `CardTitle` + `CardContent`
- [ ] Shows metadata: `Badge` with sensor type, resolution/count, FPS
- [ ] Has `ContextMenu` for actions (save PNG, copy clipboard, etc.) where applicable
- [ ] Has fullscreen toggle `Button`
- [ ] No TypeScript `any` types
- [ ] No `console.log` statements

---

## Sensor 1: RGB Camera (`CameraView.tsx`) — Channel 0x01

**File**: `src/components/sensors/CameraView.tsx`
**Hook**: `useCameraSensorData(sensorId)`
**Rendering**: HTML5 Canvas 2D — `ctx.drawImage(bitmap, 0, 0)`

**Must verify:**
- Canvas exists and receives ImageBitmap frames
- `bitmap.close()` is called after each draw (memory leak prevention)
- `requestAnimationFrame` loop is running
- FPS badge shows actual frame rate
- Resolution badge shows width x height
- "Waiting for..." text disappears once frames arrive
- Right-click context menu: Save PNG, Save JPEG, Copy to Clipboard

**Playwright test:**
```typescript
test("RGB camera renders live frames", async ({ page }) => {
  await page.goto("http://127.0.0.1:58336")
  await page.waitForTimeout(8000)
  
  // Check canvas has non-black pixels
  const canvas = page.locator("canvas").first()
  const pixel = await canvas.evaluate((el: HTMLCanvasElement) => {
    const ctx = el.getContext("2d")
    if (!ctx) return [0, 0, 0]
    const d = ctx.getImageData(el.width / 2, el.height / 2, 1, 1).data
    return [d[0], d[1], d[2]]
  })
  expect(pixel[0] + pixel[1] + pixel[2]).toBeGreaterThan(5)
})
```

## Sensor 2: Depth Camera (`DepthView.tsx`) — Channel 0x02

**File**: `src/components/sensors/DepthView.tsx`
**Hook**: `useCameraSensorData(sensorId)` (same as RGB — bridge sends colorized JPEG)
**Rendering**: Same as CameraView — the bridge applies depth colormap before JPEG encoding

**What the bridge does**: `compression/image.py` → `apply_depth_colormap()`:
- Extracts CARLA depth from BGRA: `R + G*256 + B*65536`
- Applies logarithmic scale for near-range visibility
- Generates blue-to-red gradient colormap
- JPEG encodes the result

**Must verify:**
- Renders a colorful depth map (blue=near, red=far), not grayscale, not all-black
- Different from RGB camera — should show depth colormap colors

**To test**: Spawn a depth camera via bridge API:
```bash
# Get vehicle ID
VEHICLE_ID=$(curl -s http://127.0.0.1:58337/api/realtime/session | python3 -c "import sys,json; print(json.load(sys.stdin)['default_vehicle_id'])")

# Spawn depth camera
curl -X POST http://127.0.0.1:58337/api/actors/spawn/sensor \
  -H 'Content-Type: application/json' \
  -d "{\"type\":\"sensor.camera.depth\",\"transform\":{\"location\":{\"x\":0,\"y\":0,\"z\":2.5}},\"parent_id\":$VEHICLE_ID,\"attributes\":{\"image_size_x\":\"640\",\"image_size_y\":\"480\"}}"
```

## Sensor 3: Semantic Segmentation (`SegmentationView.tsx`) — Channel 0x03

**File**: `src/components/sensors/SegmentationView.tsx`
**Hook**: `useCameraSensorData(sensorId)` (bridge applies CityScapes palette)

**Must show**: CityScapes class legend overlay with 23 classes:

```
Class 0:  Unlabeled      [0,0,0]         Class 12: Pedestrians  [220,20,60]
Class 1:  Roads           [128,64,128]    Class 13: Rider        [255,0,0]
Class 2:  Sidewalks       [244,35,232]    Class 14: Car          [0,0,142]
Class 3:  Buildings        [70,70,70]     Class 15: Truck        [0,0,70]
Class 4:  Walls            [102,102,156]  Class 16: Bus          [0,60,100]
Class 5:  Fences           [190,153,153]  Class 17: Train        [0,80,100]
Class 6:  Poles            [153,153,153]  Class 18: Motorcycle   [0,0,230]
Class 7:  Traffic lights   [250,170,30]   Class 19: Bicycle      [119,11,32]
Class 8:  Traffic signs    [220,220,0]    Class 20: Static       [110,190,160]
Class 9:  Vegetation       [107,142,35]   Class 21: Dynamic      [170,120,50]
Class 10: Terrain          [152,251,152]  Class 22: Other        [55,90,80]
Class 11: Sky              [70,130,180]
```

The legend should be a semi-transparent overlay at the bottom of the canvas card:
```tsx
<div className="absolute bottom-2 left-2 bg-background/80 backdrop-blur rounded-md p-2 text-[10px] max-h-32 overflow-auto">
  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
    {CITYSCAPES_CLASSES.map(c => (
      <div key={c.id} className="flex items-center gap-1">
        <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: c.color }} />
        <span className="text-muted-foreground truncate">{c.name}</span>
      </div>
    ))}
  </div>
</div>
```

## Sensor 4-5: LiDAR (`LidarScene.tsx`) — Channel 0x04, 0x05

**File**: `src/components/sensors/LidarScene.tsx`
**Hook**: `useLidarSensorData(sensorId)`
**Rendering**: React Three Fiber — `Points` geometry with `BufferGeometry`

**Must verify:**
- Point cloud renders (not blank black canvas)
- Points are colored (height-based: blue→green→red)
- OrbitControls work (mouse drag to rotate, scroll to zoom)
- GizmoHelper visible in corner
- Point count badge shows actual number

**Coordinate system**: CARLA Z-up → Three.js Y-up. The lidar-processor.worker already swaps Y/Z.

**Data format**:
- Standard LiDAR (0x04): 4 floats/point (x, y, z, intensity) = 16 bytes/point
- Semantic LiDAR (0x05): 6 floats/point (x, y, z, cos_angle, obj_index, semantic_tag) = 24 bytes/point

## Sensor 6: Radar (`RadarView.tsx`) — Channel 0x06

**File**: `src/components/sensors/RadarView.tsx`
**Hook**: `useRadarSensorData(sensorId)`

**Data format**: Each detection is 16 bytes (4 float32s):
- velocity (m/s)
- azimuth (radians)
- altitude (radians)  
- depth (meters)

**Visualization**: Top-down polar plot (canvas 2D):
- Center = sensor position
- Concentric range rings at 10m, 25m, 50m, 100m intervals
- Each detection drawn as a colored dot at (azimuth, depth) in polar coordinates
- Color encodes velocity: blue (approaching) → white (stationary) → red (receding)
- Detection count shown in Badge

## Sensor 7: IMU (`ImuChart.tsx`) — Channel 0x07

**File**: `src/components/sensors/ImuChart.tsx`
**Hook**: `useImuSensorData(sensorId)`

**Data**: accelerometer (x,y,z), gyroscope (x,y,z), compass (float)

**Visualization options** (use shadcn Chart or Recharts):
- Accelerometer: 3-axis line chart (X=red, Y=green, Z=blue), rolling window of last 100 samples
- Gyroscope: 3-axis line chart, same style
- Compass: circular dial or numeric display
- Current numeric values in `font-mono text-xs`
- Use shadcn `Tabs` to switch between Accelerometer / Gyroscope / Compass views

## Sensor 8: GNSS (`GnssView.tsx`) — Channel 0x08

**File**: `src/components/sensors/GnssView.tsx`
**Hook**: `useGnssSensorData(sensorId)`

**Data**: latitude, longitude, altitude (float64)

**Visualization**:
- Large numeric display: lat/lon/alt in `font-mono` with appropriate precision (6 decimal places)
- Trail visualization: canvas showing the path of recent positions (last 200 points)
- Altitude mini-chart: sparkline of recent altitude values

## Sensor 9-10: Collision & Lane Invasion (`CollisionLog.tsx`, `LaneInvasionLog.tsx`) — Channels 0x09, 0x0A

**Files**: `sensors/CollisionLog.tsx`, `sensors/LaneInvasionLog.tsx`
**Hooks**: `useCollisionData(sensorId)`, `useLaneInvasionData(sensorId)`

**Visualization**: Event log tables using shadcn `Table` + `ScrollArea`:

Collision table columns:
| Time | Other Actor | Impulse X | Impulse Y | Impulse Z | Magnitude |

Lane Invasion table columns:
| Time | Marking Types |

- New events appear at the top (reverse chronological)
- Auto-scroll to latest event
- Event count in Badge
- Clear button to reset the log

## Sensor 11-13: Optical Flow, Normals, DVS

These use camera channel (0x01 for optical flow/normals) or DVS channel (0x0B). They render as images similar to CameraView.

Lower priority — implement after the core sensors (1-10) are working.

---

## How to Spawn Test Sensors

To test each sensor type, spawn them via the bridge API:

```bash
# Get the vehicle ID
VEHICLE_ID=$(curl -s http://127.0.0.1:58337/api/realtime/session | python3 -c "import sys,json; print(json.load(sys.stdin)['default_vehicle_id'])")

# Depth camera
curl -X POST http://127.0.0.1:58337/api/actors/spawn/sensor -H 'Content-Type: application/json' \
  -d "{\"type\":\"sensor.camera.depth\",\"transform\":{\"location\":{\"x\":0,\"y\":0,\"z\":2.5}},\"parent_id\":$VEHICLE_ID,\"attributes\":{\"image_size_x\":\"640\",\"image_size_y\":\"480\",\"sensor_tick\":\"0.1\"}}"

# Semantic segmentation camera
curl -X POST http://127.0.0.1:58337/api/actors/spawn/sensor -H 'Content-Type: application/json' \
  -d "{\"type\":\"sensor.camera.semantic_segmentation\",\"transform\":{\"location\":{\"x\":0,\"y\":0,\"z\":2.5}},\"parent_id\":$VEHICLE_ID,\"attributes\":{\"image_size_x\":\"640\",\"image_size_y\":\"480\",\"sensor_tick\":\"0.1\"}}"

# LiDAR
curl -X POST http://127.0.0.1:58337/api/actors/spawn/sensor -H 'Content-Type: application/json' \
  -d "{\"type\":\"sensor.lidar.ray_cast\",\"transform\":{\"location\":{\"x\":0,\"y\":0,\"z\":2.5}},\"parent_id\":$VEHICLE_ID,\"attributes\":{\"range\":\"100\",\"channels\":\"32\",\"points_per_second\":\"100000\",\"rotation_frequency\":\"20\",\"sensor_tick\":\"0.1\"}}"

# Radar
curl -X POST http://127.0.0.1:58337/api/actors/spawn/sensor -H 'Content-Type: application/json' \
  -d "{\"type\":\"sensor.other.radar\",\"transform\":{\"location\":{\"x\":2,\"y\":0,\"z\":1}},\"parent_id\":$VEHICLE_ID,\"attributes\":{\"sensor_tick\":\"0.1\"}}"

# IMU
curl -X POST http://127.0.0.1:58337/api/actors/spawn/sensor -H 'Content-Type: application/json' \
  -d "{\"type\":\"sensor.other.imu\",\"transform\":{\"location\":{\"x\":0,\"y\":0,\"z\":0}},\"parent_id\":$VEHICLE_ID,\"attributes\":{\"sensor_tick\":\"0.05\"}}"

# GNSS
curl -X POST http://127.0.0.1:58337/api/actors/spawn/sensor -H 'Content-Type: application/json' \
  -d "{\"type\":\"sensor.other.gnss\",\"transform\":{\"location\":{\"x\":0,\"y\":0,\"z\":0}},\"parent_id\":$VEHICLE_ID,\"attributes\":{\"sensor_tick\":\"0.1\"}}"

# Collision detector
curl -X POST http://127.0.0.1:58337/api/actors/spawn/sensor -H 'Content-Type: application/json' \
  -d "{\"type\":\"sensor.other.collision\",\"transform\":{\"location\":{\"x\":0,\"y\":0,\"z\":0}},\"parent_id\":$VEHICLE_ID,\"attributes\":{}}"

# Lane invasion detector
curl -X POST http://127.0.0.1:58337/api/actors/spawn/sensor -H 'Content-Type: application/json' \
  -d "{\"type\":\"sensor.other.lane_invasion\",\"transform\":{\"location\":{\"x\":0,\"y\":0,\"z\":0}},\"parent_id\":$VEHICLE_ID,\"attributes\":{}}"
```

After spawning, the response gives you the sensor ID. Subscribe in the frontend's SensorPanel.

---

## Playwright Verification for Each Sensor

After implementing/fixing each sensor view:

```bash
# Take screenshot of the sensor panel area
cd /data1/song99/carla/carla-web
npx playwright screenshot http://127.0.0.1:58336 /tmp/carla-sensors.png
```

**Verify visually:**
- Each sensor cell in the grid shows actual data, not a blank/loading state
- Camera feeds show colorful images from CARLA (road, buildings, sky visible)
- LiDAR shows a 3D point cloud (not empty black)
- Charts show moving data lines (not flat)
- Event logs show entries (drive into something to trigger collision)

---

## Acceptance Criteria

1. RGB camera feed shows live updating frames (Phase 0 test passes)
2. At least 8 of 14 sensor types render real data in the SensorPanel
3. Each sensor component wraps in shadcn Card with metadata badges
4. No "Waiting for..." text visible for any active sensor
5. No browser console errors from sensor components
6. Each sensor handles disconnect gracefully (shows "Disconnected" state, doesn't crash)
7. **All verified with Playwright screenshots — not just code inspection**
