import * as THREE from "three"

// Placeholder surfaces for the browser approximation — the CityEnvironment
// is not a photographed or UE-native render. These textures give scale and
// color cues without pretending to be facades, storefronts, or lane
// markings. Any "fake window / door / lane" detail belongs to the native
// UE render, not to this approximation.

/** Neutral building wall placeholder with faint floor banding. No painted
 *  windows, no frames, no lit glass. */
export function createBuildingTexture(seed: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas")
  canvas.width = 64
  canvas.height = 128
  const ctx = canvas.getContext("2d")!

  let s = seed
  const rand = () => {
    s = (s * 16807 + 0) % 2147483647
    return (s & 0x7fffffff) / 0x7fffffff
  }

  ctx.fillStyle = "#e8e8e8"
  ctx.fillRect(0, 0, 64, 128)

  for (let i = 0; i < 80; i++) {
    const x = rand() * 64
    const y = rand() * 128
    const v = 200 + Math.floor(rand() * 40)
    ctx.fillStyle = `rgba(${v},${v},${v},0.25)`
    ctx.fillRect(x, y, 1, 1)
  }

  ctx.strokeStyle = "rgba(0,0,0,0.05)"
  ctx.lineWidth = 1
  const bandH = 24
  for (let y = bandH; y < 128; y += bandH) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(64, y)
    ctx.stroke()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  return texture
}

/** Slightly darker ground-floor placeholder. No painted storefronts. */
export function createGroundFloorTexture(seed: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas")
  canvas.width = 64
  canvas.height = 32
  const ctx = canvas.getContext("2d")!

  let s = seed
  const rand = () => {
    s = (s * 16807 + 0) % 2147483647
    return (s & 0x7fffffff) / 0x7fffffff
  }

  ctx.fillStyle = "#dcdcdc"
  ctx.fillRect(0, 0, 64, 32)

  for (let i = 0; i < 40; i++) {
    const x = rand() * 64
    const y = rand() * 32
    const v = 180 + Math.floor(rand() * 40)
    ctx.fillStyle = `rgba(${v},${v},${v},0.3)`
    ctx.fillRect(x, y, 1, 1)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  return texture
}

/** Asphalt-only placeholder for the box-instance Roads fallback. Real lane
 *  markings come from the OpenDRIVE RoadNetwork. */
export function createRoadTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas")
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext("2d")!

  ctx.fillStyle = "#2a2a2a"
  ctx.fillRect(0, 0, 128, 128)

  for (let i = 0; i < 300; i++) {
    const x = Math.random() * 128
    const y = Math.random() * 128
    const v = Math.floor(Math.random() * 20 + 30)
    ctx.fillStyle = `rgba(${v},${v},${v},0.3)`
    ctx.fillRect(x, y, 1.5, 1.5)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.minFilter = THREE.LinearMipmapLinearFilter
  return texture
}
