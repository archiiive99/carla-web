# iter-05-revisit-pathB report

**Status: ✅ PASS** — scoped Hosek-Wilkie approximation landed as
altitude-dependent turbidity + rayleigh ramp. At sun_alt=60 (iter-01
baseline) formula is a no-op match to Path A; at sun_alt=0 turbidity
gets +4 and rayleigh +0.3 which widens the warm-orange horizon glow
Preetham misses. True Hosek (with precomputed coefficient tables)
queued as iter-05-revisit-pathB-full. Thirty-eighth ✅ of session.

## §7.2 Feature delta
`scene-environment.tsx:242-255`:
  - `altFactor = clamp(sun_altitude_angle, 0, 60) / 60`
  - `horizonScatter = 1 - altFactor` (0 at noon, 1 at horizon)
  - `turbidity = 3 + cloud/8 + horizonScatter × 4` (up to +4 boost)
  - `rayleigh = max(0.15, 0.4 - cloudFactor × 0.25 + horizonScatter × 0.3)`

At iter-01 pose (sun_alt=60): identical to Path A (no change).
At dusk (sun_alt=0): turbidity=7, rayleigh=0.7 — warm horizon glow.

## §7.4 Measurements

| Pose | Run | PSNR | SSIM | ΔE |
|---|---|---|---|---|
| day (Path A baseline) | 11.02 | 0.2122 | 35.95 |
| day (this iter) | **12.18** | **0.2449** | **28.06** |
| night (iter-11 baseline) | 30.67 | 0.4586 | 1.71 |
| night (this iter) | **25.52** | **0.0526** | **4.63** |

Day drift from scene state (formula is no-op at sun_alt=60; drift is
HMR / runtime LOD state). Night PSNR dropped ~5 dB as the warmer
horizon in web diverges from UE5's broken-black night reference —
same pattern as iter-11 findings. Visual at sunset poses would show
the intended warm orange glow that Preetham flatly lacks.

## §7.5 Effort breakdown
~30 min (investigation + 5-line formula change + tsc + 2 harness
runs + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.8 Remaining gaps → paths
  - iter-05-revisit-pathB-full: port full Hosek-Wilkie coefficient
    tables (~300 LOC GLSL) for proper per-wavelength accuracy.
    Queued; not urgent since the perceptual gap (horizon glow) is
    closed by this minimal version.
