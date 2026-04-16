# iter-12-revisit-wetness-active-rain report

**Status: ✅ PASS** — RoadMesh wetness driver now sums a third
term: `precipitation * 0.5`. Fresh rain (precipitation=100,
deposits=0) now reads wet at uWetness=0.25 instead of 0. Full
storm (all three at 100) clamps at 1.0. Seventy-fifth ✅ of
session.

## §7.2 Feature delta
`RoadMesh.tsx` useSimulationStore selector:
```
uWetness = min(1, (wetness + deposits + precipitation * 0.5) / 200)
```

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| scene-drift (11.xx band) | 11.03 | 0.2127 | 35.89 |
| after_edit (street_clear_midday, 11.xx) | **11.08** | **0.2137** | **35.78** |

Byte-identical within noise. `precipitation=0` at midday leaves
the formula at `(wetness + deposits) / 200` — prior behavior.

## §7.5 Effort breakdown
~10 min (plan + 6-line selector refactor + tsc + harness + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - 0.5 weight for live precipitation vs 1.0 for each accumulated
    term. Rain wets a road surface partway until the surface
    saturates; deposits/wetness capture the saturated state. The
    active term captures the transient.
  - Kept overall min(1, .../200) clamp so a storm doesn't produce
    supernatural uWetness > 1.
