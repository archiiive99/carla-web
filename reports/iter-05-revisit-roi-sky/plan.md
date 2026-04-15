# iter-05-revisit-roi-sky plan

**Phase tag:** A (opened 2026-04-15T09:06:46Z)
**Time budget:** 1 h hard / 6 h watchdog

## Target row
> iter-05-revisit-roi-sky — Add sky-ROI mode to compare.py harness
> (≤30 min once iter-engine-weather-bp lands)

iter-engine-weather-bp didn't land cleanly (⚠️ revisit needed) but the
current harness — with iter-13-followon-harness-stabilize's NPC-clear
fix — IS reproducible. Adding the sky-ROI mode now means future
weather-related iterations can target sky-only metrics independently
of the road-ROI numbers (which are dominated by the unfixed lighting).

## Success looks like
  - `compare.py` accepts `--roi {road|sky}` flag (default: road, current
    behavior preserved).
  - `--roi sky` masks to the upper half of the frame and excludes
    rooftop/horizon non-sky pixels via a brightness threshold.
  - Sky-ROI numbers reflect Three.js Preetham `<Sky>` vs CARLA
    SkyAtmosphere parity at the chosen pose.
  - Two consecutive `--roi sky` runs at iter-01 pose produce PSNR
    within 2 dB of each other (reproducibility per iter-13-followon
    standard).

## Files in scope
  - `carla-web-bridge/tools/render_parity/compare.py` — add ROI mode
    flag, sky-mask helper, conditional polygon selection

## Out of scope
  - The road-ROI default behavior (no regression to existing
    `--label after_*` workflows)
  - Fixing the underlying BP weather chain (separate iteration)
  - Any per-iteration metric-bar tightening

## Phase B paths
  1. **Top-half rectangular ROI + brightness threshold mask**: select
     the top 50% of frame, then threshold-out pixels that are too dark
     (rooftops, distant trees). Simple, deterministic.
  2. **Per-pose curated sky polygon**: hand-pick a polygon for each
     pose. Higher fidelity but high maintenance — a separate polygon
     per future pose × weather × ToD.

Path 1 chosen. Single rule applies to all poses; brightness threshold
adapts to ambient (low when night, high when midday).

## Phase E acceptance
  - Two consecutive `--roi sky` runs at iter-01 pose: PSNR ΔΔ ≤ 2 dB.
  - Sky-ROI overlay PNG visually shows the masked sky region (white
    on the polygon, transparent elsewhere).
