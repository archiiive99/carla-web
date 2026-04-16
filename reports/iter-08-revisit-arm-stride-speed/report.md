# iter-08-revisit-arm-stride-speed report

**Status: ✅ PASS** — arm swing amplitude now scales with walker
speed: `armScale = 0.7 + min(speed, 2.5)/2.5 * 0.5` → effective
arm swing range [0.245, 0.42] rad across the walker speed range.
Leg swing (0.55 rad) unchanged. Seventieth ✅ of session.

## §7.2 Feature delta
`WalkerMesh.tsx` useFrame:
```
armScale = 0.7 + Math.min(speed, 2.5) / 2.5 * 0.5
armSwing = phaseSin * 0.35 * armScale
```

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| 15.xx cluster | 15.36 | 0.2974 | 22.96 |
| after_edit (street_clear_midday) | **15.37** | **0.2973** | **22.95** |

Byte-identical within noise. Walkers outside the road-ROI
rectangle at iter-01 pose.

## §7.5 Effort breakdown
~8 min (plan + 3-line edit + tsc + harness + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - 2.5 m/s speed cap = brisk-walk territory; above that the
    walker is running and would need a different gait cycle
    entirely (future iter-08-run-cycle).
  - 0.7-1.2 range keeps the slow end from looking frozen (0.245
    is still a visible swing) and the fast end from flailing
    (0.42 is still natural for a brisk walk).
  - Did not scale leg swing. Leg stride is already locked to
    velocity via walk-phase increment `* speed * 1.8`; adding a
    speed-based amplitude on top would double-couple to speed.
