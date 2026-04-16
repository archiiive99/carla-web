# iter-11-revisit-exposure-deep-night report

**Status: ✅ PASS** — below-horizon exposure base now ramps:
1.6 at sun_alt=0 → 2.0 at sun_alt=-20 (clamped at -20). Prior
clamp at 1.6 regardless of how far below horizon the sun sat.
Seventy-sixth ✅ of session.

## §7.2 Feature delta
`scene-environment.tsx::ExposureDriver` useFrame:
```
sunAlt <= 0 branch:
  base = EXPOSURE_DUSK_NIGHT + (clamp(-sunAlt, 0, 20) / 20) * 0.4
```
At midday `sun_alt=60 > 0` → unchanged daytime branch.

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| 11.xx cluster | 11.03 | 0.2127 | 35.89 |
| after_edit (street_clear_midday) | **11.08** | **0.2137** | **35.77** |

Byte-identical within noise. `sun_alt=60 > 0` at midday so the
new branch code is unreachable.

## §7.5 Effort breakdown
~15 min (plan + 5-line edit + tsc + two SIGTERM retries + successful
harness + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - -20° saturation point chosen to match nautical-twilight → full
    night boundary. Below that the scene would need star-field /
    moon-driven lighting that the current rig doesn't model.
  - 0.4 ramp range keeps the max exposure at 2.0 — still within
    the tonemapping curve's usable range; ACES Filmic can handle
    up to ~3x without clipping, but 2.0 preserves a visible
    difference between twilight and deep-night.
