# Browser-Native 3D Rendering — Eliminate JPEG Streaming

## Problem

The current pipeline streams JPEG-compressed camera frames from CARLA UE5:
```
UE5 renders scene → BGRA pixels → JPEG encode (Q80) → WebSocket → Browser decode → Canvas
```

This introduces:
- **JPEG block artifacts** (8x8 DCT blocks visible, color banding in gradients)
- **Low resolution** (320x240 or 1280x720 max, limited by encoding speed)
- **High latency** (~100-150ms round trip)
- **High bandwidth** (~1MB/s per camera at 720p 20FPS)
- **Dark/washed-out colors** (JPEG quantization crushes dark areas)
- **No interactivity** — the "image" is frozen until next frame arrives

## Solution

**Render the CARLA world directly in the browser using Three.js.** CARLA only provides simulation data (actor positions, map geometry). The browser does ALL rendering.

```
CARLA server (physics/AI only, NO rendering)
  → Bridge sends: actor transforms (20Hz, ~2KB/tick), map data (once)
  → Browser Three.js renders everything: roads, vehicles, pedestrians, sky, lighting
  → Camera views use Three.js cameras with CARLA sensor intrinsic/extrinsic parameters
  → Zero JPEG, zero artifacts, zero compression latency
```

### Benefits
- **Zero artifacts** — Three.js renders at native display resolution
- **Zero compression latency** — no encode/decode pipeline
- **Zero bandwidth for visuals** — only ~2KB/tick for actor transforms
- **Interactive cameras** — move/rotate camera views in real-time without server round-trip
- **Multiple camera views** — render unlimited cameras at zero server cost
- **Consistent lighting** — browser controls all lighting, no UE5 exposure issues

### Tradeoff
- Visual fidelity is lower than UE5 (no ray tracing, simpler materials)
- But for a web dashboard, clean/fast/interactive beats photorealistic/slow/artifacted

---

## Architecture

### Data Flow (new)
```
CARLA Server (headless, -nullrhi or -RenderOffScreen)
  │
  │ Python API: actor transforms, map topology, weather state
  ▼
carla-web-bridge
  │ WebSocket binary: WorldTick (0x10) — actor positions at 20Hz
  │ REST: /api/map/topology, /api/map/opendrive, /api/world/spawn-points
  │ REST: /api/world/weather — sun position, clouds, fog
  ▼
carla-web (Three.js)
  ├── Main 3D Scene (full world view)
  │   ├── Road network mesh (from OpenDRIVE or topology waypoints)
  │   ├── Actor meshes (vehicles=boxes, pedestrians=capsules)
  │   ├── Sky + Sun (from weather params)
  │   ├── Ground plane + grid
  │   └── Free camera (orbit/follow/bird's eye)
  │
  └── Camera Sensor Views (grid panels)
      ├── Each panel = a Three.js PerspectiveCamera
      ├── Camera position = vehicle transform + sensor extrinsic offset
      ├── Camera FOV = sensor intrinsic parameter
      ├── Renders the SAME scene from that camera's viewpoint
      └── Displayed in SensorPanel grid cells
```

### What CARLA Still Provides
- **Actor transforms** (WorldTick 0x10) — already implemented, 20Hz
- **Map topology** (`GET /api/map/topology`) — already implemented
- **Spawn points** (`GET /api/world/spawn-points`) — already implemented
- **Weather** (`GET /api/world/weather`) — sun angle, clouds, fog
- **Actor metadata** — type_id, bounding box (for sizing meshes)
- **Sensor config** — camera FOV, position offset relative to parent

### What CARLA No Longer Provides
- ~~Camera JPEG frames~~ — replaced by Three.js rendering
- ~~Depth map JPEG~~ — Three.js depth buffer readback
- ~~Segmentation JPEG~~ — Three.js object coloring by type

Optional: Keep JPEG streaming as a fallback/comparison mode (tab: "UE5 Camera" vs "3D View").

---

## Camera View Implementation

### Intrinsic Parameters (from CARLA sensor config)

A CARLA RGB camera has these configurable attributes:
```python
# Bridge: GET /api/sensors/{id}/config returns:
{
  "fov": 100,              # Horizontal field of view in degrees
  "image_size_x": 1280,    # Width (we use this for aspect ratio)
  "image_size_y": 720,     # Height
  "lens_k": -1.0,          # Radial distortion (ignore for Three.js)
  "gamma": 2.2,            # sRGB gamma
}
```

Three.js PerspectiveCamera mapping:
```typescript
const fovVertical = 2 * Math.atan(Math.tan((hfov * Math.PI / 180) / 2) * (height / width)) * (180 / Math.PI)
const camera = new THREE.PerspectiveCamera(
  fovVertical,           // Three.js uses VERTICAL FOV
  width / height,        // Aspect ratio
  0.1,                   // Near plane
  1000                   // Far plane
)
```

### Extrinsic Parameters (sensor transform relative to vehicle)

CARLA cameras are attached to a vehicle with a relative transform:
```python
# From realtime_session.py:
transform = {
  "location": {"x": 1.6, "y": 0.0, "z": 1.7},     # 1.6m forward, 1.7m up
  "rotation": {"pitch": -8.0, "yaw": 0.0, "roll": 0.0}  # Tilted 8° down
}
```

In Three.js, the camera is a child of the vehicle group:
```typescript
// Vehicle group (updated every WorldTick)
const vehicleGroup = new THREE.Group()
vehicleGroup.position.set(vehicleX, vehicleZ, -vehicleY) // CARLA → Three.js coords
vehicleGroup.rotation.set(0, -yawRad, 0)

// Camera as child — offset in vehicle's local space
const sensorCamera = new THREE.PerspectiveCamera(fovVertical, aspect, 0.1, 1000)
sensorCamera.position.set(1.6, 1.7, 0)  // local offset: forward, up, right
sensorCamera.rotation.set(
  THREE.MathUtils.degToRad(-(-8)),  // pitch
  0,                                 // yaw
  0                                  // roll
)
vehicleGroup.add(sensorCamera)
```

When the vehicle moves, the camera moves with it automatically (Three.js parent-child transform inheritance).

### Rendering Camera Views to Grid Panels

Each sensor panel cell renders a Three.js view from a specific camera:

```typescript
// SensorCameraView.tsx
import { useRef, useEffect } from "react"
import { useFrame, useThree, createPortal } from "@react-three/fiber"

interface SensorCameraViewProps {
  sensorId: number
  fov: number          // horizontal FOV from CARLA config
  offset: { x: number; y: number; z: number }   // extrinsic position
  rotation: { pitch: number; yaw: number; roll: number }  // extrinsic rotation
  parentActorId: number   // vehicle to attach to
  width: number        // render target width
  height: number       // render target height
}

export function SensorCameraView({ fov, offset, rotation, parentActorId, width, height }: SensorCameraViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const { scene } = useThree()  // Access the shared scene from the main WorldScene
  
  useEffect(() => {
    if (!canvasRef.current) return
    
    // Create a separate renderer for this camera view
    const renderer = new THREE.WebGLRenderer({ 
      canvas: canvasRef.current, 
      antialias: true,
      alpha: false 
    })
    renderer.setSize(width, height)
    renderer.setPixelRatio(1) // Don't use devicePixelRatio for performance
    rendererRef.current = renderer
    
    // Create camera with CARLA intrinsics
    const aspect = width / height
    const vfov = 2 * Math.atan(Math.tan((fov * Math.PI / 180) / 2) * (1 / aspect)) * (180 / Math.PI)
    const camera = new THREE.PerspectiveCamera(vfov, aspect, 0.1, 1000)
    cameraRef.current = camera
    
    return () => { renderer.dispose() }
  }, [fov, width, height])
  
  // Update camera position every frame based on parent vehicle transform
  useFrame(() => {
    const camera = cameraRef.current
    const renderer = rendererRef.current
    if (!camera || !renderer) return
    
    // Get parent vehicle position from actor store
    const actors = useActorStore.getState().actors
    const parent = actors.get(parentActorId)
    if (!parent) return
    
    // Set camera world position = vehicle position + local offset (rotated by vehicle yaw)
    const vehiclePos = carlaToThree(parent.transform.location)
    const vehicleYaw = THREE.MathUtils.degToRad(-parent.transform.rotation.yaw)
    
    // Rotate offset by vehicle yaw
    const localOffset = new THREE.Vector3(offset.x, offset.z, -offset.y)
    localOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), vehicleYaw)
    
    camera.position.set(
      vehiclePos.x + localOffset.x,
      vehiclePos.y + localOffset.y,
      vehiclePos.z + localOffset.z
    )
    
    // Camera rotation = vehicle rotation + sensor rotation
    camera.rotation.set(
      THREE.MathUtils.degToRad(-(rotation.pitch + parent.transform.rotation.pitch)),
      vehicleYaw + THREE.MathUtils.degToRad(-rotation.yaw),
      THREE.MathUtils.degToRad(rotation.roll),
      "YXZ"
    )
    
    // Render the shared scene from this camera's viewpoint
    renderer.render(scene, camera)
  })
  
  return <canvas ref={canvasRef} width={width} height={height} className="w-full h-full object-contain" />
}
```

### Alternative: Use R3F's `<View>` for Multi-Camera Rendering

React Three Fiber's `<View>` component can render the same scene from multiple viewpoints efficiently:

```typescript
import { View } from "@react-three/drei"

// In the SensorPanel grid:
<div className="grid grid-cols-2 gap-1">
  {sensors.map(sensor => (
    <View key={sensor.id} className="h-48">
      {/* This renders the shared scene from this camera's perspective */}
      <PerspectiveCamera
        makeDefault
        position={getCameraPosition(sensor)}
        rotation={getCameraRotation(sensor)}
        fov={getCameraVFOV(sensor)}
      />
    </View>
  ))}
</div>
```

This is more efficient than creating separate WebGL renderers because all views share the same GPU context and scene graph.

---

## Scene Content — What to Render

### Roads (from map topology)

```typescript
// Fetch once on map load:
// GET /api/map/topology → array of {start: {transform}, end: {transform}} road segments

// Render as thick lines or extruded paths:
import { Line } from "@react-three/drei"

function RoadNetwork({ topology }) {
  return (
    <>
      {topology.map((segment, i) => (
        <Line
          key={i}
          points={[
            carlaToThree(segment.start.transform.location),
            carlaToThree(segment.end.transform.location),
          ]}
          color="#4b5563"
          lineWidth={3}
        />
      ))}
    </>
  )
}
```

For better visuals, use extruded road mesh with lane markings (parse OpenDRIVE XML).

### Vehicles

Already implemented in Phase 3 (ActorRenderer.tsx) — colored box meshes.

Enhance with:
- Different colors per vehicle type (sedan=blue, truck=yellow, bus=green, motorcycle=red)
- Headlight/taillight emissive points
- Wheel cylinders at corners
- Speed-based motion blur (optional)

### Pedestrians

Already implemented — orange capsules.

### Sky + Lighting (from weather)

```typescript
// Sync Three.js lighting with CARLA weather:
function WeatherLighting({ weather }) {
  const sunAlt = THREE.MathUtils.degToRad(weather.sun_altitude_angle)
  const sunAz = THREE.MathUtils.degToRad(weather.sun_azimuth_angle)
  
  const sunX = Math.cos(sunAlt) * Math.sin(sunAz) * 200
  const sunY = Math.sin(sunAlt) * 200
  const sunZ = Math.cos(sunAlt) * Math.cos(sunAz) * 200
  
  // Sun intensity based on altitude (dim at horizon, bright at zenith)
  const sunIntensity = Math.max(0.1, Math.sin(sunAlt)) * (1 - weather.cloudiness / 100 * 0.7)
  
  // Fog
  const fogDensity = weather.fog_density / 100
  
  return (
    <>
      <directionalLight
        position={[sunX, sunY, sunZ]}
        intensity={sunIntensity * 1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <hemisphereLight
        args={[
          `hsl(210, ${40 - weather.cloudiness * 0.3}%, ${60 - weather.cloudiness * 0.4}%)`,  // sky
          "#1a1510",  // ground
          0.4 + sunIntensity * 0.3,
        ]}
      />
      <ambientLight intensity={0.15 + weather.cloudiness / 100 * 0.2} />
      
      {fogDensity > 0.01 && (
        <fog attach="fog" args={["#d4d4d8", 10 / fogDensity, 200 / fogDensity]} />
      )}
      
      <Sky
        sunPosition={[sunX, sunY, sunZ]}
        turbidity={2 + weather.cloudiness / 10}
        rayleigh={1 + weather.precipitation / 50}
      />
    </>
  )
}
```

### Ground

Replace flat plane with a textured ground:
```typescript
<mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
  <planeGeometry args={[2000, 2000]} />
  <meshStandardMaterial
    color="#2d2d2d"
    roughness={0.9}
    metalness={0.1}
  />
</mesh>
```

---

## Simulated Sensor Data (replacing JPEG streams)

### Depth View
Three.js can render a depth buffer:
```typescript
// Use a custom depth material or read from the depth buffer
const depthMaterial = new THREE.MeshDepthMaterial({
  depthPacking: THREE.RGBADepthPacking,
})

// Render the scene with depth material, read pixels, colorize
```

### Segmentation View
Color each mesh by actor type:
```typescript
const SEGMENTATION_COLORS = {
  "vehicle": "#00008e",     // Car = dark blue (CityScapes class 14)
  "walker": "#dc143c",      // Pedestrian = crimson (class 12)
  "traffic": "#faaa1e",     // Traffic light = orange (class 7)
  "road": "#804080",        // Road = purple (class 1)
  "building": "#464646",    // Building = gray (class 3)
  "vegetation": "#6b8e23",  // Vegetation = olive (class 9)
  "sky": "#4682b4",         // Sky = steel blue (class 11)
  "ground": "#804080",      // Ground = road color
}

// Render with flat-colored materials (no lighting), one pass
```

### LiDAR Simulation
Three.js raycasting from sensor position:
```typescript
// Cast N rays in a pattern matching CARLA LiDAR config
// (channels, rotation_frequency, points_per_second)
// Get intersection points → render as point cloud
// Less accurate than CARLA but zero-latency
```

---

## Bridge Changes

### New Endpoint: `/api/map/opendrive`
```python
@router.get("/opendrive")
async def get_opendrive():
    xodr = await asyncio.to_thread(lambda: carla_manager.world.get_map().to_opendrive())
    return Response(content=xodr, media_type="application/xml")
```

### New Endpoint: `/api/actors/details` (batch)
Return full actor info including bounding boxes for mesh sizing:
```python
@router.get("/details")
async def get_actor_details():
    actors = world.get_actors()
    return [{
        "id": a.id,
        "type_id": a.type_id,
        "bounding_box": {
            "extent": {"x": a.bounding_box.extent.x, "y": a.bounding_box.extent.y, "z": a.bounding_box.extent.z}
        },
        "transform": serialize_transform(a.get_transform()),
    } for a in actors if not a.type_id.startswith("sensor.")]
```

### Enhanced WorldTick: Add `type_id`
Currently WorldTick only sends `(id, position, rotation, velocity)`. Add `type_id` hash so the frontend knows what mesh to use without a separate REST call:
```python
# In protocol.py, extend world tick per-actor data:
# Current: <I9f (id + 9 floats = 40 bytes)
# New: <I9fI (id + 9 floats + type_hash = 44 bytes)
# type_hash = hash(type_id) & 0xFFFFFFFF

# Frontend maps type_hash → mesh type on first encounter via REST lookup
```

---

## Migration Path

### Phase A: Hybrid Mode (keep both, add Three.js views)
1. Main viewport has tabs: "Camera Feed" (existing JPEG) | "3D World" (Three.js)
2. SensorPanel grid cells can show either JPEG stream or Three.js camera view
3. User chooses per-cell which mode to use
4. This lets us validate Three.js rendering quality before removing JPEG

### Phase B: Three.js Primary (default to 3D)
1. Default viewport is Three.js 3D World
2. Camera sensor views in grid are Three.js rendered
3. JPEG stream available as "UE5 Camera" tab for comparison/validation
4. Most bandwidth savings achieved

### Phase C: JPEG Optional (remove if Three.js is sufficient)
1. Bridge still supports JPEG streaming for specialized use (ground truth comparison)
2. But default experience is fully Three.js
3. Can run CARLA with `-nullrhi` (no GPU rendering) for maximum server efficiency

---

## Performance Targets

| Metric | JPEG Stream (current) | Three.js (target) |
|--------|----------------------|-------------------|
| Visual quality | Low (JPEG artifacts) | High (native resolution) |
| Latency | 100-150ms | <16ms (local render) |
| Bandwidth | ~1MB/s per camera | ~2KB/s (transforms only) |
| Max cameras | 2-3 (bandwidth limited) | Unlimited |
| Resolution | 1280x720 max | Display native |
| FPS | 20 (sensor tick) | 60 (browser render) |
| Server GPU | Required for rendering | Optional |

---

## Summary

Stop streaming JPEG screenshots from UE5. Instead:
1. CARLA runs headless (physics + AI only)
2. Bridge sends actor transforms + map data (tiny bandwidth)
3. Browser renders everything in Three.js at native resolution and 60 FPS
4. Camera sensor views use Three.js cameras positioned by CARLA intrinsic/extrinsic params
5. Multiple camera angles at zero server cost
6. No JPEG artifacts, no compression latency, no dark frame issues
