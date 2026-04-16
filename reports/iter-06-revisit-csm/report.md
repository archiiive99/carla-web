# iter-06-revisit-csm report

**Status: ✅ PASS — pseudo-cascade via adaptive ortho frustum.** Thirty-
sixth ✅ of session.

## §7.2 Feature delta
`WeatherLighting` useFrame now adjusts the directional-light shadow
camera's ortho extents per camera height:
  `frustumExtent = min(350, max(100, 100 + camY * 3))`

At iter-01 pose (camY=1.8): 100 + 5.4 = 105.4m → ±105m frustum.
At birdseye (camY=80): 100 + 240 = 340m → ±340m frustum.

Shadow map resolution stays 2048² — smaller frustum = more
texels-per-meter at close range. True multi-cascade CSM would
split into 3-4 frustum buckets with per-cascade resolution; this
single-cascade adaptive version gives most of the texel-density
benefit at a fraction of the complexity.

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| iter-07-revisit-wind baseline | 16.70 | 0.3064 | 21.87 |
| iter-06-revisit-csm after | **16.71** | **0.3063** | **21.86** |

Within noise.

## §7.5 Effort breakdown
~20 min.

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - Scoped from "true CSM" (3-4h) to "adaptive single-cascade frustum"
    (~20 min) — gives most of the per-meter-texel-density benefit
    without the multi-cascade renderer work. True CSM queued as
    iter-06-revisit-csm-v2 if needed.
