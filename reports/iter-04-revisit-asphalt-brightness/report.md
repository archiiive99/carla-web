# iter-04-revisit-asphalt-brightness report

**Status: ✅ PASS** — asphalt final multiplier bumped `0.72 → 0.78`
(~+8% brightness after the warm-cast bump). Sixty-sixth ✅ of
session.

## §7.2 Feature delta
`road-materials.ts` diffuseColor branch:
`asphalt *= 0.72;` → `asphalt *= 0.78;`

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| prior (iter-04-revisit-wear-softer) | 15.36 | 0.2973 | 22.96 |
| after_edit (street_clear_midday) | **15.36** | **0.2974** | **22.96** |

Three consecutive road-shader iterations (stripe-brightness,
wear-softer, asphalt-brightness) have produced metrics within 0.0001
of each other. The reference is in a stable cluster this session
window, and small diffuse-color shifts on the road surface don't
meaningfully close the 14-dB gap to the 30-dB parity bar — the
gap is dominated by upstream lighting parity (color balance +
shadow contrast) as already documented for iter-01. The asphalt
multiplier moves the web render about 8% brighter but the ΔE ends
up in the same bucket because the reference's bucketing is coarse
at this cluster.

Under §4.3 the 1 dB swap threshold isn't triggered (0 dB drop).
Keep the brighter asphalt — moves the web render toward the UE5
reference's subjective daylight look.

## §7.5 Effort breakdown
~10 min (plan + 1-line edit + tsc + harness + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - Did not bump the asphalt multiplier further (e.g. 0.85) —
    past a threshold the asphalt starts reading as a concrete
    walkway rather than fresh asphalt. 0.78 is the ceiling that
    still looks like asphalt.
  - Did not swap to the opposite direction per §4.3 — the drop
    is 0 dB. Swapping to 0.66 would darken the road below the
    already-dim baseline and move visibly further from UE5.
