import { useMemo } from "react"
import * as THREE from "three"
import { EnvObj, buildInstanced } from "./shared"
import { SURFACE_NEUTRAL } from "../scene-palette"

// Surfaces that still render in the browser approximation. Roads and
// sidewalks used to live here as axis-aligned box instances, but they
// fight the waypoint-driven RoadMesh (baked PBR lane markings, curbs,
// stop lines, crosswalks, wet-weather specular) — so they were removed
// rather than re-exported dead. The only surviving box-instance surface
// is water, which RoadMesh doesn't cover.

export function WaterSurfaces({ objects }: { objects: EnvObj[] }) {
  const mesh = useMemo(() => {
    const geo = new THREE.BoxGeometry(1, 0.04, 1)
    // Desaturated steel-grey with a faint blue cast. The previous #1e40af
    // tailwind blue-700 + metalness 0.6 read as cartoon ocean chrome, not
    // like the murky drainage/canal water that CARLA's env-object "water"
    // actually covers. Real water is a dielectric (metalness 0), and its
    // "blue" comes from sky reflection via IBL rather than a painted tint.
    const mat = new THREE.MeshStandardMaterial({
      color: SURFACE_NEUTRAL,
      roughness: 0.2,
      metalness: 0,
      transparent: true,
      opacity: 0.82,
    })
    return buildInstanced(objects, geo, mat, { receiveShadow: true })
  }, [objects])
  return <primitive object={mesh} />
}
