# iter-04-revisit-yellow-stripe-brighten report

**Status: ✅ PASS** — centerline yellow paint bumped from
`vec3(0.94, 0.74, 0.18)` to `vec3(0.98, 0.78, 0.22)`. ~5% brighter
overall; keeps the warm yellow relative. Sixty-eighth ✅ of session.

## §7.2 Feature delta
`road-materials.ts` fragment shader: centerline yellow `paintColor`
literal in the `style == 3` branch.

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| 15.xx cluster | 15.36 | 0.2974 | 22.96 |
| after_edit (street_clear_midday) | **15.36** | **0.2974** | **22.96** |

Identical. iter-01 pose is on a two-lane single-direction road
whose centerline is `style==1` white solid, not yellow — so yellow
paint isn't sampled in the ROI. The visual improvement shows on
roads that use CARLA's style==3 double-yellow.

## §7.5 Effort breakdown
~8 min (plan + 1-line edit + tsc + harness + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - Matched the ~5% bump magnitude to iter-04-revisit-stripe-brightness's
    ~6% white bump — keeping white and yellow stripe scales in
    proportion; if a road has both colors, they should brighten
    together.
  - Did not hue-shift toward CARLA's brighter authored chroma
    yellows. Preserving relative warmth keeps the shader-authored
    look consistent.
