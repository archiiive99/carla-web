# iter-07-revisit-trunk-vary report

**Status: ✅ PASS** — procedural-fallback vegetation trunks now
vary their color per instance via `trunkMesh.setColorAt(i, ...)`
with a `±15%` value perturbation on `TREE_TRUNK`. Pairs with the
existing canopy per-instance variation so adjacent procedural
trees no longer read as identical bark slabs. Fifty-eighth ✅ of
session.

## §7.2 Feature delta
`Vegetation.tsx::ProceduralVegetation`:
  - Inside the per-instance loop, after `trunkMesh.setMatrixAt(i, ...)`,
    compute `trunkV = 0.85 + rand() * 0.30` and
    `trunkMesh.setColorAt(i, TREE_TRUNK × trunkV)`.
  - After the loop, flush `trunkMesh.instanceColor.needsUpdate = true`.

Deterministic LCG seed (unchanged) so runs are reproducible.

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| scene-drift (16.xx band) | 16.70 | 0.3063 | 21.87 |
| after_edit (street_clear_midday) | **16.76** | **0.3057** | **21.84** |

Within noise. `GltfVegetation` is the primary path; procedural is
the `<Suspense fallback>`. The change is only visible when GLBs
fail to load.

## §7.5 Effort breakdown
~15 min (plan + 8-line per-instance color loop + needsUpdate flush
+ tsc + harness + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - 15% V-perturbation only (no hue shift). TREE_TRUNK is a
    desaturated brown — hue-shifting would push some trunks toward
    red/green that don't match bark. Value-only stays on the
    perceptual "brown axis".
  - Share the existing LCG seed with canopy variation so the two
    per-instance streams don't collide on a fresh seed but do
    stay deterministic across reruns.
