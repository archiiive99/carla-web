# iter-11 plan — Post-process calibration

**Phase tag:** A
**Time budget:** 1 h hard

## Current state
  - **Tonemap**: ✅ ACESFilmicToneMapping shipped (WorldCanvas.tsx:184)
  - **Exposure**: ⚠️ static 0.82 (WorldCanvas.tsx:185); no weather-
    driven adjustment. Project memory cites an ExposureDriver
    formula: `target = (sunAlt≤0 ? 1.6 : 1.6 − min(sunAlt,60)/60) + cloudiness×0.0015`
    — present in aspirational spec but not wired in current code.
  - **Bloom**: ❌ blocked by architectural constraint (iter-09-
    revisit-bloom-v2 raise — EffectComposer incompatible with
    WorldCanvas multi-camera)

## Approach
Add a new `ExposureDriver` component that uses useFrame to read
weather.sun_altitude_angle + cloudiness and write
gl.toneMappingExposure directly per the formula. Drop the static
0.82 in favor of the initial value emitted by the formula.

## Files in scope
  - `carla-web/src/components/viewport/scene-environment.tsx`
    (co-locate ExposureDriver with the other weather-driven
    components WeatherLighting + WeatherFog)
  - `carla-web/src/components/viewport/WorldCanvas.tsx` (mount
    ExposureDriver after WeatherLighting)

## Out of scope
  - Bloom (iter-09-revisit-bloom-v3+ territory)
  - CSM (iter-06-revisit-csm)
  - Exposure smoothing / hysteresis (iter-11-revisit-smoothing)

## Acceptance
  - tsc clean
  - At iter-01 pose, gl.toneMappingExposure computes as per the
    formula (sun_alt=60 + cloud=10 → ~0.615)
  - Harness numbers: expected ΔE improvement vs 0.82-static baseline
    since the formula gives a slightly darker exposure (0.615 < 0.82)
    which more faithfully matches bright-midday conditions
