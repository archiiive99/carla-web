import { useEffect, useState } from "react"
import { useSimulationStore } from "@/stores/simulationStore"
import { carlaApi } from "@/lib/carla-api"
import { MapEnv, SafeRender, c2t, yawRad } from "./city-environment/shared"
import { MISSING_ASSET } from "./scene-palette"
import { Buildings } from "./city-environment/Buildings"
import { Vegetation } from "./city-environment/Vegetation"
import { TrafficLights, TrafficSigns } from "./city-environment/Signals"
import {
  Poles,
  Walls,
  Fences,
  Rocks,
  GuardRails,
} from "./city-environment/Structures"
import { WaterSurfaces } from "./city-environment/Surfaces"
import { FacadeNightDriver } from "./city-environment/facade-night-driver"

/**
 * CityEnvironment — the browser approximation's population layer. This is
 * strictly an approximation: prop placements and bounding boxes come from
 * real CARLA map data, but every rendered surface is either a glTF stand-in
 * (when a direct asset exists) or an honest placeholder (otherwise).
 *
 * Category-specific rendering lives under `./city-environment/`:
 *   - shared.tsx           : types, coord helpers, SafeRender, mesh extraction,
 *                            `buildInstanced`, and re-exports of placeholder
 *                            textures + building palette
 *   - placeholder-textures.ts : neutral wall/ground/road canvas textures
 *   - building-palette.ts  : desaturated building color classifier
 *   - gltf-instanced.tsx   : shared GltfInstanced factory with scale modes
 *                            (`fit-bbox` / `pole` / `identity`)
 *   - Buildings.tsx        : buildings (glTF + honest-placeholder boxes)
 *   - Vegetation.tsx       : trees / foliage (glTF + procedural trunk+canopy)
 *   - Signals.tsx          : traffic lights + traffic signs (state-aware
 *                            chrome lives in ActorRenderer; this layer is the
 *                            static map population)
 *   - Structures.tsx       : poles / walls / fences / rocks / guard rails
 *   - Surfaces.tsx         : water (roads/sidewalks superseded by RoadMesh)
 */
export function CityEnvironment() {
  const [env, setEnv] = useState<MapEnv | null>(null)
  const currentMap = useSimulationStore((s) => s.currentMap)
  // Same React-19 idiom used by MiniMap's topology reset:
  // clear the cached env the moment currentMap flips (pure reset,
  // belongs in render; React bails out on unchanged setters) and
  // keep the impure fetch in useEffect.
  const [lastMap, setLastMap] = useState(currentMap)
  if (lastMap !== currentMap) {
    setLastMap(currentMap)
    setEnv(null)
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await carlaApi.getMapEnvironment()
        if (!cancelled) setEnv(data)
      } catch {
        setTimeout(load, 3000)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [currentMap])

  if (!env) return null

  const debug =
    typeof window !== "undefined" && /debugBuildings=1/.test(window.location.search)

  return (
    <>
      {debug &&
        env.buildings.map((b, i) => {
          const p = c2t(b.b.x, b.b.y, b.b.z)
          return (
            <mesh
              key={`dbg-${i}`}
              position={[p.x, p.y, p.z]}
              rotation={[0, yawRad(b.b.yaw), 0]}
            >
              <boxGeometry
                args={[
                  Math.abs(b.b.ex) * 2,
                  Math.abs(b.b.ez) * 2,
                  Math.abs(b.b.ey) * 2,
                ]}
              />
              <meshBasicMaterial color={MISSING_ASSET} wireframe />
            </mesh>
          )
        })}
      {/* Push current sun altitude into the facade shader's uNightFactor
          uniform every time weather changes so windows light up at dusk
          and go dark at sunrise without re-allocating materials. */}
      <FacadeNightDriver />
      <SafeRender>
        <Buildings objects={env.buildings} />
      </SafeRender>
      {/* Roads + Sidewalks superseded by RoadMesh.tsx (waypoint-following
          procedural mesh with baked PBR lane markings, curbs, crosswalks,
          stop lines, arrows, wet-weather specular). Box-instance versions
          are axis-aligned and can't follow curves; leaving them on causes
          z-fighting and hides the procedural work. */}
      <SafeRender>
        <Vegetation objects={env.vegetation} />
      </SafeRender>
      <SafeRender>
        <Poles objects={env.poles} />
      </SafeRender>
      <SafeRender>
        <Walls objects={env.walls} />
      </SafeRender>
      <SafeRender>
        <Fences objects={env.fences} />
      </SafeRender>
      <SafeRender>
        <TrafficLights objects={env.traffic_lights} />
      </SafeRender>
      <SafeRender>
        <TrafficSigns objects={env.traffic_signs} />
      </SafeRender>
      <SafeRender>
        <WaterSurfaces objects={env.water} />
      </SafeRender>
      <SafeRender>
        <Rocks objects={env.rocks} />
      </SafeRender>
      <SafeRender>
        <GuardRails objects={env.guard_rails} />
      </SafeRender>
    </>
  )
}
