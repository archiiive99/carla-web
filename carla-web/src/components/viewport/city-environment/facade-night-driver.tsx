import { useEffect } from "react"
import { useSimulationStore } from "@/stores/simulationStore"
import { FACADE_UNIFORMS } from "./facade-material"

/** Headless component that pushes the current CARLA sun altitude into the
 *  shared `uNightFactor` uniform used by the procedural facade shader.
 *  Mounts once under CityEnvironment — nothing rendered, no scene graph
 *  cost. Night factor ramps from 0 (sun at horizon) to 1 by the time the
 *  sun is ~15° below the horizon, so dusk fades windows on, full night
 *  has them at maximum, and any daylight turns them off. */
export function FacadeNightDriver() {
  useEffect(() => {
    // Seed from current state.
    const alt = useSimulationStore.getState().weather.sun_altitude_angle
    FACADE_UNIFORMS.uNightFactor.value = altitudeToNight(alt)

    const unsub = useSimulationStore.subscribe((state, prev) => {
      if (state.weather.sun_altitude_angle === prev.weather.sun_altitude_angle) return
      FACADE_UNIFORMS.uNightFactor.value = altitudeToNight(
        state.weather.sun_altitude_angle,
      )
    })
    return unsub
  }, [])

  return null
}

function altitudeToNight(sunAltitudeDeg: number): number {
  // Sun well above horizon (>= +5°): full day → 0.
  // Sun near horizon ([-15°, +5°]): linear ramp.
  // Sun well below (<= -15°): full night → 1.
  if (sunAltitudeDeg >= 5) return 0
  if (sunAltitudeDeg <= -15) return 1
  return (5 - sunAltitudeDeg) / 20
}
