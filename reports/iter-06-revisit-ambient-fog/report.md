# iter-06-revisit-ambient-fog report

**Status: ✅ PASS** — `ambientBase` now adds `fogFactor * 0.04`
so foggy scenes get a small ambient fill lift. Sixty-first ✅ of
session.

## §7.2 Feature delta
`scene-environment.tsx::WeatherLighting`:
```
fogFactor = clamp(fog_density, 0, 100) / 100
ambientBase = 0.02 + cloudFactor*0.05 + nightFactor*0.03 + fogFactor*0.04
```
No-op at `fog_density=0` (midday); at `fog_density=100` ambient
floor lifts from ~0.02 to ~0.06.

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| scene-drift (recent 15.xx reference cluster) | 15.66 | 0.3437 | 22.64 |
| after_edit (street_clear_midday) | **15.45** | **0.3433** | **22.85** |

Within noise of the current reference cluster. `fog_density=0` at
midday reproduces the prior literal exactly.

## §7.5 Effort breakdown
~12 min (plan + 4-line edit + tsc + harness + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - 0.04 coefficient chosen smaller than `cloudFactor*0.05` — fog
    is more localized than uniform overcast, so its ambient lift
    is less global. Relative ordering: overcast > fog > night.
  - Didn't tie fog_density to directional attenuation. The road
    shader's `uFogDensity` chunk already handles the
    directional-shadow-shortening effect; ambient lift is a
    separate coupling.
