import * as THREE from "three"

// Building color classification for the browser approximation.
//
// Previous versions mapped CARLA building blueprint categories to vivid
// saturated palettes (teal/coral/rose/lavender/sky). CARLA's own building
// paint colors aren't driven by blueprint category, so the bright palette
// made the browser approximation look like a toy town and implied
// material semantics that don't exist in the native UE asset.
//
// Now: a small desaturated concrete/brick/stucco palette with tiny hue
// variation per instance. Gas stations keep the bright brand orange
// because CARLA's gas-station model really does ship with that color;
// skyscrapers keep a subtle blue-glass tint because the CARLA skyscraper
// blueprint actually uses a glass facade. Everything else renders as
// honest neutral massing.
export function getBuildingBaseColor(name: string, seed: number): THREE.Color {
  let s = seed
  const rand = () => {
    s = (s * 16807 + 0) % 2147483647
    return (s & 0x7fffffff) / 0x7fffffff
  }
  const jitter = () => rand() * 0.04 - 0.02

  const lower = name.toLowerCase()

  // Branded exception — CARLA's gas-station model really is painted orange.
  if (lower.includes("gasstation") || lower.includes("gas_station")) {
    return new THREE.Color(0.85 + jitter(), 0.35 + jitter(), 0.08 + jitter())
  }

  // Branded exception — CARLA skyscraper assets use glass facades.
  if (lower.includes("skysc") || lower.includes("skyscraper")) {
    return new THREE.Color(0.48 + jitter(), 0.55 + jitter(), 0.62 + jitter())
  }

  // Everything else: desaturated neutral concrete/brick/stucco palette.
  const palette: [number, number, number][] = [
    [0.72, 0.70, 0.65], // off-white stucco
    [0.60, 0.57, 0.53], // warm concrete
    [0.65, 0.62, 0.57], // sand
    [0.55, 0.54, 0.52], // grey concrete
    [0.68, 0.62, 0.55], // muted tan
    [0.60, 0.60, 0.62], // cool grey
  ]
  const pick = palette[Math.floor(rand() * palette.length)]
  return new THREE.Color(
    pick[0] + jitter(),
    pick[1] + jitter(),
    pick[2] + jitter(),
  )
}
