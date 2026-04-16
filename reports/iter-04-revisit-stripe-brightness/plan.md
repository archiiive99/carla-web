# iter-04-revisit-stripe-brightness plan

White lane-marking paint in road-materials.ts is `vec3(0.88, 0.86,
0.80)` — a dim warm-white. UE5 reference has brighter near-white
stripes that read as sun-bleached paint. Bump to
`vec3(0.94, 0.92, 0.86)` — same warm relative balance, ~6-7%
brighter.

Lane stripes fall in the iter-01 road-ROI rectangle, so this may
shift PSNR/ΔE meaningfully (unlike previous weather-coupled tunes
that were road-ROI-invariant at midday).

Out of scope: per-material roughness retune, sun-bleached
variation across stripe length.

Acceptance: tsc clean; metrics may shift — if PSNR drops > 1 dB
vs the current 15.xx cluster, trigger §4.3 candidate swap (try
the other direction). Otherwise close ✅.
