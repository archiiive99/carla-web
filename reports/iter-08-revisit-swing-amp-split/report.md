# iter-08-revisit-swing-amp-split report

**Status: ✅ PASS** — walker arm vs leg swing amplitudes split:
`armSwing = sin(phase) * 0.35`, `legSwing = sin(phase) * 0.55`.
Knee-bend amplitude unchanged at 0.8. Forty-fifth ✅ of session.

## §7.2 Feature delta
`WalkerMesh.tsx` useFrame: single `swing * 0.45` replaced by
separate `armSwing` / `legSwing` variables with `0.35` and `0.55`
amplitudes. Arms read as the counter-balance they are in real
walking (slightly narrower than leg stride), legs read as a
wider, more visible gait.

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| scene-drift (16.xx band) | 16.70 | 0.3063 | 21.87 |
| after_edit (street_clear_midday) | **16.73** | **0.3060** | **21.86** |

Within noise. Walkers aren't in the road ROI rectangle at iter-01
pose.

## §7.5 Effort breakdown
~12 min (read + 5-line edit + tsc + harness + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - Didn't add shoulder/hip counter-rotation. That would need the
    torso to rotate opposite the hips each step — scope creep; the
    current body-yaw-from-velocity already does a cheaper version
    of this.
  - Kept `phaseSin` factored so both amplitudes share a single
    `Math.sin` call — one trig op per walker per frame, same as
    before.
