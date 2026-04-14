# Plan B: Three.js Browser-Native Renderer

## When to Use This Plan

Use this if the current UE5 camera-frame-streaming approach fails due to:
- UE5 server won't start or keeps crashing
- GPU memory insufficient for UE5 offscreen rendering
- JPEG streaming too slow or too much bandwidth
- Need to run without a GPU server entirely

## Architecture Change

### Before (Plan A — current)
```
UE5 renders frames → Python extracts JPEG → WebSocket → Browser shows image
(Heavy: needs UE5 + GPU for rendering)
```

### After (Plan B — Three.js)
```
CARLA server runs HEADLESS (no rendering) → Python gets actor transforms + map data
→ WebSocket sends lightweight JSON/binary transforms → Browser renders in Three.js
(Light: CARLA only does physics/AI, browser does all rendering)
```

## What CARLA Server Provides (no rendering needed)

1. **Map geometry**: OpenDRIVE `.xodr` file — road network, lanes, junctions
2. **Actor transforms**: position (x,y,z), rotation (pitch,yaw,roll), velocity — already in WorldTick
3. **Actor metadata**: type_id (vehicle.tesla.model3, walker.pedestrian.0001, etc.)
4. **Traffic lights**: state (red/yellow/green), location
5. **Weather**: sun angle, clouds, rain intensity
6. **Waypoints**: route planning data

None of this requires UE5 to render anything.

## Implementation Steps

### Step 1: Map Loading

**Source**: CARLA provides OpenDRIVE files at `Unreal/CarlaUnreal/Content/Carla/Maps/*/`

```python
# Bridge endpoint to serve map data
@app.get("/api/map/opendrive")
async def get_opendrive():
    xodr_string = carla_manager.world.get_map().to_opendrive()
    return {"opendrive": xodr_string}

@app.get("/api/map/topology")
async def get_topology():
    carla_map = carla_manager.world.get_map()
    waypoints = carla_map.generate_waypoints(2.0)  # every 2 meters
    return [{"x": w.transform.location.x, 
             "y": w.transform.location.y, 
             "z": w.transform.location.z,
             "road_id": w.road_id,
             "lane_id": w.lane_id} for w in waypoints]
```

**Frontend**: Parse OpenDRIVE XML → generate Three.js road mesh
```typescript
// Use a library like opendrive-js or parse manually
// Roads → ExtrudeGeometry along spline paths
// Junctions → merged geometry
// Lane markings → Line segments
```

### Step 2: Lightweight Actor Streaming

The existing WorldTick (channel 0x10) already sends all actor transforms at 20Hz. This is all Three.js needs.

```typescript
// Already have this data from WorldTick:
interface ActorTransform {
  id: number;
  position: { x: number; y: number; z: number };
  rotation: { pitch: number; yaw: number; roll: number };
  velocity: { x: number; y: number; z: number };
}
```

**Add**: actor type_id to WorldTick payload so frontend knows what model to use.

### Step 3: 3D Models in Browser

```
Vehicles → simple box/car-shaped meshes, colored by type
  - Cars: sedan shape, ~4.5m x 1.8m x 1.5m
  - Trucks: longer box
  - Bikes: thin rectangle
Pedestrians → capsule or stick figure
Traffic lights → pole + colored sphere
Road signs → billboard sprites
Buildings → extruded footprints (from OpenDRIVE objects)
Ground → flat plane with road texture
Sky → Three.js Sky shader or gradient
```

For better visuals later: load GLTF models from a CDN or local assets.

### Step 4: Camera Controls

```typescript
// Three.js camera modes:
// 1. Follow vehicle (chase cam)
camera.position.set(
  vehicle.position.x - 10 * Math.sin(vehicle.rotation.yaw),
  vehicle.position.z + 5,
  vehicle.position.y - 10 * Math.cos(vehicle.rotation.yaw)
);
camera.lookAt(vehicle.position);

// 2. Bird's eye view
camera.position.set(vehicle.position.x, vehicle.position.z + 50, vehicle.position.y);
camera.lookAt(vehicle.position);

// 3. Free orbit (OrbitControls)
const controls = new OrbitControls(camera, renderer.domElement);
```

### Step 5: Simulated Sensors (Optional)

Instead of streaming camera JPEG from UE5, simulate sensors in browser:
- **Camera**: Three.js renders from sensor viewpoint → canvas
- **LiDAR**: Three.js raycasting from sensor position
- **Depth**: Three.js depth buffer readback
- **Segmentation**: Assign colors by object type in Three.js scene

Not as accurate as CARLA's rendering, but works without UE5 rendering.

### Step 6: CARLA Server in Headless Mode

```bash
# Run CARLA without any rendering at all
# Just physics simulation + AI + traffic
/home/song99/UnrealEngine5_carla/Engine/Binaries/Linux/UnrealEditor \
  /data1/song99/carla/Unreal/CarlaUnreal/CarlaUnreal.uproject \
  -game -RenderOffScreen -nosound -unattended \
  -nullrhi \
  -carla-rpc-port=58338
```

`-nullrhi` = no GPU rendering at all. CARLA still simulates physics and traffic, just doesn't render any pixels.

## Bridge Changes Required

### Minimal changes:
1. Add `/api/map/opendrive` endpoint
2. Add `/api/map/waypoints` endpoint  
3. Add actor `type_id` to WorldTick payload
4. Remove sensor camera streaming (optional — can keep as fallback)
5. Add `/api/actors/details` endpoint returning full actor info

### WorldTick payload extension:
```python
# Current: (id, position, rotation, velocity)
# New: add type_id hash or string
def encode_world_tick_v2(frame, timestamp, actors):
    # ... existing fields ...
    # + per actor: type_id_hash (uint32) for compact encoding
    # Frontend maps hash → model type
```

## Frontend Changes Required

### Major additions:
1. OpenDRIVE parser → Three.js road geometry
2. Actor model manager (load/cache 3D models by type)
3. Scene graph: ground + roads + actors + lights + sky
4. Camera system: follow, orbit, bird's eye, FPV
5. Actor label/tooltip overlay (HTML overlay on 3D)
6. Performance: frustum culling, LOD, instanced rendering

### Keep from current:
- shadcn/ui layout and controls
- Zustand stores
- WebSocket connection layer
- All control panels (weather, traffic, etc.)

## File Structure (Plan B)

```
carla-web/src/
├── three/                    # NEW: Three.js rendering
│   ├── Scene.tsx             # Main R3F scene
│   ├── Road.tsx              # OpenDRIVE → road mesh
│   ├── ActorModel.tsx        # Vehicle/pedestrian 3D models
│   ├── TrafficLight.tsx      # Traffic light state visualization
│   ├── Sky.tsx               # Sky/weather rendering
│   ├── CameraController.tsx  # Follow/orbit/bird's eye modes
│   ├── Ground.tsx            # Ground plane
│   └── parsers/
│       └── opendrive.ts      # OpenDRIVE XML → geometry
├── components/               # Existing shadcn UI (keep all)
├── stores/                   # Existing (keep, extend)
├── workers/                  # Simplify (no image decoding needed)
└── lib/
    └── ws-protocol.ts        # Update for v2 WorldTick
```

## Hybrid Mode (Best of Both)

Run Plan A and Plan B simultaneously:
- Three.js viewport shows the 3D scene (always works)
- Camera feed panel shows UE5 JPEG stream (when available)
- If UE5 crashes, 3D viewport still works with actor data
- User can toggle between "3D View" and "Camera Feed" tabs

This is the recommended approach: Three.js as primary, JPEG stream as optional overlay.
