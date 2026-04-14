# Full 3D City Rendering — Reproduce CARLA Graphics in Three.js

## Mission

Render the complete CARLA city in the browser using Three.js. Buildings, roads, sidewalks, vegetation, traffic lights, signs, walls, fences, water, rocks — everything. The user must see an actual 3D city, not wireframes or abstract boxes.

## Data Source

CARLA Python API provides `world.get_environment_objects(label)` which returns EVERY static object in the map with:
- `name`: mesh name (e.g., "Bl_CityBuilding_GasStation_43_SM_0")
- `type`: category label
- `transform`: world position + rotation
- `bounding_box`: center position + extent (half-size) + rotation

### Available Object Counts (Town01_Opt)

| Category | Count | Rendering Approach |
|----------|-------|-------------------|
| Buildings | 419 | Extruded box mesh with windows texture |
| Roads | 97 | Flat box with dark asphalt material |
| Sidewalks | 169 | Flat box with lighter concrete material |
| Vegetation | 3242 | Billboard sprites or simplified cone+cylinder |
| Poles | 57 | Thin cylinder mesh |
| Walls | 45 | Flat box mesh |
| Fences | 121 | Thin wall mesh with semi-transparency |
| TrafficLight | 36 | Pole + colored spheres |
| TrafficSigns | 21 | Pole + flat rectangle |
| Water | 21 | Flat reflective plane |
| Rock | 127 | Irregular sphere mesh |
| GuardRail | 3 | Thin elongated box |
| RoadLines | 25 | Thin stripe on road surface |

**Plus**: 3266 road waypoints with lane_width, lane_id, road_id, yaw for precise road surface generation.

### Total data: ~2.4 MB JSON (one-time load on map change)

---

## Bridge API Endpoint

### `GET /api/map/environment`

**File to create/modify**: `carla-web-bridge/src/routes/navigation.py` or new `routes/map_data.py`

```python
@router.get("/api/map/environment")
async def get_environment_objects():
    """Return all static environment objects for Three.js rendering."""
    import carla as carla_mod
    
    world = carla_manager.world
    result = {}
    
    labels = [
        ("buildings", carla_mod.CityObjectLabel.Buildings),
        ("roads", carla_mod.CityObjectLabel.Roads),
        ("sidewalks", carla_mod.CityObjectLabel.Sidewalks),
        ("vegetation", carla_mod.CityObjectLabel.Vegetation),
        ("poles", carla_mod.CityObjectLabel.Poles),
        ("walls", carla_mod.CityObjectLabel.Walls),
        ("fences", carla_mod.CityObjectLabel.Fences),
        ("traffic_lights", carla_mod.CityObjectLabel.TrafficLight),
        ("traffic_signs", carla_mod.CityObjectLabel.TrafficSigns),
        ("water", carla_mod.CityObjectLabel.Water),
        ("rocks", carla_mod.CityObjectLabel.Rock),
        ("guard_rails", carla_mod.CityObjectLabel.GuardRail),
        ("road_lines", carla_mod.CityObjectLabel.RoadLines),
    ]
    
    for key, label in labels:
        objects = world.get_environment_objects(label)
        result[key] = [{
            "name": obj.name,
            "transform": {
                "x": obj.transform.location.x,
                "y": obj.transform.location.y,
                "z": obj.transform.location.z,
                "pitch": obj.transform.rotation.pitch,
                "yaw": obj.transform.rotation.yaw,
                "roll": obj.transform.rotation.roll,
            },
            "bbox": {
                "x": obj.bounding_box.location.x,
                "y": obj.bounding_box.location.y,
                "z": obj.bounding_box.location.z,
                "ex": obj.bounding_box.extent.x,
                "ey": obj.bounding_box.extent.y,
                "ez": obj.bounding_box.extent.z,
                "yaw": obj.bounding_box.rotation.yaw,
            },
        } for obj in objects]
    
    return result
```

### `GET /api/map/road-geometry`

```python
@router.get("/api/map/road-geometry")
async def get_road_geometry():
    """Return dense road waypoints for road surface mesh generation."""
    m = carla_manager.world.get_map()
    waypoints = m.generate_waypoints(2.0)
    return [{
        "x": wp.transform.location.x,
        "y": wp.transform.location.y,
        "z": wp.transform.location.z,
        "yaw": wp.transform.rotation.yaw,
        "road_id": wp.road_id,
        "lane_id": wp.lane_id,
        "lane_width": wp.lane_width,
        "is_junction": wp.is_junction,
    } for wp in waypoints]
```

---

## Three.js Rendering Implementation

### File: `src/lib/city-renderer.ts` (new)

Data types:
```typescript
interface EnvironmentObject {
  name: string
  transform: { x: number; y: number; z: number; pitch: number; yaw: number; roll: number }
  bbox: { x: number; y: number; z: number; ex: number; ey: number; ez: number; yaw: number }
}

interface MapEnvironment {
  buildings: EnvironmentObject[]
  roads: EnvironmentObject[]
  sidewalks: EnvironmentObject[]
  vegetation: EnvironmentObject[]
  poles: EnvironmentObject[]
  walls: EnvironmentObject[]
  fences: EnvironmentObject[]
  traffic_lights: EnvironmentObject[]
  traffic_signs: EnvironmentObject[]
  water: EnvironmentObject[]
  rocks: EnvironmentObject[]
  guard_rails: EnvironmentObject[]
  road_lines: EnvironmentObject[]
}

interface RoadWaypoint {
  x: number; y: number; z: number
  yaw: number
  road_id: number; lane_id: number
  lane_width: number; is_junction: boolean
}
```

### CARLA → Three.js coordinate conversion

```typescript
function carlaToThree(x: number, y: number, z: number): [number, number, number] {
  return [x, z, -y]  // CARLA Z-up → Three.js Y-up
}

function carlaRotToEuler(pitch: number, yaw: number, roll: number): THREE.Euler {
  return new THREE.Euler(
    THREE.MathUtils.degToRad(-pitch),
    THREE.MathUtils.degToRad(-yaw),
    THREE.MathUtils.degToRad(roll),
    "YXZ"
  )
}
```

### File: `src/components/viewport/CityEnvironment.tsx` (new)

Main component that loads and renders all city geometry:

```tsx
import { useEffect, useState, useMemo } from "react"
import * as THREE from "three"
import { useThree } from "@react-three/fiber"
import { carlaApi } from "@/lib/carla-api"

export function CityEnvironment() {
  const [env, setEnv] = useState<MapEnvironment | null>(null)
  const [roads, setRoads] = useState<RoadWaypoint[] | null>(null)
  
  useEffect(() => {
    // Load environment data once
    carlaApi.request("/api/map/environment").then(setEnv).catch(console.error)
    carlaApi.request("/api/map/road-geometry").then(setRoads).catch(console.error)
  }, [])
  
  if (!env) return null  // Loading
  
  return (
    <>
      <BuildingsMesh objects={env.buildings} />
      <RoadSurfaces objects={env.roads} waypoints={roads} />
      <SidewalksMesh objects={env.sidewalks} />
      <VegetationInstances objects={env.vegetation} />
      <PolesMesh objects={env.poles} />
      <WallsMesh objects={env.walls} />
      <FencesMesh objects={env.fences} />
      <TrafficLightsMesh objects={env.traffic_lights} />
      <TrafficSignsMesh objects={env.traffic_signs} />
      <WaterSurfaces objects={env.water} />
      <RocksMesh objects={env.rocks} />
    </>
  )
}
```

### Building Rendering

Each building = a box geometry sized by bounding_box extent, positioned and rotated:

```tsx
function BuildingsMesh({ objects }: { objects: EnvironmentObject[] }) {
  // Use InstancedMesh for performance (419 buildings in one draw call)
  const mesh = useMemo(() => {
    const geo = new THREE.BoxGeometry(1, 1, 1)
    const mat = new THREE.MeshStandardMaterial({
      color: "#6b7280",       // Gray concrete
      roughness: 0.85,
      metalness: 0.05,
    })
    const instanced = new THREE.InstancedMesh(geo, mat, objects.length)
    
    const dummy = new THREE.Object3D()
    objects.forEach((obj, i) => {
      const [x, y, z] = carlaToThree(obj.bbox.x, obj.bbox.y, obj.bbox.z)
      dummy.position.set(x, y, z)
      dummy.rotation.copy(carlaRotToEuler(0, obj.bbox.yaw, 0))
      // Scale by extent (extent = half-size, so multiply by 2)
      dummy.scale.set(obj.bbox.ex * 2, obj.bbox.ez * 2, obj.bbox.ey * 2)
      dummy.updateMatrix()
      instanced.setMatrixAt(i, dummy.matrix)
      
      // Vary color slightly per building for visual interest
      const shade = 0.4 + Math.random() * 0.25
      instanced.setColorAt(i, new THREE.Color(shade, shade * 0.95, shade * 0.9))
    })
    
    instanced.instanceMatrix.needsUpdate = true
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true
    instanced.castShadow = true
    instanced.receiveShadow = true
    
    return instanced
  }, [objects])
  
  return <primitive object={mesh} />
}
```

### Road Surface Rendering

Roads as flat boxes with asphalt color:

```tsx
function RoadSurfaces({ objects, waypoints }: { objects: EnvironmentObject[]; waypoints: RoadWaypoint[] | null }) {
  const mesh = useMemo(() => {
    const geo = new THREE.BoxGeometry(1, 0.05, 1)  // Very thin
    const mat = new THREE.MeshStandardMaterial({
      color: "#2d2d2d",       // Dark asphalt
      roughness: 0.95,
      metalness: 0.0,
    })
    const instanced = new THREE.InstancedMesh(geo, mat, objects.length)
    
    const dummy = new THREE.Object3D()
    objects.forEach((obj, i) => {
      const [x, y, z] = carlaToThree(obj.bbox.x, obj.bbox.y, obj.bbox.z)
      dummy.position.set(x, y, z)
      dummy.rotation.copy(carlaRotToEuler(0, obj.bbox.yaw, 0))
      dummy.scale.set(obj.bbox.ex * 2, 1, obj.bbox.ey * 2)
      dummy.updateMatrix()
      instanced.setMatrixAt(i, dummy.matrix)
    })
    instanced.instanceMatrix.needsUpdate = true
    instanced.receiveShadow = true
    return instanced
  }, [objects])
  
  return <primitive object={mesh} />
}
```

### Sidewalks

Same as roads but slightly raised and lighter color:
```tsx
// color: "#9ca3af" (light gray concrete)
// y offset: +0.15 (raised above road)
```

### Vegetation (3242 objects — use InstancedMesh)

Simplified tree = green cone (canopy) + brown cylinder (trunk):
```tsx
function VegetationInstances({ objects }: { objects: EnvironmentObject[] }) {
  // Two instanced meshes: trunks and canopies
  const { trunks, canopies } = useMemo(() => {
    const trunkGeo = new THREE.CylinderGeometry(0.15, 0.2, 3, 6)
    const trunkMat = new THREE.MeshStandardMaterial({ color: "#5c4033", roughness: 0.9 })
    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, objects.length)
    
    const canopyGeo = new THREE.ConeGeometry(1.5, 4, 6)
    const canopyMat = new THREE.MeshStandardMaterial({ color: "#2d5a27", roughness: 0.8 })
    const canopyMesh = new THREE.InstancedMesh(canopyGeo, canopyMat, objects.length)
    
    const dummy = new THREE.Object3D()
    objects.forEach((obj, i) => {
      const [x, y, z] = carlaToThree(obj.bbox.x, obj.bbox.y, obj.bbox.z)
      const height = obj.bbox.ez * 2  // full height
      const width = Math.max(obj.bbox.ex, obj.bbox.ey) * 2
      
      // Trunk
      dummy.position.set(x, y + height * 0.2, z)
      dummy.scale.set(width * 0.1, height * 0.4, width * 0.1)
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      trunkMesh.setMatrixAt(i, dummy.matrix)
      
      // Canopy
      dummy.position.set(x, y + height * 0.6, z)
      dummy.scale.set(width * 0.5, height * 0.6, width * 0.5)
      dummy.updateMatrix()
      canopyMesh.setMatrixAt(i, dummy.matrix)
      
      // Vary green shade
      const g = 0.25 + Math.random() * 0.2
      canopyMesh.setColorAt(i, new THREE.Color(g * 0.3, g, g * 0.15))
    })
    
    trunkMesh.instanceMatrix.needsUpdate = true
    canopyMesh.instanceMatrix.needsUpdate = true
    if (canopyMesh.instanceColor) canopyMesh.instanceColor.needsUpdate = true
    
    return { trunks: trunkMesh, canopies: canopyMesh }
  }, [objects])
  
  return (
    <>
      <primitive object={trunks} />
      <primitive object={canopies} />
    </>
  )
}
```

### Poles (street lights, utility poles)

Thin cylinders:
```tsx
// CylinderGeometry(0.08, 0.08, height, 6)
// color: "#71717a" (zinc gray)
```

### Traffic Lights

Pole + 3 colored spheres (red/yellow/green):
```tsx
// For each traffic light:
// - Pole: CylinderGeometry at position
// - Housing: BoxGeometry(0.3, 0.8, 0.3) at top of pole
// - 3 spheres: red(top), yellow(mid), green(bottom) with emissive
```

### Water

Flat reflective plane:
```tsx
// MeshStandardMaterial({ color: "#1e3a5f", roughness: 0.1, metalness: 0.6, transparent: true, opacity: 0.8 })
```

### Walls, Fences, Rocks

Similar pattern — InstancedMesh with bounding box dimensions.

---

## Lighting

Sync with CARLA weather (already partially implemented in WorldScene):

```tsx
function CityLighting() {
  // Fetch weather from simulationStore
  const weather = useSimulationStore(s => s.weather)
  
  const sunAlt = THREE.MathUtils.degToRad(weather.sun_altitude_angle)
  const sunAz = THREE.MathUtils.degToRad(weather.sun_azimuth_angle)
  const sunPos = [
    Math.cos(sunAlt) * Math.sin(sunAz) * 500,
    Math.sin(sunAlt) * 500,
    Math.cos(sunAlt) * Math.cos(sunAz) * 500,
  ]
  const sunIntensity = Math.max(0.1, Math.sin(sunAlt)) * (1 - weather.cloudiness / 150)
  
  return (
    <>
      <ambientLight intensity={0.2 + weather.cloudiness / 200} />
      <directionalLight
        position={sunPos}
        intensity={sunIntensity * 2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={500}
        shadow-camera-left={-200}
        shadow-camera-right={200}
        shadow-camera-top={200}
        shadow-camera-bottom={-200}
      />
      <hemisphereLight
        args={["#87ceeb", "#3d2817", 0.3 + sunIntensity * 0.3]}
      />
    </>
  )
}
```

---

## Integration into WorldScene

**File to modify**: `src/components/viewport/WorldScene.tsx`

Add `<CityEnvironment />` to the scene:

```tsx
<Canvas ...>
  <CityLighting />
  <CityEnvironment />   {/* NEW — renders all city geometry */}
  <GroundPlane />
  <ActorRenderer />
  <CameraController />
  <Sky ... />
  <GizmoHelper ...>...</GizmoHelper>
</Canvas>
```

---

## Performance

- **InstancedMesh** for each category (one draw call per category, not per object)
- Total draw calls: ~12 (one per category)
- Total triangles: ~50K-100K (simple box/cone/cylinder geometries)
- Should easily run at 60 FPS on any modern GPU
- Data loaded once on map change, cached in React state

## LOD (Level of Detail) — optional optimization

For vegetation (3242 objects), use distance-based LOD:
- Near (<100m): cone + cylinder tree
- Far (>100m): flat colored billboard sprite
- Very far (>300m): don't render

---

## Verification

After implementing, Playwright must show:
1. Gray/brown building blocks of various sizes throughout the scene
2. Dark road surfaces at ground level
3. Lighter sidewalk strips along roads
4. Green cone-shaped trees scattered throughout
5. Thin poles for street lights
6. Traffic light poles with colored spheres at intersections
7. The ego vehicle driving through this city with WASD
8. Mouse drag orbiting the camera around the vehicle as it drives

The scene should look like a low-poly city — not photorealistic, but clearly recognizable as a city with streets, buildings, and vegetation. Much better than nodes and edges.
