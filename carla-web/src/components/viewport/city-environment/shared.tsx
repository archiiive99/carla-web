import React from "react"
import * as THREE from "three"
import {
  carlaToThreePoint,
  carlaYawToThreeRadians,
} from "../vegetation-placement"

// ---------- types ----------

// MapEnv + EnvObj live in src/types/carla.ts so that both the city-env
// components AND the CarlaApi client share one source of truth. These
// re-exports are kept for backward compat across the city-environment
// siblings that already import from "./shared".
import type { MapEnvironment } from "@/types/carla"
export type MapEnv = MapEnvironment
export type EnvObj = MapEnvironment["buildings"][number]

// ---------- coordinate conversion ----------

export function c2t(x: number, y: number, z: number): THREE.Vector3 {
  const point = carlaToThreePoint(x, y, z)
  return new THREE.Vector3(point.x, point.y, point.z)
}

export function yawRad(yaw: number) {
  return carlaYawToThreeRadians(yaw)
}

// ---------- error isolation ----------

/** Isolates each child so a crash in one category doesn't kill everything. */
export class SafeRender extends React.Component<
  { children: React.ReactNode },
  { error: boolean }
> {
  state = { error: false }
  static getDerivedStateFromError() {
    return { error: true }
  }
  componentDidCatch(e: Error) {
    console.warn("[CityEnv]", e.message)
  }
  render() {
    return this.state.error ? null : this.props.children
  }
}

// Placeholder textures and the building palette live in their own files so
// shared.tsx stays focused on types, coord helpers, error isolation, and
// mesh building blocks.
export {
  createBuildingTexture,
  createGroundFloorTexture,
  createRoadTexture,
} from "./placeholder-textures"
export { getBuildingBaseColor } from "./building-palette"

// ---------- glTF mesh extraction ----------

/** Pull the first renderable Mesh out of a glTF scene and return its
 *  geometry + material. Many of the "procedural + glTF fallback" categories
 *  (poles, walls, fences, rocks, guard-rails) use a single-mesh glTF with
 *  one material, so this is enough; vegetation has multi-part canopy/trunk
 *  and uses a richer extractor in its own module. */
export function extractGeoAndMat(scene: THREE.Group): {
  geometry: THREE.BufferGeometry
  material: THREE.Material
} | null {
  scene.updateMatrixWorld(true)
  for (const child of scene.children) {
    const found = findFirstMesh(child)
    if (found) return found
  }
  return findFirstMesh(scene)
}

function findFirstMesh(node: THREE.Object3D): {
  geometry: THREE.BufferGeometry
  material: THREE.Material
} | null {
  if (node instanceof THREE.Mesh) {
    const mat = Array.isArray(node.material)
      ? node.material.find(
          (entry): entry is THREE.Material => entry instanceof THREE.Material,
        )
      : node.material
    if (!mat || !(mat instanceof THREE.Material)) return null
    const geometry = node.geometry.clone()
    geometry.applyMatrix4(node.matrixWorld)
    return { geometry, material: mat }
  }
  for (const child of node.children) {
    const found = findFirstMesh(child)
    if (found) return found
  }
  return null
}

// ---------- instanced mesh builder ----------

export function buildInstanced(
  objects: EnvObj[],
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  opts?: {
    scaleFromBBox?: boolean
    yOffset?: number
    colorFn?: (i: number, obj: EnvObj) => THREE.Color
    castShadow?: boolean
    receiveShadow?: boolean
  },
): THREE.InstancedMesh {
  if (objects.length === 0) {
    return new THREE.InstancedMesh(geo, mat, 0)
  }
  const mesh = new THREE.InstancedMesh(geo, mat, objects.length)
  const dummy = new THREE.Object3D()

  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i]
    const pos = c2t(obj.b.x, obj.b.y, obj.b.z)
    dummy.position.set(pos.x, pos.y + (opts?.yOffset ?? 0), pos.z)
    dummy.rotation.set(0, yawRad(obj.b.yaw), 0)

    if (opts?.scaleFromBBox !== false) {
      dummy.scale.set(
        Math.max(obj.b.ex * 2, 0.5),
        Math.max(obj.b.ez * 2, 0.5),
        Math.max(obj.b.ey * 2, 0.5),
      )
    }

    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)

    if (opts?.colorFn) {
      mesh.setColorAt(i, opts.colorFn(i, obj))
    }
  }

  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.castShadow = opts?.castShadow ?? false
  mesh.receiveShadow = opts?.receiveShadow ?? false
  return mesh
}
