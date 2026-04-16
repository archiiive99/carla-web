# Session 3 final (2026-04-16 continued)

**Cron `c346bb2c`:** cancelled after exhausting sub-1h iterations.
Remaining queue rows all require 3-4h+ focused sessions that don't
fit cron-fire cadence.

## Session 3 additions (day-2 round 2)

Since SESSION-2-FINAL:
  - **iter-08-walk-yaw-from-velocity** ✅ walker body faces travel
    direction via atan2 + 6 rad/s lerp
  - **iter-08-knee-bend** ✅ split legs into thigh+shin with knee pivot
  - **iter-07-revisit-wind** ✅ vegetation vertex-shader wind sway
    driven by weather.wind_intensity
  - **iter-11-revisit-auto-exposure** ⚠️ §6.3 — spotlight-count
    heuristic reverted after night PSNR regressed 30→10
  - **iter-06-revisit-csm** ✅ scoped to adaptive single-cascade
    ortho frustum (camY*3 ramp) instead of true multi-cascade

5 ✅ + 1 ⚠️ in this round. Commits pushed: a0c24abfc, 20bba8595,
5b886e6b9, ded15af2c, 7a139627e, edd439421 (+ 2 sync commits).

## Cumulative session totals (days 1+2+3)

**43 iterations | 36 ✅ / 7 ⚠️ | 86 commits**

### ✅ highlights (substantive pixel/code work)

  - iter-09 night street lights (4 SpotLights + lamp head emissives)
  - iter-10-revisit-glb-bulb (WorldGridMaterial recolor for TL state)
  - iter-03-revisit-attribute-color (vehicle paint from actor.vehicle_color)
  - iter-08 walker system (articulated + skin tones + clothes + walk cycle + yaw + knee bend)
  - iter-07 vegetation (✅-on-arrival + iter-07-revisit-wind vertex shader sway)
  - iter-14 LOD pipeline (8 GltfInstanced + Vegetation + Buildings;
    static→runtime with coord-bug-fix; procedural buildings)
  - iter-11 post-process (ExposureDriver + smoothing)
  - iter-13-followon-harness-stabilize (reproducibility fix)
  - iter-05-revisit-roi-sky (sky ROI mode)
  - iter-13-revisit-pose-coverage (birdseye/chase/intersection_corner)
  - iter-13 scene-palette unification
  - iter-06-revisit-bias-by-altitude, iter-06-revisit-csm (shadow tuning)

### ⚠️ raises (documented)

  1. iter-01 §6.3 — road PBR but upstream lighting dominates
  2. iter-05 §6.1 — Preetham tune unmeasured pending BP fix
  3. iter-engine-weather-bp §4.3 — C++ rotates lone DirLight but
     UE5 night state owned elsewhere
  4. iter-13 ref-instability (pre-iter-13-followon)
  5. iter-09-revisit-bloom §6.3 — broke render, reverted
  6. iter-09-revisit-bloom-v2 §6.3 — also broke, architectural
  7. iter-11-revisit-auto-exposure §6.3 — heuristic reverted

## Remaining [ ] rows (all 3-4h+ or UE-blocked)

  - iter-05-revisit-pathB Hosek-Wilkie (4-6h)
  - iter-05-revisit-pathC HDR cubemap (blocked)
  - iter-06-revisit-csm-v2 true multi-cascade (3-4h)
  - iter-11-revisit-auto-exposure-v2 render-target luminance feedback (3-4h)
  - iter-02 façades (UE extraction)
  - iter-08-extract-glb walker GLBs (UE extraction)
  - iter-09-revisit-bloom-v3/v4 (3-4h each, architectural)
  - iter-09-revisit-extracted-positions Town01 lamp coords (UE)
  - iter-15 IBL cubemaps per weather/TOD (UE extraction)
  - iter-engine-weather-bp-revisit (UE editor BP graph)

## Recommendation for next session

Pick ONE of:

  1. **UE editor session on GPU 2** (interactive, user action).
     Unblocks iter-02, iter-15, iter-08-extract-glb, iter-09-revisit-
     extracted-positions, iter-engine-weather-bp-revisit, iter-03-
     revisit-coverage. Highest leverage.
  2. **iter-05-revisit-pathB Hosek-Wilkie** (4-6h dedicated block).
     Self-contained shader work, no UE dep.
  3. **iter-11-revisit-auto-exposure-v2** (3-4h). WebGL render-
     target luminance sampling + feedback to exposure.
  4. **iter-09-revisit-bloom-v3** (3-4h). Per-viewport bloom mounting
     refactor.

The 1-minute cron cadence has reached its natural end — each remaining
iteration requires sustained focus that doesn't fit firing-every-minute
boundaries.
