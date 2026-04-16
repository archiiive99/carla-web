# iter-06-revisit-sun-precip report

**Status: ✅ PASS** — `directIntensity` now attenuates by
precipitation too: `daylight × max(0, 1 − cloudFactor×0.55 −
precipFactor×0.25)`. Floored via Math.max so heavy rain + heavy
cloud can't go negative. Sixty-second ✅ of session.

## §7.2 Feature delta
`scene-environment.tsx::WeatherLighting`:
```
precipFactor = clamp(precipitation, 0, 100) / 100
directIntensity = daylight * Math.max(0, 1 - cloudFactor*0.55 - precipFactor*0.25)
```

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| recent 15.xx reference cluster | 15.66 | 0.3437 | 22.64 |
| after_edit (street_clear_midday) | **15.50** | **0.3388** | **22.79** |

Within noise. `precipitation=0` at midday reproduces the prior
`1 - cloudFactor*0.55` formula exactly.

## §7.5 Effort breakdown
~10 min (plan + 5-line edit + tsc + harness + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - 0.25 coefficient half of cloudFactor's 0.55 — precipitation
    without cloud cover would be odd, and the cloudFactor already
    dominates the attenuation when both are active. 0.25 is the
    additional-rain-attenuation on top of cloud.
  - Floored at 0 rather than at some tiny value (e.g. 0.05). Even
    heavy rain has small residual direct-sun leakage in real life
    but 0 is more conservative against over-bright scenes — the
    HemisphereLight fill carries the scene's exposure anyway.
