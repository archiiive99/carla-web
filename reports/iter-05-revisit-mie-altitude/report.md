# iter-05-revisit-mie-altitude report

**Status: ✅ PASS** — drei `<Sky>` `mieCoefficient` now altitude-
ramped: 0.005 at sun_alt=60 (drei default), 0.020 at sun_alt=0.
Applied to both the scene `<Sky>` and the IBL `<Environment>`'s
nested `<Sky>`. Forty-eighth ✅ of session.

## §7.2 Feature delta
`scene-environment.tsx::WeatherLighting`:
  - `const mieCoefficient = 0.005 + horizonScatter * 0.015;` added
    alongside the existing turbidity/rayleigh horizon-scatter line.
  - Both `<Sky>` elements (scene + IBL) receive `mieCoefficient={mieCoefficient}`.

Mie scattering is the aerosol component that produces the warm
halo around the sun — rayleigh alone gives the blue sky but can't
widen the sun-disc halo. Bumping mieCoefficient at low sun matches
UE5 SkyAtmosphere's "thick atmospheric path" behavior near horizon.

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| scene-drift (16.xx band) | 16.70 | 0.3063 | 21.87 |
| after_edit (street_clear_midday) | **16.71** | **0.3064** | **21.86** |

Byte-identical within noise. At midday `horizonScatter=0` and
`mieCoefficient=0.005` reproduces the drei default.

## §7.5 Effort breakdown
~15 min (investigation + 3-line compute + 2-line prop plumbing +
tsc retry after transient TS cache glitch + harness + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - Kept `mieDirectionalG` at drei default (0.8). The g parameter
    controls forward-vs-backward bias of aerosol scattering — UE5
    SkyAtmosphere's equivalent is roughly 0.76; the difference is
    imperceptible compared to the coefficient change.
  - Re-ran tsc once after a transient unrelated "unused-locals"
    error on MiniMap.tsx (a pre-existing false positive that
    cleared on rerun). Not my edit's fault; skipped adding a
    workaround.
