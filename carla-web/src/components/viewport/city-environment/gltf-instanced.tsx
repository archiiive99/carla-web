import { useMemo } from "react"
import * as THREE from "three"
import { useGLTF } from "@react-three/drei"
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
 *  CARLA's prop categories don't share a single transform rule. */
export function GltfInstanced({
  path,
  objects,
  scale,
  receiveShadow = false,
}: {
  path: string
  objects: EnvObj[]
  scale: GltfScale
  receiveShadow?: boolean
}) {
  const { scene } = useGLTF(path)
  const group = useMemo(() => {
    const g = new THREE.Group()
    const extracted = extractGeoAndMat(scene)
    if (!extracted) return g

    const mesh = new THREE.InstancedMesh(
      extracted.geometry,
      extracted.material,
      objects.length,
    )
    const dummy = new THREE.Object3D()

    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i]
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
    return g
  }, [objects, scene, scale.mode, receiveShadow])
  return <primitive object={group} />
}
