import { Suspense, useMemo, useRef } from "react"
import * as THREE from "three"
import { useGLTF } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import { useSimulationStore } from "@/stores/simulationStore"
import { VEGETATION_MODELS } from "../CarlaAssetLoader"
import { computeVegetationPlacement } from "../vegetation-placement"
import { EnvObj, c2t } from "./shared"
import { TREE_TRUNK } from "../scene-palette"

// iter-14-revisit-runtime-veg-bldg: shared cull radius + sensitivity
// for the Vegetation runtime cull. Same 300m anchor as the
// GltfInstanced opt-ins. Sensitivity (camera-move-meters before
// re-evaluation) keeps the cost amortized across user pans.
const RUNTIME_CULL_RADIUS = 300
const RUNTIME_CULL_SENSITIVITY = 5

/** Extract every vegetation mesh part (trunk / leaves / planter) plus the
 *  whole model bounds. Using only the first mesh renders detached leaf
 *  cards without the trunk — that's where "floating foliage" comes from. */
function extractVegetationModel(scene: THREE.Group): {
  parts: { geometry: THREE.BufferGeometry; material: THREE.Material }[]
  bounds: { minY: number; height: number; radius: number }
} | null {
  scene.updateMatrixWorld(true)
  const bounds = new THREE.Box3()
  const parts: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = []
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const material = Array.isArray(child.material)
        ? child.material.find(
            (entry): entry is THREE.Material => entry instanceof THREE.Material,
          ) ?? null
        : child.material
      if (!(material instanceof THREE.Material)) return

      const geometry = child.geometry.clone()
      geometry.applyMatrix4(child.matrixWorld)
      geometry.computeBoundingBox()
      if (geometry.boundingBox) bounds.union(geometry.boundingBox)
      parts.push({ geometry, material })
    }
  })
  if (parts.length === 0) return null
  const size = bounds.getSize(new THREE.Vector3())
  return {
    parts,
    bounds: {
      minY: bounds.min.y,
      height: Math.max(size.y, 1),
      radius: Math.max(size.x, size.z, 1),
    },
  }
}

/** Load 4 tree glTF variants and bucket vegetation objects across them, then
 *  render each bucket as InstancedMesh groups for perf. */
function GltfVegetation({ objects }: { objects: EnvObj[] }) {
  const loaded = useGLTF(VEGETATION_MODELS as string[]) as (
    import("three-stdlib").GLTF & import("@react-three/fiber").ObjectMap
  )[]

  // iter-14-revisit-runtime-veg-bldg: refs to all built InstancedMeshes
  // + their per-instance transforms, so useFrame can re-evaluate
  // visibility against the live camera each tick.
  const meshDataRef = useRef<Array<{
    mesh: THREE.InstancedMesh
    transforms: ReturnType<typeof computeVegetationPlacement>[]
  }>>([])
  const lastCullPos = useRef(new THREE.Vector3(Infinity, Infinity, Infinity))
  // iter-07-revisit-wind: shared shader uniforms for foliage wind sway.
  // uTime increments each frame; uWindIntensity is read from the bridge
  // weather broadcast. Kept as ref objects so onBeforeCompile's
  // shader.uniforms.X = uniformRef assignment shares the live value
  // across all vegetation materials (all tree buckets sway together).
  const uTime = useRef({ value: 0 })
  const uWindIntensity = useRef({ value: 0 })
  const weatherWind = useSimulationStore((s) => s.weather?.wind_intensity ?? 0)

  const group = useMemo(() => {
    const g = new THREE.Group()
    const models = loaded.map((l) => l.scene)
    meshDataRef.current = []

    const variants = models
      .map((s) => extractVegetationModel(s))
      .filter(Boolean) as {
      parts: { geometry: THREE.BufferGeometry; material: THREE.Material }[]
      bounds: { minY: number; height: number; radius: number }
    }[]

    if (variants.length === 0) return g

    // iter-14-revisit-runtime-veg-bldg: build buckets at FULL objects
    // count (no static pre-filter). Runtime useFrame zero-scales
    // out-of-range instances each tick.
    const buckets: EnvObj[][] = variants.map(() => [])
    let s = 54321
    const rand = () => {
      s = (s * 16807 + 0) % 2147483647
      return (s & 0x7fffffff) / 0x7fffffff
    }
    for (const obj of objects) {
      const idx = Math.floor(rand() * variants.length)
      buckets[idx].push(obj)
    }

    const dummy = new THREE.Object3D()

    for (let v = 0; v < variants.length; v++) {
      const { parts, bounds } = variants[v]
      const bucket = buckets[v]
      if (bucket.length === 0) continue

      const transforms = bucket.map((obj) =>
        computeVegetationPlacement(obj, bounds, rand() * Math.PI * 2),
      )

      for (const part of parts) {
        const mat = part.material.clone()
        if (mat instanceof THREE.MeshStandardMaterial) {
          mat.roughness = 0.85
        }
        // iter-07-revisit-wind: patch the vertex shader to sway the
        // foliage geometry. Higher local-y vertices (treetops) sway
        // more; ground-level (trunk base) stays anchored. Sway
        // amplitude scales with wind intensity from weather broadcast.
        mat.onBeforeCompile = (shader) => {
          shader.uniforms.uTime = uTime.current
          shader.uniforms.uWindIntensity = uWindIntensity.current
          shader.vertexShader =
            `uniform float uTime;\nuniform float uWindIntensity;\n` +
            shader.vertexShader.replace(
              "#include <begin_vertex>",
              `
              #include <begin_vertex>
              // Height-weighted wind sway: only upper foliage sways,
              // trunk base stays fixed. World-XZ-offset in sin() so
              // neighboring trees don't all sway in lockstep.
              float windAmp = uWindIntensity * max(transformed.y * 0.06, 0.0);
              transformed.x += sin(uTime * 1.3 + position.x * 0.08 + position.z * 0.08) * windAmp;
              transformed.z += cos(uTime * 0.9 + position.x * 0.08) * windAmp * 0.55;
              `,
            )
        }
        mat.customProgramCacheKey = () => "vegetation-wind-v1"

        const mesh = new THREE.InstancedMesh(part.geometry, mat, bucket.length)

        for (let i = 0; i < transforms.length; i++) {
          const transform = transforms[i]
          dummy.position.set(
            transform.position.x,
            transform.position.y,
            transform.position.z,
          )
          dummy.rotation.set(0, transform.rotationY, 0)
          dummy.scale.set(
            transform.scale.x,
            transform.scale.y,
            transform.scale.z,
          )
          dummy.updateMatrix()
          mesh.setMatrixAt(i, dummy.matrix)
        }

        mesh.instanceMatrix.needsUpdate = true
        mesh.castShadow = true
        mesh.receiveShadow = true
        g.add(mesh)
        meshDataRef.current.push({ mesh, transforms })
      }
    }

    return g
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objects, loaded])

  useFrame(({ camera }, delta) => {
    // iter-07-revisit-wind: advance shader time + push latest wind
    // intensity (normalized 0-1) into the shared uniforms. Happens
    // every frame regardless of camera-move throttle since wind
    // animation is time-driven, not camera-driven.
    uTime.current.value += delta
    uWindIntensity.current.value = weatherWind / 100
    if (camera.position.distanceTo(lastCullPos.current) < RUNTIME_CULL_SENSITIVITY) return
    lastCullPos.current.copy(camera.position)
    const r2 = RUNTIME_CULL_RADIUS * RUNTIME_CULL_RADIUS
    const dummy = new THREE.Object3D()
    for (const data of meshDataRef.current) {
      for (let i = 0; i < data.transforms.length; i++) {
        const t = data.transforms[i]
        // Transforms already in three.js coords (computeVegetationPlacement
        // applies c2t internally); compare directly to camera.position.
        const dx = t.position.x - camera.position.x
        const dy = t.position.y - camera.position.y
        const dz = t.position.z - camera.position.z
        const inRange = (dx * dx + dy * dy + dz * dz) <= r2
        if (inRange) {
          dummy.position.set(t.position.x, t.position.y, t.position.z)
          dummy.rotation.set(0, t.rotationY, 0)
          dummy.scale.set(t.scale.x, t.scale.y, t.scale.z)
        } else {
          dummy.position.set(0, 0, 0)
          dummy.rotation.set(0, 0, 0)
          dummy.scale.set(0, 0, 0)
        }
        dummy.updateMatrix()
        data.mesh.setMatrixAt(i, dummy.matrix)
      }
      data.mesh.instanceMatrix.needsUpdate = true
    }
  })

  return <primitive object={group} />
}

/** Procedural fallback vegetation: trunk + canopy spheres. Honestly
 *  abstract-looking so the user doesn't mistake these for real UE trees. */
function ProceduralVegetation({ objects }: { objects: EnvObj[] }) {
  const group = useMemo(() => {
    const g = new THREE.Group()

    const trunkGeo = new THREE.CylinderGeometry(0.08, 0.15, 1, 6)
    const trunkMat = new THREE.MeshStandardMaterial({
      color: TREE_TRUNK,
      roughness: 0.95,
      metalness: 0.0,
    })
    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, objects.length)

    const canopyGeo = new THREE.SphereGeometry(1, 8, 6)
    const canopyMat = new THREE.MeshStandardMaterial({
      roughness: 0.85,
      metalness: 0.0,
    })
    const canopyMesh = new THREE.InstancedMesh(canopyGeo, canopyMat, objects.length)

    const dummy = new THREE.Object3D()
    let s = 12345
    const rand = () => {
      s = (s * 16807 + 0) % 2147483647
      return (s & 0x7fffffff) / 0x7fffffff
    }

    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i]
      const pos = c2t(obj.t.x, obj.t.y, obj.t.z)
      const baseH = Math.max(obj.b.ez * 2, 1)
      const baseW = Math.max(Math.max(obj.b.ex, obj.b.ey) * 2, 0.5)
      const hVariation = 0.8 + rand() * 0.4
      const h = baseH * hVariation
      const w = baseW * (0.85 + rand() * 0.3)

      const trunkH = h * 0.35
      dummy.position.set(pos.x, pos.y + trunkH * 0.5, pos.z)
      dummy.rotation.set(0, rand() * Math.PI * 2, 0)
      dummy.scale.set(w * 0.08, trunkH, w * 0.08)
      dummy.updateMatrix()
      trunkMesh.setMatrixAt(i, dummy.matrix)

      const canopyY = pos.y + trunkH + h * 0.25
      const canopyR = w * 0.35
      dummy.position.set(pos.x, canopyY, pos.z)
      dummy.scale.set(canopyR, h * 0.35, canopyR)
      dummy.updateMatrix()
      canopyMesh.setMatrixAt(i, dummy.matrix)

      // Muted olive-green palette — the old `(greenBase*0.4, greenBase,
      // greenBase*0.18)` produced saturated primary greens that looked
      // like cartoon trees next to CARLA's desaturated UE foliage. Pull
      // the red channel up and the green down so the leaves read as
      // olive / sage rather than toy-plastic green.
      const greenBase = 0.28 + rand() * 0.22
      canopyMesh.setColorAt(
        i,
        new THREE.Color(greenBase * 0.72, greenBase * 0.95, greenBase * 0.38),
      )
    }

    trunkMesh.instanceMatrix.needsUpdate = true
    canopyMesh.instanceMatrix.needsUpdate = true
    if (canopyMesh.instanceColor) canopyMesh.instanceColor.needsUpdate = true
    trunkMesh.castShadow = true
    canopyMesh.castShadow = true
    g.add(trunkMesh)
    g.add(canopyMesh)
    return g
  }, [objects])

  return <primitive object={group} />
}

export function Vegetation({ objects }: { objects: EnvObj[] }) {
  if (objects.length === 0) return null
  return (
    <Suspense fallback={<ProceduralVegetation objects={objects} />}>
      <GltfVegetation objects={objects} />
    </Suspense>
  )
}
