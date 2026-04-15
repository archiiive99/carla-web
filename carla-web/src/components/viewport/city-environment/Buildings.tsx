import { Suspense, useMemo, useRef } from "react"
import * as THREE from "three"
import { useGLTF } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import { getBuildingModelPath } from "../CarlaAssetLoader"
import { EnvObj, SafeRender, c2t, yawRad } from "./shared"
import { buildProceduralBuildingGroup } from "./build-procedural-buildings"

// iter-14-revisit-runtime-bldg-only: per-building runtime cull
// constants. Same 300m / 5m anchor-and-sensitivity used by the
// GltfInstanced + Vegetation runtime opt-ins.
const RUNTIME_CULL_RADIUS = 300
const RUNTIME_CULL_RADIUS_SQ = RUNTIME_CULL_RADIUS * RUNTIME_CULL_RADIUS
const RUNTIME_CULL_SENSITIVITY = 5

/** Renders a single building that matched a glTF model via getBuildingModelPath.
 *
 *  iter-14-revisit-runtime-bldg-only: each rendered GltfBuilding holds a
 *  useFrame that toggles its primitive's `visible` based on distance to
 *  the live camera. Throttled by camera-move-≥5m. With ~130 buildings
 *  loaded this is ~130 useFrame closures, each doing one distance
 *  compare per camera-move-eval — cheap. */
function GltfBuilding({ path, obj }: { path: string; obj: EnvObj }) {
  const { scene } = useGLTF(path)
  const primRef = useRef<THREE.Object3D | null>(null)
  const lastCullPos = useRef(new THREE.Vector3(Infinity, Infinity, Infinity))
  const cloned = useMemo(() => {
    const c = scene.clone(true)
    c.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    return c
  }, [scene])

  const pos = c2t(obj.b.x, obj.b.y, obj.b.z)

  useFrame(({ camera }) => {
    if (!primRef.current) return
    if (camera.position.distanceTo(lastCullPos.current) < RUNTIME_CULL_SENSITIVITY) return
    lastCullPos.current.copy(camera.position)
    const dx = pos.x - camera.position.x
    const dy = pos.y - camera.position.y
    const dz = pos.z - camera.position.z
    primRef.current.visible = (dx * dx + dy * dy + dz * dz) <= RUNTIME_CULL_RADIUS_SQ
  })

  return (
    <primitive
      ref={primRef}
      object={cloned}
      position={[pos.x, pos.y, pos.z]}
      rotation={[0, yawRad(obj.b.yaw), 0]}
    />
  )
}

function GltfBuildingBatch({ gltfBuildings }: { gltfBuildings: { obj: EnvObj; path: string }[] }) {
  if (gltfBuildings.length === 0) return null
  return (
    <>
      {gltfBuildings.map((b, i) => (
        <Suspense key={i} fallback={null}>
          <SafeRender>
            <GltfBuilding path={b.path} obj={b.obj} />
          </SafeRender>
        </Suspense>
      ))}
    </>
  )
}

/** Buildings layer. Splits CARLA env-object buildings into two paths:
 *
 *   1. **GltfBuilding** — when a CARLA blueprint name maps to a known
 *      exported glTF, render the actual asset. Faithful.
 *   2. **Procedural placeholder** — otherwise, render a stacked-box mass
 *      (main body + ground-floor wrap + optional setback + roof) coloured
 *      from the desaturated building palette and textured with the
 *      placeholder wall/ground textures. Honest: massing is real CARLA
 *      bbox data, but no fake windows / storefronts / paint colour are
 *      invented. The mesh-construction lives in
 *      `build-procedural-buildings.ts` so this component file only carries
 *      the React boundary. */
export function Buildings({ objects }: { objects: EnvObj[] }) {
  const { gltfBuildings, proceduralBuildings } = useMemo(() => {
    // iter-14-revisit-runtime-no-entry-filter: dropped the iter-01-
    // anchored entry filter. With per-building runtime cull (added
    // iter-14-revisit-runtime-bldg-only) handling visibility, the
    // entry filter was a memory-vs-coverage trade-off that limited
    // interactive use to within iter-01 ±300m. Lifting it means all
    // gltf buildings mount (~130 useGLTF calls + useFrame closures);
    // the per-building runtime cull keeps the visible set bounded by
    // distance-to-live-camera. Procedural buildings still un-filtered
    // here too (their internal InstancedMesh is one mesh; the cost
    // doesn't scale with mounted-React-component count).
    const gltf: { obj: EnvObj; path: string }[] = []
    const procedural: EnvObj[] = []
    for (const obj of objects) {
      const path = getBuildingModelPath(obj.name)
      if (path) {
        gltf.push({ obj, path })
      } else {
        procedural.push(obj)
      }
    }
    return { gltfBuildings: gltf, proceduralBuildings: procedural }
  }, [objects])

  const meshes = useMemo(
    () => buildProceduralBuildingGroup(proceduralBuildings),
    [proceduralBuildings],
  )
  const lastProcCullPos = useRef(new THREE.Vector3(Infinity, Infinity, Infinity))

  // iter-14-revisit-runtime-procedural-bldg: per-camera-move cull for
  // every InstancedMesh in the procedural-building group. Each mesh
  // exposes its source buildings + original matrices via userData so
  // we can restore in-range entries and zero-scale out-of-range.
  useFrame(({ camera }) => {
    if (!meshes) return
    if (camera.position.distanceTo(lastProcCullPos.current) < RUNTIME_CULL_SENSITIVITY) return
    lastProcCullPos.current.copy(camera.position)
    const r2 = RUNTIME_CULL_RADIUS_SQ
    const dummy = new THREE.Object3D()
    const mat = new THREE.Matrix4()
    const zero = new THREE.Matrix4().makeScale(0, 0, 0)
    meshes.traverse((child) => {
      if (!(child instanceof THREE.InstancedMesh)) return
      const srcBuildings: EnvObj[] | undefined = child.userData.cullSourceBuildings
      const originals: Float32Array | undefined = child.userData.originalMatrices
      if (!srcBuildings || !originals) return
      for (let i = 0; i < srcBuildings.length; i++) {
        const obj = srcBuildings[i]
        const pos = c2t(obj.b.x, obj.b.y, obj.b.z)
        const dx = pos.x - camera.position.x
        const dy = pos.y - camera.position.y
        const dz = pos.z - camera.position.z
        if ((dx * dx + dy * dy + dz * dz) <= r2) {
          mat.fromArray(originals, i * 16)
          child.setMatrixAt(i, mat)
        } else {
          child.setMatrixAt(i, zero)
        }
      }
      child.instanceMatrix.needsUpdate = true
    })
  })

  return (
    <>
      {meshes && <primitive object={meshes} />}
      <GltfBuildingBatch gltfBuildings={gltfBuildings} />
    </>
  )
}
