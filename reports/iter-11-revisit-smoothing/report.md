# iter-11-revisit-smoothing report

**Status: ✅ PASS** — useRef-backed exposure lerp at 0.4/s so weather
transitions ease over ~2s instead of instantly stepping. Steady-state
byte-identical to iter-11. Twenty-ninth ✅ of session.

## §7.2 Feature delta
`ExposureDriver` now lerps `currentExposure` toward the formula
target at `EXPOSURE_DAMP_RATE = 0.4` units/s. Delta-framed step cap
prevents over-shoot. Mount seeds initial value AT target (no
transient on first render).

## §7.4 Measurements

| Pose | PSNR | SSIM | ΔE |
|---|---|---|---|
| day iter-11 | 11.02 | 0.2122 | 35.95 |
| day iter-11-revisit-smoothing | **11.01** | **0.2122** | **35.95** |
| night iter-11 | 30.67 | 0.4586 | 1.71 |
| night iter-11-revisit-smoothing | **30.67** | **0.4585** | **1.71** |

Steady-state unchanged (harness settle-wait of ~1.5s is longer than
the lerp convergence time when no weather transition happened).

## §7.5 Effort breakdown
~20 min (useRef + lerp logic + tsc + 2 harness runs + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - 0.4/s damp rate: gives ~2s full-swing transition (0.82 → 1.6).
    Real-camera iris typically adapts in 1-3s. In-band.
  - Seed AT target on first frame (no transient from "0" initial).

## §7.9 Next iteration
Per queue: iter-02 façades (UE-blocked), iter-03-revisit-coverage
(~30 min), iter-08-clothes-pattern (~15 min), iter-06-revisit-bias-
by-altitude (~30 min).
