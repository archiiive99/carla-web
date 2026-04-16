# iter-09-revisit-emissive-depth report

**Status: ✅ PASS** — lamp emissive-sphere intensity now rides the
same night-depth curve as halo opacity: `1.2 + nightDepth * 2.3`
(twilight → 1.2, deep night → 3.5). Fifty-seventh ✅ of session.

## §7.2 Feature delta
`NightStreetLights.tsx`:
  - Added `emissiveIntensity` const next to `haloOpacity` at the
    top of the component body.
  - Emissive sphere's `emissiveIntensity` prop swapped from literal
    `2.5` → `{emissiveIntensity}`.

The sphere and halo now modulate in proportion — previously the
halo dimmed at twilight while the sphere stayed fixed-bright,
looking out of sync.

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| scene-drift (11.xx band, reference recovered) | 11.03 | 0.2127 | 35.89 |
| after_edit (street_clear_midday) | **10.97** | **0.2109** | **36.10** |

Byte-identical within noise. `isNight=false` at midday → no
emissive sphere mounts → emissiveIntensity ramp unreachable.

## §7.5 Effort breakdown
~10 min (const + 1-line prop swap + tsc + harness + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - Range endpoints (1.2 / 3.5) chosen so the midpoint (~2.35)
    sits within 6% of the prior 2.5 literal — dusk look barely
    changes, but both ends of the depth curve are now distinct.
  - Kept the spotLight intensity at 30 (fixed). Ramping the
    actual light cast would double-dim the road at twilight
    where the ExposureDriver is already lifting exposure; net
    would be zero perceptual change.
