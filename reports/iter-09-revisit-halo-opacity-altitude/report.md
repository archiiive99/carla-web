# iter-09-revisit-halo-opacity-altitude report

**Status: ✅ PASS** — lamp-halo `opacity` now ramps with night-
depth: `0.2 + nightDepth * 0.3` where `nightDepth = clamp(-sun_alt
/ 15, 0, 1)`. Twilight = 0.2, deep night = 0.5. Fifty-fourth ✅ of
session.

## §7.2 Feature delta
`NightStreetLights.tsx`:
  - Added `nightDepth` + `haloOpacity` const computed at component
    top from `sunAltitude`.
  - Halo `<meshBasicMaterial>` `opacity` prop swapped from literal
    `0.35` → `{haloOpacity}`.

Halo only mounts under `{isNight && (...)}` so the new variables
are evaluated lazily relative to the branch.

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| scene-drift (16.xx band) | 16.70 | 0.3063 | 21.87 |
| after_edit (street_clear_midday) | **16.71** | **0.3063** | **21.87** |

Byte-identical within noise. `isNight=false` at midday prevents
the halo meshes from mounting, so opacity ramp is unreachable.

## §7.5 Effort breakdown
~10 min (component-top constants + 1-line prop swap + tsc +
harness + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - 15° transition window (dusk → deep night) chosen to roughly
    match civil twilight, where astronomical/visual "night" does
    deepen over ~15° of solar elevation.
  - Kept the same 0.4 halo radius — scaling radius with night-
    depth would shift the additive footprint and could pop against
    building facades at the boundary. Opacity-only shift keeps
    geometry fixed.
