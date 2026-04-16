# iter-06-revisit-ground-bounce-altitude report

**Status: ✅ PASS** — `hemisphereLight` ground-bounce color now
interpolates between `#7a4c30` (warm dusk) and `#5a4f44` (current
neutral warm) on `altFactor = clamp(sun_alt, 0, 60) / 60`. Reuses
the existing `altFactor` from the sky-scattering formulas above.
Forty-fourth ✅ of session.

## §7.2 Feature delta
`scene-environment.tsx::WeatherLighting` hemisphere-light `args[1]`
(ground color, day branch only) computed via `new THREE.Color()
.lerpColors(horizon, noon, altFactor)` rendered to hex string. Night
branch unchanged at `#1c1f26`.

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| scene-drift (common, 16.xx band) | 16.70 | 0.3063 | 21.87 |
| after_edit (street_clear_midday) | **16.71** | **0.3062** | **21.86** |

Byte-identical within noise. `altFactor=1` at midday reproduces
the prior literal exactly.

## §7.5 Effort breakdown
~15 min (investigation + 7-line edit + tsc + harness + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - Reused the existing `altFactor` instead of computing a second
    one inside the JSX — the sky-scatter section already computes
    it right above the hemisphereLight.
  - Used Three's `lerpColors` over a manual RGB lerp because the
    source/target are hex literals that will never change — the
    allocation is one-time per render; no hot-path cost.
