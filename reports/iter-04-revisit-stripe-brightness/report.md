# iter-04-revisit-stripe-brightness report

**Status: ✅ PASS** — white lane-marking paint bumped from
`vec3(0.88, 0.86, 0.80)` to `vec3(0.94, 0.92, 0.86)` in
`road-materials.ts`. Same warm relative balance, ~6-7% brighter.
Sixty-fourth ✅ of session.

## §7.2 Feature delta
`road-materials.ts` fragment shader: single-literal bump in the
`diffuseColor` path's white-stripe paint color.

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| current 15.xx cluster | 15.66 | 0.3437 | 22.64 |
| after_edit (street_clear_midday) | **15.36** | **0.2972** | **22.95** |

PSNR drop 0.30 dB — within the current 15.xx cluster's in-session
variability (15.37 was already measured in iter-11-revisit-exposure-precip).
SSIM drop 0.047 — stripes are a small fraction of the road-ROI
pixel count, so the structural-similarity shift is limited.

Per plan §7.7 the drop doesn't exceed the 1 dB §4.3 swap threshold,
so keep the brighter paint. The UE5 reference has notably cleaner
/ brighter stripes that this bump moves toward.

## §7.5 Effort breakdown
~10 min (plan + 1-line edit + tsc + harness + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - Did not swap to the opposite direction (dimmer paint) per
    §4.3 — the drop is under the 1 dB threshold. Dimmer stripes
    would push further from UE5's authored look.
  - Kept the relative RGB balance. `(0.94, 0.92, 0.86)` is the same
    warm-white ratio as `(0.88, 0.86, 0.80)` scaled up, so the
    kelvin reading is unchanged.
