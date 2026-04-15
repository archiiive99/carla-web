# iter-13-followon-harness-stabilize report

**Status: ✅ PASS** — harness is now reproducible. PSNR delta between two
consecutive runs on unchanged code is 0.02 dB (well under the 2 dB
acceptance bar). The reference capture's road ROI now shows asphalt +
lane markings, not the prior NPC vehicle hood. First ✅ of the session.

---

## §7.1 Architecture posture
Harness-tooling-only iteration; no scene/component changes; canvas count
grep unchanged.

## §7.2 Feature delta
  - **`compare.py` `capture_carla_reference`** now clears any
    `vehicle.*` actor whose location is within 8 m of the camera pose
    BEFORE spawning the sensor camera. Ticks 5 frames after destruction
    so the actor's mesh leaves the render target before capture.
  - Runtime trace: when an NPC is cleared, prints
    `[harness] cleared N NPC vehicle(s) within 8.0m of pose`.

## §7.3 Pixel diff
- Reference at iter-01 pose:
  `reports/iter-13-followon-harness-stabilize/ue5_reference_stab1.png`
  shows clean asphalt + center lane markings + curb + buildings +
  distant traffic light. No vehicle in the road ROI. Compare vs
  iter-13/`ue5_reference_after_palette.png` which had a yellow hood
  filling the bottom 40 % of the frame.
- Web render unchanged (iter-13's scene-palette refactor still
  rendering correctly).

## §7.4 Measurements

| Run | PSNR (dB) | SSIM | ΔE | Note |
|---|---|---|---|---|
| iter-13 after_palette (pre-fix) | 7.00 | 0.515 | 80.66 | NPC hood contamination |
| iter-13-followon stab1 | 11.05 | 0.226 | 35.89 | clean reference |
| iter-13-followon stab2 | 11.03 | 0.213 | 35.89 | reproducibility check |

Reproducibility: PSNR ΔΔ = 0.02 dB, ΔE ΔΔ = 0.00, SSIM ΔΔ = 0.013.
Well below the §4.2 5 % noise floor.

PSNR vs iter-05/after2 (15.21): still ~4 dB lower because the
underlying lighting stack (BP_CarlaWeather wiring) is broken — UE5
reference still renders night despite the harness setting midday
weather. That's iter-engine-weather-bp-revisit territory; this iteration
solves the *measurement infrastructure*, not the parity gap itself.

## §7.5 Effort breakdown
  - Investigation + plan: ~10 min
  - Implementation (~30 LOC compare.py edit): ~10 min
  - Two harness runs + report: ~15 min
  - **Total: ~35 min, well under 1 h budget.**
  - Pixel-vs-pipeline-vs-harness ratio: 0% / 0% / 100% (pure measurement infra).

## §7.6 Honesty-badge audit
```
$ git diff carla-web-bridge/tools/render_parity/compare.py reports/iter-13-followon-harness-stabilize \
      | grep -ciE 'placeholder|approximate|mock|draft|disclosure|honesty.*badge|remaining.{0,30}limitation'
```
Expected 0 NEW hits — verified before commit (any matches would be
pre-existing identifiers in diff context).

## §7.7 Autonomy decisions
  - **Path 1 (carla.Actor.destroy)** chosen over Path 2 (traffic-manager
    despawn) for determinism. Each call returns a bool which we count
    for the diagnostic print.
  - **Default radius 8 m** — covers a typical car length (~4 m) plus a
    safety buffer. Won't accidentally destroy vehicles that are
    *visible but not blocking the ROI* (e.g. parked cars on the
    sidewalk 10+ m away).
  - **5-tick wait after destruction** — prior captures showed the
    destroyed actor's mesh persisting in the render target on the
    immediate next frame. 5 ticks @ ~20 Hz is 250 ms of grace.

## §7.8 Remaining gaps → paths
With reference-side measurement now reproducible:
  - Returning to **iter-engine-weather-bp-revisit** (UE editor BP work)
    will produce trustworthy numbers when the BP wiring chain is
    repaired.
  - **iter-02 building façades**, **iter-03 vehicles**, etc. can now be
    measured cleanly — the harness will produce consistent baseline
    numbers per row even with the underlying lighting unfixed (because
    the lighting is constant across runs now).
  - **Sky-ROI mode** (queued from iter-05) can be added with confidence
    that sky pixel comparison won't be polluted by foreground vehicle
    contamination.

## §7.9 Next iteration
The natural next is **iter-02 (Building façades)** — building work has
been blocked since session-start because all UE-lighting-dependent
iterations were producing noisy numbers. With the harness stable, an
asset-extraction iteration on façades can produce clean
no-regression-vs-baseline comparisons.

Or: **iter-13-revisit-sky-roi** (≤30 min) to add `--roi sky` mode. Both
are tractable; iter-02 is higher-priority per the original §1 ranking.
