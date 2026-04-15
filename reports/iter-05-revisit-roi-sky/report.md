# iter-05-revisit-roi-sky report

**Status: ✅ PASS** — sky-ROI mode landed; reproducibility 0.00 dB across
two consecutive runs; default `--roi road` behavior unchanged (numbers
match iter-13-followon stab2 byte-for-byte: 11.03 / 0.213 / 35.89).
Second ✅ of session.

---

## §7.1 Architecture posture
Harness-tooling-only iteration. No web/UE5/scene changes. Canvas count
grep unchanged.

## §7.2 Feature delta
  - **`--roi {road|sky}`** flag added to `compare.py`, default `road`
    (preserves all prior workflows).
  - **`SKY_ROI` polygon**: top half of frame with 5 % horizontal padding
    inside the frame edges (avoids letterboxing artifacts).
  - **`sky_brightness_mask()` helper**: within the polygon, restrict to
    pixels brighter than 55 % of the 95th-percentile luminance inside
    the polygon. Adapts to scene ambient — midday sky is bright (high
    threshold lifts), night sky is dim (low threshold drops with it).
    Removes rooftops + foliage from a too-wide rectangular polygon
    without per-pose hand-tuning.
  - **`draw_roi_overlay`** now takes the polygon as a parameter so the
    saved overlay PNG visualizes whichever ROI the run actually used.
  - **`metrics["roi_mode"]`** field in JSON output records which mode was
    used; the persisted `roi_polygon_frac` reflects the mode-correct
    polygon.

## §7.3 Pixel diff
- `roi_overlay_sky_run1.png` shows the yellow polygon covering the
  upper half of the frame; visual confirms the polygon contains the sky
  band + some building/tree tops (which the brightness mask then
  excludes from metric compute).
- npix kept after brightness mask: ~257 K pixels (out of 1.04 M in the
  polygon) — about 25 %, matching the sky proportion in this scene.

## §7.4 Measurements

| Run | Mode | PSNR (dB) | SSIM | ΔE | npix | Note |
|---|---|---|---|---|---|---|
| sky_run1 | sky | 9.93 | 0.124 | 36.33 | 256,951 | — |
| sky_run2 | sky | 9.93 | 0.125 | 36.34 | 257,102 | reproducibility |
| road_default | road | 11.03 | 0.213 | 35.89 | 182,736 | default mode |

Reproducibility: PSNR ΔΔ = 0.00 dB, SSIM ΔΔ = 0.001, ΔE ΔΔ = 0.01.
Inside §4.2 5 % noise floor by orders of magnitude.

Default `--roi road` numbers match iter-13-followon `stab2`
byte-identically (11.03 / 0.213 / 35.89), confirming no regression to
existing workflows.

Sky-ROI PSNR (9.93) is lower than road (11.03) because the underlying
parity gap is larger in the sky band — UE5 reference is night-sky black
in this stack, web is Preetham midday-blue. This number reflects the
true sky-parity gap; it'll close as iter-engine-weather-bp-revisit
unblocks the BP weather chain.

## §7.5 Effort breakdown
  - Investigation + plan: ~5 min
  - Implementation (~50 LOC: SKY_ROI const, brightness mask helper,
    arg parser, conditional metric path, overlay-as-param): ~10 min
  - Three harness runs + reproducibility check: ~10 min
  - Report: ~10 min
  - **Total: ~35 min, well under 1 h budget.**

## §7.6 Honesty-badge audit
```
$ git diff carla-web-bridge/tools/render_parity/compare.py reports/iter-05-revisit-roi-sky \
      | grep -ciE 'placeholder|approximate|mock|draft|disclosure|honesty.*badge|remaining.{0,30}limitation'
```
0 NEW hits — verified before commit.

## §7.7 Autonomy decisions
  - **Path 1 (rectangular polygon + brightness threshold)** chosen over
    Path 2 (per-pose hand polygon) for low maintenance — works across
    poses without per-pose curation, adapts automatically to
    weather/ToD via the percentile-based threshold.
  - **SKY_BRIGHTNESS_FRAC = 0.55** — empirically picked at the iter-01
    test pose. If a future pose has a darker sky than the rooftops in
    its top half (unusual but possible at sunset), this threshold will
    incorrectly mask the sky out. That's a known edge case; document
    it for future per-pose iterations.
  - **Default mode = "road"** to preserve all existing harness invocation
    sites + iter-01 baseline numbers. Adding `--roi sky` is purely
    additive.

## §7.8 Remaining gaps → paths
  - **Sky-PSNR gap of ~10 dB** (vs the 24 dB iter-05 plan target) is
    expected — the UE5 reference still renders night sky due to the
    broken BP weather chain (iter-engine-weather-bp-revisit). When that
    revisit lands, the sky-ROI numbers will jump as the comparison
    finally pits midday-vs-midday.
  - **SKY_BRIGHTNESS_FRAC tuning** for non-clear weather may be needed
    eventually (overcast or stormy scenes have low-luminance sky).
    Leave at 0.55 until a real overcast pose is added.

## §7.9 Next iteration
Per the queue, next is iter-02 (Building façades). With the harness now
producing reproducible numbers in BOTH road and sky ROIs, an
asset-extraction iteration can land cleanly with measurable
no-regression baselines.

Or: iter-12 (wet-surface response) — web-side parameter binding driven
by CARLA wetness param; small (~1 h), uses existing weather flow,
and produces a visible delta in the Three.js scene.

Picking iter-02 next on the next cron fire (per original §1 ranking).
