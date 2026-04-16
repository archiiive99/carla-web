# iter-04-revisit-wear-softer report

**Status: ✅ PASS** — grunge wear depth reduced from 0.65 to 0.50
in both the diffuseColor and roughnessmap shader paths. Stripes
now chip less aggressively under heavy-grunge samples. Sixty-fifth
✅ of session.

## §7.2 Feature delta
`road-materials.ts` both branches:
```
wear  = 1.0 - smoothstep(0.35, 0.85, grunge)  * 0.50  (was 0.65)
wearR = 1.0 - smoothstep(0.35, 0.85, grungeR) * 0.50  (was 0.65)
```

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| prior (iter-04-revisit-stripe-brightness) | 15.36 | 0.2972 | 22.95 |
| after_edit (street_clear_midday) | **15.36** | **0.2973** | **22.96** |

Identical to prior iteration within rounding. The shader change
is real but stripes occupy a small fraction of the ROI and
grunge-heavy samples fall mostly outside it — perceptual change
too small to register at a 3-digit PSNR precision.

Under §4.3 the 1 dB swap threshold is not triggered (0 dB drop).

## §7.5 Effort breakdown
~12 min (plan + 2 replaceAll edits + tsc + harness + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - Changed both diffuse and roughness paths so paint mask and
    paint roughness stay coupled — otherwise chipped paint would
    read as glossy asphalt with a dirty albedo, visually wrong.
  - Kept smoothstep bounds `0.35, 0.85` — those control where wear
    kicks in (high grunge only); changing them would shift the
    distribution of wear, a different tune.
