import { useMemo, useRef } from "react"
import * as THREE from "three"
import { useGLTF } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import { EnvObj, c2t, yawRad, extractGeoAndMat } from "./shared"

// Scale modes CARLA props use when falling back to a single-mesh glTF.
// Most props (wall / fence / rock / guardrail) scale isotropically from
// their axis-aligned bounding box in CARLA meters, with a 0.005 factor
// that matches the UE5-cm-to-m-to-mesh transform. Poles are vertical-only.
// Lights/signs use a fixed 1:1 scale because their meshes are already in
// meters and the CARLA bbox only describes the base pole.
export type GltfScale =
  | { mode: "fit-bbox" }
  | { mode: "pole" }
  | { mode: "identity" }

function applyScale(
  dummy: THREE.Object3D,
  obj: EnvObj,
  mode: GltfScale["mode"],
) {
  if (mode === "identity") {
    dummy.scale.set(1, 1, 1)
    return
  }
  if (mode === "pole") {
    const h = Math.max(obj.b.ez * 2, 3)
    dummy.scale.set(0.01, h * 0.005, 0.01)
    return
  }
  const ex = Math.max(obj.b.ex * 2, 0.5) * 0.005
  const ey = Math.max(obj.b.ey * 2, 0.5) * 0.005
  const ez = Math.max(obj.b.ez * 2, 0.5) * 0.005
  dummy.scale.set(ex, ez, ey)
}

/** Generic single-mesh-glTF instancer for prop categories. The caller picks
 *  the bbox→mesh scale convention (`fit-bbox` / `pole` / `identity`) since
 *  CARLA's prop categories don't share a single transform rule.
 *
 *  iter-14: optional `maxDistance` param performs build-time distance
 *  culling — any instance whose CARLA world position is more than
 *  `maxDistance` meters from `referencePoint` (default world origin) is
 *  skipped. The InstancedMesh count drops, the GPU draws fewer
 *  instances per frame. Tradeoff: the culling is static (computed
 *  once per scene mount), so a moving camera doesn't repopulate
 *  instances that come back into range. Acceptable for one-camera
 *  parity work; iter-14-revisit-runtime-lod would add per-frame
 *  visibility updates. */
export function GltfInstanced({
  path,
  objects,
  scale,
  receiveShadow = false,
  maxDistance = Infinity,
  referencePoint = [0, 0, 0],
  runtimeCull = false,
  runtimeCullSensitivity = 5,
}: {
  path: string
  objects: EnvObj[]
  scale: GltfScale
  receiveShadow?: boolean
  maxDistance?: number
  referencePoint?: [number, number, number]
  /** iter-14-revisit-runtime-lod: when true, ignore the static
   *  referencePoint and re-evaluate per-instance visibility against the
   *  live camera position each frame (throttled by
   *  runtimeCullSensitivity meters). Builds InstancedMesh at full
   *  objects.length and toggles per-instance scale instead of filtering
   *  at build time. */
  runtimeCull?: boolean
  /** Re-evaluate the runtime cull only when the camera has moved this
   *  many meters since the last evaluation. Default 5m. */
  runtimeCullSensitivity?: number
}) {
  const { scene } = useGLTF(path)
  const meshRef = useRef<THREE.InstancedMesh | null>(null)
  const lastCullPos = useRef(new THREE.Vector3(Infinity, Infinity, Infinity))

  const group = useMemo(() => {
    const g = new THREE.Group()
    const extracted = extractGeoAndMat(scene)
    if (!extracted) return g

    // iter-14: build-time distance cull (when runtimeCull is OFF).
    // iter-14-revisit-runtime-lod: when runtimeCull is ON, keep all
    // instances at build time and let useFrame toggle per-instance
    // visibility against the live camera.
    const [refX, refY, refZ] = referencePoint
    const r2 = maxDistance * maxDistance
    const kept: EnvObj[] = (runtimeCull || maxDistance === Infinity)
      ? objects
      : objects.filter((obj) => {
          const dx = obj.b.x - refX
          const dy = obj.b.y - refY
          const dz = obj.b.z - refZ
          return (dx * dx + dy * dy + dz * dz) <= r2
        })

    const mesh = new THREE.InstancedMesh(
      extracted.geometry,
      extracted.material,
      kept.length,
    )
    const dummy = new THREE.Object3D()

    for (let i = 0; i < kept.length; i++) {
      const obj = kept[i]
      const pos = c2t(obj.b.x, obj.b.y, obj.b.z)
      dummy.position.set(pos.x, pos.y, pos.z)
      dummy.rotation.set(0, yawRad(obj.b.yaw), 0)
      applyScale(dummy, obj, scale.mode)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }

    mesh.instanceMatrix.needsUpdate = true
    mesh.castShadow = true
    if (receiveShadow) mesh.receiveShadow = true
    g.add(mesh)
    meshRef.current = mesh
    return g
  }, [objects, scene, scale.mode, receiveShadow, maxDistance, referencePoint, runtimeCull])

  useFrame(({ camera }) => {
    if (!runtimeCull || !meshRef.current) return
    if (camera.position.distanceTo(lastCullPos.current) < runtimeCullSensitivity) return
    lastCullPos.current.copy(camera.position)

    const r2 = maxDistance * maxDistance
    const dummy = new THREE.Object3D()
    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i]
      const pos = c2t(obj.b.x, obj.b.y, obj.b.z)
      const dx = pos.x - camera.position.x
      const dy = pos.y - camera.position.y
      const dz = pos.z - camera.position.z
      const inRange = (dx * dx + dy * dy + dz * dz) <= r2
      if (inRange) {
        dummy.position.set(pos.x, pos.y, pos.z)
        dummy.rotation.set(0, yawRad(obj.b.yaw), 0)
        applyScale(dummy, obj, scale.mode)
      } else {
        // Hide by zero-scale; cheaper than removing-and-re-adding.
        dummy.scale.set(0, 0, 0)
        dummy.position.set(0, 0, 0)
        dummy.rotation.set(0, 0, 0)
      }
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)
    }
    meshRef.current.instanceMatrix.needsUpdate = true
  })

  return <primitive object={group} />
}
