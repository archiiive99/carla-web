import { Suspense, useMemo } from "react"
import * as THREE from "three"
import { TRAFFIC_LIGHT_MODEL, TRAFFIC_SIGN_MODEL } from "../CarlaAssetLoader"
import { EnvObj, c2t, yawRad } from "./shared"
import { GltfInstanced } from "./gltf-instanced"

// --- Traffic lights ----------------------------------------------------

function ProceduralTrafficLights({ objects }: { objects: EnvObj[] }) {
  const group = useMemo(() => {
    const g = new THREE.Group()
    for (const obj of objects) {
      const pos = c2t(obj.b.x, obj.b.y, obj.b.z)
      const h = Math.max(obj.b.ez * 2, 3)

      const poleGeo = new THREE.CylinderGeometry(0.06, 0.06, h, 5)
      const poleMat = new THREE.MeshStandardMaterial({ color: "#374151" })
      const pole = new THREE.Mesh(poleGeo, poleMat)
      pole.position.set(pos.x, pos.y + h / 2, pos.z)
      g.add(pole)

      // Unlit neutral housing — the actor-side TrafficLightMesh overlays the
      // real state color at this exact position. Glowing amber on the static
      // env-object would falsely imply a yellow/warning signal when the real
      // state may be red or green.
      const lightGeo = new THREE.SphereGeometry(0.18, 6, 6)
      const lightMat = new THREE.MeshStandardMaterial({
        color: "#4b5563",
        roughness: 0.9,
        metalness: 0.0,
      })
      const light = new THREE.Mesh(lightGeo, lightMat)
      light.position.set(pos.x, pos.y + h - 0.3, pos.z)
      g.add(light)
    }
    return g
  }, [objects])
  return <primitive object={group} />
}

export function TrafficLights({ objects }: { objects: EnvObj[] }) {
  if (objects.length === 0) return null
  return (
    <Suspense fallback={<ProceduralTrafficLights objects={objects} />}>
      <GltfInstanced
        path={TRAFFIC_LIGHT_MODEL}
        objects={objects}
        scale={{ mode: "identity" }}
      />
    </Suspense>
  )
}

// --- Traffic signs -----------------------------------------------------

function ProceduralTrafficSigns({ objects }: { objects: EnvObj[] }) {
  const group = useMemo(() => {
    const geo = new THREE.BoxGeometry(0.6, 0.6, 0.05)
    // Neutral housing — CARLA traffic signs are many types (stop, yield,
    // speed limit, route marker, ...). Painting them all red implied a
    // stop-sign semantic that's almost always wrong.
    const mat = new THREE.MeshStandardMaterial({ color: "#9ca3af", roughness: 0.6 })
    const g = new THREE.Group()
    for (const obj of objects) {
      const pos = c2t(obj.b.x, obj.b.y, obj.b.z)
      const h = Math.max(obj.b.ez * 2, 2)
      const pGeo = new THREE.CylinderGeometry(0.04, 0.04, h, 4)
      const pMat = new THREE.MeshStandardMaterial({ color: "#71717a" })
      const pole = new THREE.Mesh(pGeo, pMat)
      pole.position.set(pos.x, pos.y + h / 2, pos.z)
      g.add(pole)
      const sign = new THREE.Mesh(geo, mat)
      sign.position.set(pos.x, pos.y + h - 0.3, pos.z)
      sign.rotation.set(0, yawRad(obj.b.yaw), 0)
      g.add(sign)
    }
    return g
  }, [objects])
  return <primitive object={group} />
}

export function TrafficSigns({ objects }: { objects: EnvObj[] }) {
  if (objects.length === 0) return null
  return (
    <Suspense fallback={<ProceduralTrafficSigns objects={objects} />}>
      <GltfInstanced
        path={TRAFFIC_SIGN_MODEL}
        objects={objects}
        scale={{ mode: "identity" }}
      />
    </Suspense>
  )
}
