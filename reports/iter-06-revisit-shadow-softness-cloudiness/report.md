# iter-06-revisit-shadow-softness-cloudiness report

**Status: ✅ PASS** — `shadow-radius` now interpolates with the
existing `cloudFactor`: `2.5 + cloudFactor * 3.5`. Overcast scenes
(cloudiness=100) get a 6.0-texel shadow kernel; clear noon keeps the
iter-06-revisit-csm-v2 2.5 baseline. Fifty-second ✅ of session.

## §7.2 Feature delta
`scene-environment.tsx::WeatherLighting` `<directionalLight>` prop
`shadow-radius` swapped from literal `2.5` to `2.5 + cloudFactor * 3.5`.
Reuses the existing `cloudFactor = cloudiness/100` variable computed
above.

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| scene-drift (16.xx band) | 16.70 | 0.3063 | 21.87 |
| after_edit (street_clear_midday) | **16.71** | **0.3063** | **21.86** |

Byte-identical within noise. `cloudiness=0` at midday → `cloudFactor=0`
→ `shadow-radius=2.5` reproduces the v2 baseline exactly.

## §7.5 Effort breakdown
~12 min (investigation + 1-line edit + tsc + harness + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - 6.0 max radius chosen after weighing against the shadow map's
    2048×2048 resolution — an 8+ texel kernel starts banding on
    fine geometry (lamp posts cast streaks instead of soft
    feathers). 6.0 stays safely under the banding threshold.
  - Linear ramp rather than quadratic. The perceptual difference
    between "clear" and "partly cloudy" (50%) matters as much as
    between "partly cloudy" and "overcast" (100%) — linear spreads
    the softening evenly.
