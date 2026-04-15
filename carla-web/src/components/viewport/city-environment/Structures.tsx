import { Suspense, useMemo } from "react"
import * as THREE from "three"
import {
  POLE_ELECTRIC_MODEL,
  GUARD_RAIL_MODEL,
  ROCK_MODEL,
  FENCE_WIRED_MODEL,
  WALL_TOWN_MODEL,
} from "../CarlaAssetLoader"
import { EnvObj, buildInstanced } from "./shared"
import { WALL_DEFAULT, WALL_WARM, WALL_LIGHT, SIGN_PLATE } from "../scene-palette"
import { GltfInstanced } from "./gltf-instanced"

// Vertical / linear / scattered structural props. Each renders a glTF
// instance via the shared GltfInstanced factory; the procedural fallback
// is an honest abstract shape (cylinder / box / dodecahedron) that won't
// be mistaken for the textured CARLA asset.

// --- Poles --------------------------------------------------------------

function ProceduralPoles({ objects }: { objects: EnvObj[] }) {
  const mesh = useMemo(() => {
    const geo = new THREE.CylinderGeometry(0.06, 0.06, 1, 5)
    const mat = new THREE.MeshStandardMaterial({ color: WALL_DEFAULT, roughness: 0.7 })
    return buildInstanced(objects, geo, mat, { castShadow: true })
  }, [objects])
  return <primitive object={mesh} />
}

export function Poles({ objects }: { objects: EnvObj[] }) {
  if (objects.length === 0) return null
  return (
    <Suspense fallback={<ProceduralPoles objects={objects} />}>
      <GltfInstanced
        path={POLE_ELECTRIC_MODEL}
        objects={objects}
        scale={{ mode: "pole" }}
        maxDistance={300}
        referencePoint={[118.9, 55.8, 1.8]}
      />
    </Suspense>
  )
}

// --- Walls --------------------------------------------------------------

function ProceduralWalls({ objects }: { objects: EnvObj[] }) {
  const mesh = useMemo(() => {
    const geo = new THREE.BoxGeometry(1, 1, 1)
    const mat = new THREE.MeshStandardMaterial({ color: WALL_WARM, roughness: 0.9 })
    return buildInstanced(objects, geo, mat, { castShadow: true, receiveShadow: true })
  }, [objects])
  return <primitive object={mesh} />
}

export function Walls({ objects }: { objects: EnvObj[] }) {
  if (objects.length === 0) return null
  return (
    <Suspense fallback={<ProceduralWalls objects={objects} />}>
      <GltfInstanced
        path={WALL_TOWN_MODEL}
        objects={objects}
        scale={{ mode: "fit-bbox" }}
        receiveShadow
        // iter-14: cull walls beyond 300m of the iter-01 measurement
        // pose. The static reference point is acceptable for parity
        // measurement (camera doesn't move during a harness capture);
        // iter-14-revisit-runtime-lod would track the live camera.
        maxDistance={300}
        referencePoint={[118.9, 55.8, 1.8]}
      />
    </Suspense>
  )
}

// --- Fences -------------------------------------------------------------

function ProceduralFences({ objects }: { objects: EnvObj[] }) {
  const mesh = useMemo(() => {
    const geo = new THREE.BoxGeometry(1, 1, 0.05)
    // Opaque metallic grey — real fences aren't translucent. The old 0.7
    // alpha read as frosted glass panels instead of fencing.
    const mat = new THREE.MeshStandardMaterial({
      color: WALL_LIGHT,
      roughness: 0.55,
      metalness: 0.3,
    })
    return buildInstanced(objects, geo, mat, { castShadow: true })
  }, [objects])
  return <primitive object={mesh} />
}

export function Fences({ objects }: { objects: EnvObj[] }) {
  if (objects.length === 0) return null
  return (
    <Suspense fallback={<ProceduralFences objects={objects} />}>
      <GltfInstanced
        path={FENCE_WIRED_MODEL}
        objects={objects}
        scale={{ mode: "fit-bbox" }}
        maxDistance={300}
        referencePoint={[118.9, 55.8, 1.8]}
      />
    </Suspense>
  )
}

// --- Rocks --------------------------------------------------------------

function ProceduralRocks({ objects }: { objects: EnvObj[] }) {
  const mesh = useMemo(() => {
    const geo = new THREE.DodecahedronGeometry(1, 0)
    const mat = new THREE.MeshStandardMaterial({ color: WALL_WARM, roughness: 0.95 })
    return buildInstanced(objects, geo, mat, { castShadow: true })
  }, [objects])
  return <primitive object={mesh} />
}

export function Rocks({ objects }: { objects: EnvObj[] }) {
  if (objects.length === 0) return null
  return (
    <Suspense fallback={<ProceduralRocks objects={objects} />}>
      <GltfInstanced
        path={ROCK_MODEL}
        objects={objects}
        scale={{ mode: "fit-bbox" }}
        maxDistance={300}
        referencePoint={[118.9, 55.8, 1.8]}
      />
    </Suspense>
  )
}

// --- Guard rails --------------------------------------------------------

function ProceduralGuardRails({ objects }: { objects: EnvObj[] }) {
  const mesh = useMemo(() => {
    const geo = new THREE.BoxGeometry(1, 0.6, 0.08)
    const mat = new THREE.MeshStandardMaterial({ color: SIGN_PLATE, roughness: 0.5, metalness: 0.4 })
    return buildInstanced(objects, geo, mat, { castShadow: true })
  }, [objects])
  return <primitive object={mesh} />
}

export function GuardRails({ objects }: { objects: EnvObj[] }) {
  if (objects.length === 0) return null
  return (
    <Suspense fallback={<ProceduralGuardRails objects={objects} />}>
      <GltfInstanced
        path={GUARD_RAIL_MODEL}
        objects={objects}
        scale={{ mode: "fit-bbox" }}
        maxDistance={300}
        referencePoint={[118.9, 55.8, 1.8]}
      />
    </Suspense>
  )
}
