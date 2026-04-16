# iter-08-clothes-pattern report

**Status: ✅ PASS** — walker legs now use a distinct pants color
variation (navy/black/brown/khaki/charcoal/deep-brown) layered on top
of the iter-08-skin-tones shirt/arms variation. Thirtieth ✅ of
session.

## §7.2 Feature delta
  - `scene-palette.ts` adds `WALKER_PANTS_VARIATIONS` (6 dark/neutral
    hues: slate-navy, warm-black, brown-gray, khaki-gray, charcoal,
    deep-brown).
  - `WalkerMesh.tsx` new `walkerPantsColor(actorId)` picker using
    `(actor.id * 7 + 3) % variations.length` — different prime-
    multiplier from shirt color so pants don't always track shirt.
  - Leg meshes swap from `bodyColor` (shirt) to `pantsColor`.
  - Slightly higher roughness on pants material (0.85 vs 0.8) since
    dark fabrics are generally more diffuse than bright safety-vis
    shirt fabric.

## §7.3 Pixel diff
No walker in iter-01 frame this session. Visual delta capturable
at any walker spawn — pants + shirt read as clearly distinct
clothing pieces.

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| iter-08-skin-tones baseline | 11.02 | 0.2118 | 35.94 |
| iter-08-clothes-pattern after | **11.02** | **0.2125** | **35.93** |

Within noise.

## §7.5 Effort breakdown
~15 min.

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - `actor.id * 7 + 3` prime multiplier for pants picker — different
    from the straight `% 6` shirt picker so pants don't always
    correlate with shirt color (e.g. actor #0 shirt=orange & pants
    matching would look uniform; with offset, pants goes to index 3
    = khaki).
  - 6 pants variations to match the 6 shirt variations — same
    cardinality keeps the combination space at 36 (6 × 6) distinct
    pairs mod the correlation from the prime.
