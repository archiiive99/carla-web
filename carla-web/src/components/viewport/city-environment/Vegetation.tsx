import { Suspense, useMemo } from "react"
import * as THREE from "three"
import { useGLTF } from "@react-three/drei"
import { VEGETATION_MODELS } from "../CarlaAssetLoader"
import { computeVegetationPlacement } from "../vegetation-placement"
import { EnvObj, c2t } from "./shared"
import { TREE_TRUNK } from "../scene-palette"

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

  const group = useMemo(() => {
    const g = new THREE.Group()
    const models = loaded.map((l) => l.scene)

    const variants = models
      .map((s) => extractVegetationModel(s))
      .filter(Boolean) as {
      parts: { geometry: THREE.BufferGeometry; material: THREE.Material }[]
      bounds: { minY: number; height: number; radius: number }
    }[]

    if (variants.length === 0) return g

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
      }
    }

    return g
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objects, loaded])

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
