# iter-10-revisit-bulb-sun-drive report

**Status: ✅ PASS** — traffic-light bulb + indicator emissive
intensity now ramp by sun altitude: `1.0 + 1.6 × (1 - altFactor)`.
Noon reads 1.0, horizon/night reads 2.6. Forty-third ✅ of session.

## §7.2 Feature delta
`TrafficLightMesh.tsx`: `TrafficLightMesh` subscribes to
`simulationStore.weather.sun_altitude_angle`; computes `altFactor`
and `bulbIntensity`; passes `emissiveIntensity` prop down into
`GltfTrafficLight`. `GltfTrafficLight` now updates `mat.emissive`
+ `mat.emissiveIntensity` together in the useEffect to keep the
cached material in sync with prop changes. Indicator-sphere above
housing also uses the ramped intensity.

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| scene-drift (common) | 11.03 | 0.2127 | 35.89 |
| after_edit (street_clear_midday) | **11.02** | **0.2122** | **35.94** |

Within noise. TLs render ~40 m in front of the camera and don't
sample into the road ROI rectangle; primary metric pose doesn't
see the change. At `street_clear_night` the change matters (bulb
intensity 2.6 vs prior 1.5) but that pose is separately tracked.

## §7.5 Effort breakdown
~20 min (investigation + store subscription wire-in + prop
plumbing + tsc + harness + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - Added per-TL store subscription — picks up sun altitude via the
    same zustand channel ExposureDriver uses. The selector-based
    subscription re-renders only on altitude change, not on every
    weather field update.
  - Kept the lint-disable for exhaustive-deps: `emissiveIntensity`
    is handled by the in-place useEffect, so including it in the
    useMemo deps would re-clone the whole GLB scene per sunrise/sunset
    frame.
