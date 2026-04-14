import * as THREE from "three"
import { EnvObj, c2t, yawRad } from "./shared"
import { getBuildingBaseColor } from "./building-palette"
import { createFacadeMaterial } from "./facade-material"

interface MainBodyOpts {
  textureGroupSeedOffset: number
}

/** Build the upper-storey instanced mesh for one texture-variant bucket.
 *  Uses the shader-patched facade material so walls carry a real window
 *  grid + night-lit windows rather than a flat tiled texture. */
function buildMainBodyMesh(
  bodyGeo: THREE.BoxGeometry,
  buildings: EnvObj[],
  { textureGroupSeedOffset }: MainBodyOpts,
): THREE.InstancedMesh {
  // NOTE: Do NOT set vertexColors: true — BoxGeometry has no color attribute,
  // which produces pure black. InstancedMesh.setColorAt uses the built-in
  // `instanceColor` attribute which Three.js injects automatically.
  const mat = createFacadeMaterial("main")
  const mesh = new THREE.InstancedMesh(bodyGeo, mat, buildings.length)
  const dummy = new THREE.Object3D()

  for (let i = 0; i < buildings.length; i++) {
    const obj = buildings[i]
    const pos = c2t(obj.b.x, obj.b.y, obj.b.z)
    const ex = Math.max(obj.b.ex * 2, 0.5)
    const ey = Math.max(obj.b.ey * 2, 0.5)
    const ez = Math.max(obj.b.ez * 2, 0.5)
    const groundH = Math.min(3, ez * 0.15)

    dummy.position.set(pos.x, pos.y + groundH / 2, pos.z)
    dummy.rotation.set(0, yawRad(obj.b.yaw), 0)
    dummy.scale.set(ex, ez - groundH, ey)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
    mesh.setColorAt(i, getBuildingBaseColor(obj.name, i * 7 + textureGroupSeedOffset))
  }

  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/** Build the darker ground-floor wrap for one texture-variant bucket.
 *  Ground-floor uses the same facade shader so its horizontal mullions
 *  line up with the main body, but with the `ground` kind's roughness
 *  tuning for a denser storefront read. */
function buildGroundFloorMesh(
  bodyGeo: THREE.BoxGeometry,
  buildings: EnvObj[],
  { textureGroupSeedOffset }: MainBodyOpts,
): THREE.InstancedMesh {
  const mat = createFacadeMaterial("ground")
  const mesh = new THREE.InstancedMesh(bodyGeo, mat, buildings.length)
  const dummy = new THREE.Object3D()

  for (let i = 0; i < buildings.length; i++) {
    const obj = buildings[i]
    const pos = c2t(obj.b.x, obj.b.y, obj.b.z)
    const ex = Math.max(obj.b.ex * 2, 0.5)
    const ey = Math.max(obj.b.ey * 2, 0.5)
    const ez = Math.max(obj.b.ez * 2, 0.5)
    const groundH = Math.min(3, ez * 0.15)

    dummy.position.set(pos.x, pos.y - ez / 2 + groundH / 2, pos.z)
    dummy.rotation.set(0, yawRad(obj.b.yaw), 0)
    dummy.scale.set(ex + 0.15, groundH, ey + 0.15)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)

    const baseColor = getBuildingBaseColor(obj.name, i * 7 + textureGroupSeedOffset)
    mesh.setColorAt(i, baseColor.clone().multiplyScalar(0.65))
  }

  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/** Build the inset upper-storey for tall buildings in one texture-variant
 *  bucket — mimics the setback massing typical of older skyscrapers.
 *  Uses the `setback` facade kind so its slightly more metallic reflection
 *  reads as upper-storey glass-band rather than masonry. */
function buildSetbackMesh(
  bodyGeo: THREE.BoxGeometry,
  buildings: EnvObj[],
  { textureGroupSeedOffset }: MainBodyOpts,
): THREE.InstancedMesh {
  const mat = createFacadeMaterial("setback")
  const mesh = new THREE.InstancedMesh(bodyGeo, mat, buildings.length)
  const dummy = new THREE.Object3D()

  for (let i = 0; i < buildings.length; i++) {
    const obj = buildings[i]
    const pos = c2t(obj.b.x, obj.b.y, obj.b.z)
    const ex = Math.max(obj.b.ex * 2, 0.5)
    const ey = Math.max(obj.b.ey * 2, 0.5)
    const ez = Math.max(obj.b.ez * 2, 0.5)
    const setbackH = ez * 0.25
    const inset = 0.8

    dummy.position.set(pos.x, pos.y + ez / 2 + setbackH / 2, pos.z)
    dummy.rotation.set(0, yawRad(obj.b.yaw), 0)
    dummy.scale.set(ex * inset, setbackH, ey * inset)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)

    const baseColor = getBuildingBaseColor(obj.name, i * 7 + textureGroupSeedOffset)
    mesh.setColorAt(i, baseColor.clone().multiplyScalar(0.95))
  }

  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/** Single instanced mesh capping every building with a flat slab roof. */
function buildRoofMesh(buildings: EnvObj[]): THREE.InstancedMesh {
  const roofGeo = new THREE.BoxGeometry(1, 1, 1)
  const roofMat = new THREE.MeshStandardMaterial({
    color: "#4a4a4a",
    roughness: 0.95,
    metalness: 0.0,
  })
  const mesh = new THREE.InstancedMesh(roofGeo, roofMat, buildings.length)
  const dummy = new THREE.Object3D()

  for (let i = 0; i < buildings.length; i++) {
    const obj = buildings[i]
    const pos = c2t(obj.b.x, obj.b.y, obj.b.z)
    const ex = Math.max(obj.b.ex * 2, 0.5)
    const ey = Math.max(obj.b.ey * 2, 0.5)
    const ez = Math.max(obj.b.ez * 2, 0.5)

    let topY: number
    let roofEx: number
    let roofEy: number
    if (obj.b.ez > 5) {
      const setbackH = ez * 0.25
      topY = pos.y + ez / 2 + setbackH
      roofEx = ex * 0.8
      roofEy = ey * 0.8
    } else {
      topY = pos.y + ez / 2
      roofEx = ex
      roofEy = ey
    }

    dummy.position.set(pos.x, topY + 0.15, pos.z)
    dummy.rotation.set(0, yawRad(obj.b.yaw), 0)
    dummy.scale.set(roofEx + 0.3, 0.3, roofEy + 0.3)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
  }

  mesh.instanceMatrix.needsUpdate = true
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/** Build the full procedural-building Group: 4 texture-variant buckets ×
 *  (main body + ground floor + optional setback) + a single roof mesh
 *  capping every building. Returns null when there are no buildings to
 *  build, so the caller can render `{group && <primitive ...>}`. */
export function buildProceduralBuildingGroup(
  proceduralBuildings: EnvObj[],
): THREE.Group | null {
  if (proceduralBuildings.length === 0) return null

  // Bucket buildings into 4 seed groups. The buckets only drive the
  // per-instance base-colour seed offset now — facade detail (windows,
  // floor bands, night lit windows) is driven entirely by the shader
  // from world-space position, so we no longer need 4 canvas textures.
  const buckets = Array.from({ length: 4 }, () => ({
    main: [] as EnvObj[],
    groundFloor: [] as EnvObj[],
    setback: [] as EnvObj[],
  }))

  for (let i = 0; i < proceduralBuildings.length; i++) {
    const bucket = buckets[i % 4]
    bucket.main.push(proceduralBuildings[i])
    bucket.groundFloor.push(proceduralBuildings[i])
    if (proceduralBuildings[i].b.ez > 5) {
      bucket.setback.push(proceduralBuildings[i])
    }
  }

  const group = new THREE.Group()
  const bodyGeo = new THREE.BoxGeometry(1, 1, 1)

  for (let g = 0; g < 4; g++) {
    const bucket = buckets[g]
    const seedOffset = g * 100
    if (bucket.main.length > 0) {
      group.add(
        buildMainBodyMesh(bodyGeo, bucket.main, {
          textureGroupSeedOffset: seedOffset,
        }),
      )
    }
    if (bucket.groundFloor.length > 0) {
      group.add(
        buildGroundFloorMesh(bodyGeo, bucket.groundFloor, {
          textureGroupSeedOffset: seedOffset,
        }),
      )
    }
    if (bucket.setback.length > 0) {
      group.add(
        buildSetbackMesh(bodyGeo, bucket.setback, {
          textureGroupSeedOffset: seedOffset,
        }),
      )
    }
  }

  group.add(buildRoofMesh(proceduralBuildings))
  return group
}
