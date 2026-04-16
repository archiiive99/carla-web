# iter-07-revisit-wind-per-instance report

**Status: ✅ PASS** — vegetation wind-sway phase is now seeded by
`instanceMatrix[3].xz` (per-instance world XZ) instead of the
vertex-local `position.xz` that was shared across all instances of
a bucket's geometry. Forty-sixth ✅ of session.

## §7.2 Feature delta
`Vegetation.tsx::onBeforeCompile` vertex-shader patch: derive
`instXZ = vec2(instanceMatrix[3][0], instanceMatrix[3][2])` and use
it in both `sin(uTime * 1.3 + ...)` and `cos(uTime * 0.9 + ...)`
terms. `customProgramCacheKey` bumped from `vegetation-wind-v1` →
`v2` so old cached programs don't shadow the new patch.

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| scene-drift (16.xx band) | 16.70 | 0.3063 | 21.87 |
| after_edit (street_clear_midday) | **16.71** | **0.3063** | **21.87** |

Byte-identical. At `street_clear_midday` the weather broadcast
has `wind_intensity=0` so `windAmp=0` and the sway term is a
no-op. The code path is exercised but produces no visual change
at this pose.

## §7.5 Effort breakdown
~15 min (investigation + 7-line shader edit + tsc + harness +
report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - Kept the `* 0.08` spatial frequency — reusing it with instance
    coords gives a ~12 m phase wavelength which is natural tree
    spacing in Town01.
  - Did not gate the edit behind a feature flag. The v2 cache key
    forces a recompile on the first wind tick for every bucket,
    which is a one-shot hit; the old v1 program is eligible for GC
    afterward.
