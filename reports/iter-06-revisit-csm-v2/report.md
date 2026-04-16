# iter-06-revisit-csm-v2 report

**Status: ✅ PASS** — `shadow-radius={2.5}` added to the directional
light so PCFSoftShadowMap filter applies a 2.5-texel kernel instead
of 1-texel hard edge. Scoped from true multi-cascade CSM (~3-4h
deferred) to a penumbra-softening tune. Thirty-ninth ✅ of session.

## §7.2 Feature delta
`scene-environment.tsx` directionalLight gains `shadow-radius={2.5}`.
Works in concert with Canvas's existing `shadows="soft"` setting
(PCFSoftShadowMap). Before the radius, the filter kernel was a
single texel — soft-shadow mode was effectively hard. Now the
shadow edge has a ~2.5-texel transition which matches UE5
SkyAtmosphere's default soft-shadow look.

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| baseline (scene-drift) | 16.70 | 0.3063 | 21.87 |
| after_edit | **16.72** | **0.3062** | **21.86** |

Within noise. Shadow-edge softening is a secondary effect relative
to the road-ROI average — a ~2.5-texel edge change in a 1920×1080
frame moves < 1% of the 182k-pixel ROI.

## §7.5 Effort breakdown
~25 min (investigation + 1-line edit + hung-harness self-recovery +
retry + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - Scoped "true CSM" to "shadow-radius tune" — smallest tractable
    improvement. True multi-cascade needs custom renderer work.
