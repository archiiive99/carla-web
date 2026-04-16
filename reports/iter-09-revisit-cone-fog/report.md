# iter-09-revisit-cone-fog report

**Status: ✅ PASS** — beam-volume cone opacity now multiplies by
`(1 + fogFactor * 1.5)`: clear night 0.4× halo, heavy fog 1.0× halo.
Seventy-third ✅ of session.

## §7.2 Feature delta
`NightStreetLights.tsx`:
  - Added `fogDensity` store subscription + `fogFactor` + `coneOpacity`
    computed at component top.
  - Cone `<meshBasicMaterial>` `opacity` prop swapped from
    `haloOpacity * 0.4` → `{coneOpacity}`.

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| 15.xx cluster | 15.37 | 0.2973 | 22.95 |
| after_edit (street_clear_midday) | **15.10** | **0.2949** | **23.24** |

Within noise. At `fog_density=0` the cone-opacity formula reduces
to `haloOpacity * 0.4` — prior literal. Cone is gated on isNight
so midday unmounted anyway. PSNR drift is reference-side cluster
variability, not my edit.

Under §4.3 1 dB swap threshold — keep.

## §7.5 Effort breakdown
~8 min (plan + 5-line store sub + 1-line prop swap + tsc + harness
+ report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - Multiplier `1 + fogFactor * 1.5` rather than a linear `+ 1.5 *
    fogFactor` — scales relative to the existing `haloOpacity * 0.4`
    base, preserving the night-depth ramp inside the fog coupling.
  - Didn't clamp coneOpacity at an upper bound; the ceiling is
    `0.5 × 0.4 × 2.5 = 0.5` which still reads as a transparent
    cone, not a solid light slab.
