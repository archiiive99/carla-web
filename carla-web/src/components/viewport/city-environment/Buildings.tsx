import { Suspense, useMemo } from "react"
import * as THREE from "three"
import { useGLTF } from "@react-three/drei"
import { getBuildingModelPath } from "../CarlaAssetLoader"
import { EnvObj, SafeRender, c2t, yawRad } from "./shared"
import { buildProceduralBuildingGroup } from "./build-procedural-buildings"

/** Renders a single building that matched a glTF model via getBuildingModelPath. */
function GltfBuilding({ path, obj }: { path: string; obj: EnvObj }) {
  const { scene } = useGLTF(path)
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
  return (
    <primitive
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

  return (
    <>
      {meshes && <primitive object={meshes} />}
      <GltfBuildingBatch gltfBuildings={gltfBuildings} />
    </>
  )
}
