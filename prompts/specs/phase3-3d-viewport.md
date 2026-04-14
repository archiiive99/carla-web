# Phase 3: 3D Viewport — Three.js World Visualization

## Overview

The current `MainViewport.tsx` only contains a Pixel Streaming fallback (video player). This phase replaces it with a full Three.js scene that visualizes the CARLA world in real-time: actor positions as 3D meshes, a ground plane, road network hints, and 4 camera modes.

The actor transform data is already flowing — `WorldTick` messages arrive at 20Hz via WebSocket, are parsed in `ws-receiver.worker.ts`, and stored in `actorStore.ts`. This phase just needs to render that data in Three.js.

**Estimated scope**: 6-8 new files, ~1000 lines of code.

---

## Prerequisites

1. Phase 0 (camera feed) MUST be working
2. Phase 1 (shadcn audit) should be done
3. Three.js dependencies must be installed:
```bash
cd /data1/song99/carla/carla-web
# Check if already installed:
grep -E '"three"|"@react-three/fiber"|"@react-three/drei"' package.json
# If missing:
npm install three @react-three/fiber @react-three/drei
npm install -D @types/three
```

---

## Data Source: Actor Store (already implemented)

The `actorStore.ts` already receives WorldTick updates from `WorkerContext.tsx`:

```typescript
// Already in actorStore.ts:
actors: Map<number, CarlaActor>
// CarlaActor has: id, type_id, type, transform: {location: {x,y,z}, rotation: {pitch,yaw,roll}}, velocity: {x,y,z}
```

And `simulationStore.ts` tracks the ego vehicle:
```typescript
// Already tracking from realtime session:
// defaultVehicleId or egoVehicleId (check the actual field name)
```

---

## CARLA → Three.js Coordinate Conversion

**CARLA**: Left-handed, Z-up
- X = forward
- Y = right  
- Z = up

**Three.js**: Right-handed, Y-up
- X = right
- Y = up
- Z = toward camera (backward)

**Conversion formula**:
```typescript
function carlaToThree(carlaPos: { x: number; y: number; z: number }) {
  return {
    x: carlaPos.x,      // CARLA X → Three X
    y: carlaPos.z,       // CARLA Z (up) → Three Y (up)
    z: -carlaPos.y,      // CARLA Y (right) → Three -Z
  }
}

function carlaRotationToEuler(r: { pitch: number; yaw: number; roll: number }) {
  return new THREE.Euler(
    THREE.MathUtils.degToRad(-r.pitch),  // pitch around X
    THREE.MathUtils.degToRad(-r.yaw),    // yaw around Y (negated for handedness)
    THREE.MathUtils.degToRad(r.roll),    // roll around Z
    "YXZ"  // Rotation order
  )
}
```

**IMPORTANT**: Get this conversion right or everything will look wrong. Test with a known actor position (ego vehicle at spawn point) and verify it appears at the correct Three.js coordinates.

---

## Implementation Plan

### File 1: `src/components/viewport/WorldScene.tsx`

The main R3F scene container:

```tsx
import { Canvas } from "@react-three/fiber"
import { GizmoHelper, GizmoViewport, Stats } from "@react-three/drei"
import { Suspense } from "react"
import { GroundPlane } from "./GroundPlane"
import { ActorRenderer } from "./ActorRenderer"
import { CameraController } from "./CameraController"
import { Spinner } from "@/components/ui/spinner"

export function WorldScene() {
  return (
    <div className="h-full w-full bg-background">
      <Suspense fallback={
        <div className="flex items-center justify-center h-full">
          <Spinner className="h-8 w-8" />
          <span className="ml-2 text-sm text-muted-foreground">Loading 3D scene...</span>
        </div>
      }>
        <Canvas
          camera={{ position: [0, 30, -30], fov: 60, near: 0.1, far: 5000 }}
          gl={{ antialias: true, alpha: false }}
          onCreated={({ gl }) => { gl.setClearColor("#0a0a0f") }}
        >
          {/* Lighting */}
          <ambientLight intensity={0.3} />
          <directionalLight position={[100, 200, 50]} intensity={0.7} castShadow />
          <hemisphereLight args={["#1e293b", "#0f172a", 0.5]} />
          
          {/* Scene content */}
          <GroundPlane />
          <ActorRenderer />
          <CameraController />
          
          {/* Fog for depth perception */}
          <fog attach="fog" args={["#0a0a0f", 300, 1500]} />
          
          {/* Dev helpers */}
          <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
            <GizmoViewport axisColors={["#ef4444", "#22c55e", "#3b82f6"]} />
          </GizmoHelper>
        </Canvas>
      </Suspense>
    </div>
  )
}
```

### File 2: `src/components/viewport/GroundPlane.tsx`

```tsx
import { Grid } from "@react-three/drei"

export function GroundPlane() {
  return (
    <>
      <Grid
        args={[2000, 2000]}
        cellSize={10}
        cellThickness={0.3}
        cellColor="#1e293b"
        sectionSize={50}
        sectionThickness={0.8}
        sectionColor="#334155"
        fadeDistance={800}
        fadeStrength={1.5}
        followCamera
        infiniteGrid
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
        <planeGeometry args={[4000, 4000]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
    </>
  )
}
```

### File 3: `src/components/viewport/ActorRenderer.tsx`

This reads from `actorStore` and renders each actor as a 3D mesh.

```tsx
import { useActorStore } from "@/stores/actorStore"
import { Html } from "@react-three/drei"
import * as THREE from "three"
import { memo, useMemo } from "react"

// Vehicle dimensions by type keyword
const VEHICLE_SIZES: Record<string, [number, number, number]> = {
  car:        [4.5, 1.5, 1.8],
  truck:      [8.0, 3.0, 2.5],
  van:        [5.5, 2.2, 2.0],
  motorcycle: [2.2, 1.2, 0.8],
  bicycle:    [1.8, 1.1, 0.6],
  bus:        [12.0, 3.2, 2.6],
  default:    [4.5, 1.5, 1.8],
}

function getVehicleSize(typeId: string): [number, number, number] {
  for (const [key, size] of Object.entries(VEHICLE_SIZES)) {
    if (typeId.includes(key)) return size
  }
  return VEHICLE_SIZES.default
}

const VehicleMesh = memo(function VehicleMesh({ 
  actor, isEgo 
}: { 
  actor: { id: number; type_id: string; transform: any; velocity: any }; 
  isEgo: boolean 
}) {
  const pos = carlaToThree(actor.transform.location)
  const [length, height, width] = getVehicleSize(actor.type_id)
  const yaw = THREE.MathUtils.degToRad(-actor.transform.rotation.yaw)
  
  return (
    <group position={[pos.x, pos.y, pos.z]} rotation={[0, yaw, 0]}>
      {/* Main body */}
      <mesh position={[0, height / 2, 0]} castShadow>
        <boxGeometry args={[length, height, width]} />
        <meshStandardMaterial 
          color={isEgo ? "#22c55e" : "#3b82f6"} 
          emissive={isEgo ? "#166534" : "#1e3a5f"}
          emissiveIntensity={0.3}
        />
      </mesh>
      
      {/* Cabin/roof (sedan shape) */}
      <mesh position={[-length * 0.05, height * 1.2, 0]} castShadow>
        <boxGeometry args={[length * 0.55, height * 0.5, width * 0.85]} />
        <meshStandardMaterial 
          color={isEgo ? "#16a34a" : "#2563eb"} 
          emissive={isEgo ? "#14532d" : "#172554"}
          emissiveIntensity={0.2}
        />
      </mesh>
      
      {/* Direction indicator (front) */}
      <mesh position={[length / 2, height * 0.6, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.2, 0.6, 4]} />
        <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.5} />
      </mesh>
      
      {/* Label */}
      <Html position={[0, height + 1, 0]} center distanceFactor={80} occlude={false}>
        <div className="pointer-events-none select-none bg-background/70 backdrop-blur-sm px-1.5 py-0.5 rounded text-[10px] font-mono whitespace-nowrap border border-border/50">
          {isEgo ? <span className="text-green-400 font-bold">EGO</span> : `#${actor.id}`}
        </div>
      </Html>
    </group>
  )
})

const PedestrianMesh = memo(function PedestrianMesh({ actor }: { actor: any }) {
  const pos = carlaToThree(actor.transform.location)
  const yaw = THREE.MathUtils.degToRad(-actor.transform.rotation.yaw)
  
  return (
    <group position={[pos.x, pos.y, pos.z]} rotation={[0, yaw, 0]}>
      <mesh position={[0, 0.85, 0]} castShadow>
        <capsuleGeometry args={[0.22, 0.9, 6, 12]} />
        <meshStandardMaterial color="#f97316" emissive="#9a3412" emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[0, 1.55, 0]}>
        <sphereGeometry args={[0.14, 8, 8]} />
        <meshStandardMaterial color="#fb923c" />
      </mesh>
    </group>
  )
})

const TrafficLightMesh = memo(function TrafficLightMesh({ actor }: { actor: any }) {
  const pos = carlaToThree(actor.transform.location)
  return (
    <group position={[pos.x, pos.y, pos.z]}>
      <mesh position={[0, 2.5, 0]}>
        <boxGeometry args={[0.2, 1.0, 0.2]} />
        <meshStandardMaterial color="#374151" />
      </mesh>
      <mesh position={[0, 3.2, 0]}>
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshStandardMaterial color="#eab308" emissive="#eab308" emissiveIntensity={0.8} />
      </mesh>
    </group>
  )
})

function carlaToThree(loc: { x: number; y: number; z: number }) {
  return { x: loc.x, y: loc.z, z: -loc.y }
}

export function ActorRenderer() {
  const actors = useActorStore(s => s.actors)
  const egoId = useActorStore(s => s.egoVehicleId) // check actual field name
  
  const actorList = useMemo(() => Array.from(actors.values()), [actors])
  
  return (
    <>
      {actorList.map(actor => {
        if (actor.type_id.startsWith("vehicle.")) {
          return <VehicleMesh key={actor.id} actor={actor} isEgo={actor.id === egoId} />
        }
        if (actor.type_id.startsWith("walker.")) {
          return <PedestrianMesh key={actor.id} actor={actor} />
        }
        if (actor.type_id.includes("traffic_light")) {
          return <TrafficLightMesh key={actor.id} actor={actor} />
        }
        // Skip sensors, signs, etc.
        return null
      })}
    </>
  )
}
```

### File 4: `src/components/viewport/CameraController.tsx`

4 camera modes with smooth interpolation:

```tsx
import { useRef, useEffect } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import * as THREE from "three"
import { useActorStore } from "@/stores/actorStore"
import { useUIStore } from "@/stores/uiStore"

export type CameraMode = "follow" | "birdseye" | "orbit" | "fpv"

export function CameraController() {
  const mode = useUIStore(s => s.cameraMode ?? "follow") // add cameraMode to uiStore if not exists
  const actors = useActorStore(s => s.actors)
  const egoId = useActorStore(s => s.egoVehicleId)
  const orbitRef = useRef<any>(null)
  const { camera } = useThree()
  
  const targetPos = useRef(new THREE.Vector3())
  const targetLook = useRef(new THREE.Vector3())
  
  useFrame(() => {
    if (mode === "orbit") return // OrbitControls handles this
    
    const ego = egoId ? actors.get(egoId) : null
    if (!ego) return
    
    const egoPos = new THREE.Vector3(ego.transform.location.x, ego.transform.location.z, -ego.transform.location.y)
    const yaw = THREE.MathUtils.degToRad(-ego.transform.rotation.yaw)
    
    switch (mode) {
      case "follow": {
        // Behind and above the vehicle
        const offset = new THREE.Vector3(-12, 6, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
        targetPos.current.copy(egoPos).add(offset)
        targetLook.current.copy(egoPos).add(new THREE.Vector3(0, 1, 0))
        break
      }
      case "birdseye": {
        targetPos.current.set(egoPos.x, egoPos.y + 80, egoPos.z)
        targetLook.current.copy(egoPos)
        break
      }
      case "fpv": {
        // Driver's eye position
        const fpvOffset = new THREE.Vector3(0.5, 1.7, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
        targetPos.current.copy(egoPos).add(fpvOffset)
        const lookDir = new THREE.Vector3(10, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
        targetLook.current.copy(egoPos).add(lookDir)
        break
      }
    }
    
    // Smooth interpolation
    camera.position.lerp(targetPos.current, 0.06)
    const currentLook = new THREE.Vector3()
    camera.getWorldDirection(currentLook)
    camera.lookAt(targetLook.current) // direct lookAt for responsiveness
  })
  
  // OrbitControls only active in orbit mode
  return mode === "orbit" ? <OrbitControls ref={orbitRef} makeDefault /> : null
}
```

### File 5: `src/components/viewport/CameraModeSelector.tsx`

Overlay buttons to switch camera modes:

```tsx
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Eye, Bird, Move3d, User } from "lucide-react"
import { useUIStore } from "@/stores/uiStore"
import type { CameraMode } from "./CameraController"

const modes: { mode: CameraMode; icon: typeof Eye; label: string; key: string }[] = [
  { mode: "follow", icon: Eye, label: "Follow Camera", key: "1" },
  { mode: "birdseye", icon: Bird, label: "Bird's Eye", key: "2" },
  { mode: "orbit", icon: Move3d, label: "Free Orbit", key: "3" },
  { mode: "fpv", icon: User, label: "First Person", key: "4" },
]

export function CameraModeSelector() {
  const currentMode = useUIStore(s => s.cameraMode ?? "follow")
  const setMode = useUIStore(s => s.setCameraMode) // add to uiStore if missing
  
  return (
    <div className="absolute top-2 left-2 z-10 flex gap-1">
      {modes.map(({ mode, icon: Icon, label, key }) => (
        <Tooltip key={mode}>
          <TooltipTrigger asChild>
            <Button
              variant={currentMode === mode ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs bg-background/80 backdrop-blur"
              onClick={() => setMode(mode)}
            >
              <Icon className="h-3 w-3 mr-1" />
              {key}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{label} (Press {key})</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}
```

### File 6: Update `MainViewport.tsx`

Replace the current viewport with tabs for "3D World" and "Camera Feed":

```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Maximize, Minimize } from "lucide-react"
import { WorldScene } from "./WorldScene"
import { CameraModeSelector } from "./CameraModeSelector"
// Keep existing camera fallback component

export default function MainViewport() {
  const [fullscreen, setFullscreen] = useState(false)
  const [viewMode, setViewMode] = useState<"3d" | "camera">("3d")
  
  return (
    <div className="relative h-full w-full">
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "3d" | "camera")} 
            className="absolute top-2 left-1/2 -translate-x-1/2 z-10">
        <TabsList className="bg-background/80 backdrop-blur">
          <TabsTrigger value="3d">3D World</TabsTrigger>
          <TabsTrigger value="camera">Camera</TabsTrigger>
        </TabsList>
      </Tabs>
      
      {viewMode === "3d" && <CameraModeSelector />}
      
      <div className="h-full w-full">
        {viewMode === "3d" ? <WorldScene /> : <CameraFallback />}
      </div>
      
      <Button 
        variant="outline" size="icon" 
        className="absolute top-2 right-2 z-10 bg-background/80 backdrop-blur h-7 w-7"
        onClick={() => setFullscreen(!fullscreen)}
      >
        {fullscreen ? <Minimize className="h-3 w-3" /> : <Maximize className="h-3 w-3" />}
      </Button>
    </div>
  )
}
```

---

## Store Changes Required

Add `cameraMode` to `uiStore.ts`:

```typescript
// In uiStore.ts, add to the state:
cameraMode: CameraMode  // default: "follow"
setCameraMode: (mode: CameraMode) => void
```

Add keyboard shortcut handling in `useKeyboardShortcuts.ts`:
```typescript
case "1": uiStore.setCameraMode("follow"); break
case "2": uiStore.setCameraMode("birdseye"); break
case "3": uiStore.setCameraMode("orbit"); break
case "4": uiStore.setCameraMode("fpv"); break
```

---

## Playwright Verification

```typescript
test("3D viewport shows moving actors", async ({ page }) => {
  await page.goto("http://127.0.0.1:58336")
  await page.waitForTimeout(5000)
  
  // Switch to 3D World tab
  await page.click("text=3D World")
  await page.waitForTimeout(3000)
  
  // Take first screenshot
  await page.screenshot({ path: "/tmp/carla-3d-t1.png" })
  
  // Wait and take second screenshot
  await page.waitForTimeout(3000)
  await page.screenshot({ path: "/tmp/carla-3d-t2.png" })
  
  // The screenshots should be different (actors are moving)
  // Verify manually by opening both screenshots
  
  // Check that the Three.js canvas exists
  const threeCanvas = page.locator("canvas").first()
  expect(await threeCanvas.boundingBox()).not.toBeNull()
  
  // Check canvas is not all black
  const pixel = await threeCanvas.evaluate((el: HTMLCanvasElement) => {
    const ctx = el.getContext("webgl2") || el.getContext("webgl")
    if (!ctx) return [0, 0, 0, 0]
    const pixels = new Uint8Array(4)
    ctx.readPixels(el.width / 2, el.height / 2, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, pixels)
    return Array.from(pixels)
  })
  // WebGL pixel should have some color (not all zero = black void)
  const brightness = pixel[0] + pixel[1] + pixel[2]
  expect(brightness, "3D viewport is all black — scene may not be rendering").toBeGreaterThan(0)
})
```

---

## Acceptance Criteria

1. 3D viewport shows colored box meshes for vehicles (blue for NPC, green for ego)
2. Pedestrians visible as orange capsules
3. Actors move in real-time at 20Hz (compare two screenshots)
4. Follow camera tracks the ego vehicle smoothly
5. Camera mode switching works via buttons and keyboard (1/2/3/4)
6. Ground grid is visible
7. Performance: 30+ FPS with <200 actors
8. No crashes or WebGL errors in console
9. **All verified with Playwright screenshots**
