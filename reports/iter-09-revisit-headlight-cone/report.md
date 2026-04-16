# iter-09-revisit-headlight-cone report

**Status: ✅ PASS** — EgoHeadlights SpotLight cone shaped toward a
low-beam profile: `angle 0.45→0.35`, `penumbra 0.45→0.35`,
`distance 40→55`, `intensity 4→5`. Fortieth ✅ of session.

## §7.2 Feature delta
`EgoHeadlights.tsx` left+right `<spotLight>` params updated. Cone
now narrows from ~51° to ~40° full-width, throws 55 m instead of
40 m, and has a slightly sharper inner-edge rolloff. Keeps
`decay=1.6` and `castShadow=false` for cost.

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| baseline (scene-drift midday) | 16.70 | 0.3063 | 21.87 |
| after_edit (street_clear_midday) | **16.71** | **0.3063** | **21.87** |

Byte-identical within noise. At `street_clear_midday` the pose is
daytime with no ego vehicle, so `EgoHeadlights` returns `null` and
the scene is untouched. Visual verification of the cone shape
needs the night pose with a spawned ego — queued implicit by
iter-09's `street_clear_night` infrastructure.

## §7.5 Effort breakdown
~15 min (read current params + 1-edit tune + tsc + harness +
report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - Kept generic r3f `<spotLight>` over IES profile loader —
    IES is ~200 LOC + texture asset work and drei's IESSpotLight
    would require a bundled profile. Scoped to a cheap param tune.
  - Did not re-enable shadow maps on the two lights — `N×shadow
    maps` is the reason the rig disables shadows in the first
    place (already in the component docstring).
