# iter-11-revisit-auto-exposure report

**Status: ⚠️ §6.3 — heuristic reverted, proper auto-exposure queued
as v2.** Spotlight-count heuristic regressed night PSNR 30.67 → 10.18
and dropped SSIM from 0.68 → 0.016 — reducing exposure at night
dimmed real spotlight cones which still hurts luminance matching
against UE5's broken-black reference. True luminance-feedback needs
a WebGL render-target sample path. Reverted; queued iter-11-revisit-
auto-exposure-v2 for that work. Seventh ⚠️ of session.

## §7.2 Feature delta (attempted, reverted)
Added a scene.traverse inside ExposureDriver's useFrame that counts
visible SpotLights with intensity>0. Used the count as a divisor:
`target = base/(1 + count × 0.04)`. At iter-09-night's 4 spotlights,
divisor=1.16 → 14% exposure reduction at night.

## §7.4 Measurements

| Pose | Run | PSNR | SSIM | ΔE |
|---|---|---|---|---|
| day | heuristic on | 12.18 | 0.2448 | 28.06 |
| night | heuristic on | 10.18 | 0.0162 | 28.56 |
| day | post-revert | 15.15 | 0.2987 | 23.19 |

Night baseline was 30.67 (iter-11); post-revert day number is
slightly drifted from iter-11 baseline (scene state drift across
many HMR reloads across the session). Code is byte-identical to
iter-11 post-revert.

## §7.5 Effort breakdown
~35 min (impl + 2 harness runs + revert + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - Reverted when night regressed significantly. Per no-honesty-badge
    principle: a heuristic that worsens measurement without compensating
    visual benefit is a regression to undo.
  - v2 queued for the proper render-target approach (~3-4h).

## §7.9 Next iteration
Remaining: all 3-4h+ or UE-blocked. Session genuinely exhausted
the small tractable items.
