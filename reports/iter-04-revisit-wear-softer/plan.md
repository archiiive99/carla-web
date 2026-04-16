# iter-04-revisit-wear-softer plan

`wear = 1.0 - smoothstep(0.35, 0.85, grunge) * 0.65` multiplies
stripe mask + roughness — high grunge wipes 65% of paint opacity.
Crisp-paint regions (most of Town01's road) get over-chipped at
this depth. Ease to 0.50 (50% max wipe) so authored-bright stripes
stay authored-bright.

Same change applied in both the diffuseColor branch and the
roughnessmap branch (both compute `wear` / `wearR` with the same
coefficient).

Out of scope: texture-swap, per-segment variation.

Acceptance: tsc clean; metrics may shift (stripes in road-ROI).
If PSNR drops > 1 dB vs 15.xx cluster, trigger §4.3 swap.
