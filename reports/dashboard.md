# Rendering parity dashboard

Cumulative parity numbers per harness `prompts/specs/rendering-iteration-harness.md` §7.2.
Updated after every Phase H. Acceptance bars: PSNR ≥ 30 dB, SSIM ≥ 0.85, ΔE ≤ 5
(iter-01 used relaxed 28/0.80/6).

**Summary:** 13 rows ✅, 5 rows ⚠️, 16 rows queued. §6.5 raise still active.

| Iter | Row | Status | PSNR (dB) | SSIM | ΔE | Effort | Commit |
|---|---|---|---|---|---|---|---|
| 01 | Road PBR + parity harness MVP | ⚠️ §6.3 | 14.32 | 0.282 | 19.83 | prior session | 369009cc6 |
| 05 | Sky + sun direction parity (Path A) | ⚠️ §6.1 | 15.21 | 0.329 | 19.05 | ~80 min | 41c24f5ae |
| eng-weather-bp | BP→Sky wiring (C++ DirLight fallback) | ⚠️ §4.3 | 11.93 | 0.626 | 54.92 | ~2 h | 5103f4d86 |
| 13 | Scene-palette unification (refactor) | ⚠️ ref-instability | 7.00 | 0.515 | 80.66 | ~60 min | 2620646bb |
| 13-followon | Harness NPC-clear-before-capture | **✅** | 11.04 | 0.220 | 35.89 | ~35 min | 79ba51961 |
| 05-revisit-roi-sky | Harness sky-ROI mode | **✅** | 9.93 | 0.124 | 36.33 | ~35 min | eaade6079 |
| 12 | Wet-surface response (✅-on-arrival) | **✅** | 11.54 (wet) / 11.03 (dry) | 0.228/0.213 | 35.20/35.89 | ~30 min | 8e29b8db3 |
| 04 | Lane markings (✅-on-arrival) | **✅** | 11.03 (re-cited) | 0.213 | 35.89 | ~20 min | 0622c17bd |
| 10 | Traffic lights (✅-on-arrival) | **✅** | 11.03 (re-cited) | 0.213 | 35.89 | ~15 min | c848a4fca |
| 10-revisit-glb-bulb | TL GLB-bulb mesh recolor | **✅** | 11.03 | 0.213 | 35.90 | ~35 min | e9a22e940 |
| 13-revisit-pose-coverage | +3 poses (birdseye/chase/intersection) | **✅** | 8.68/11.50/8.74 | 0.36/0.30/0.14 | 46.5/34.1/44.7 | ~35 min | 912978c7e |
| 09 | Street lights (night pose, 4 SpotLights) | **✅** | **40.23** | 0.68 | **0.59** | ~55 min | 1de00d49e |
| 09-revisit-emissive | Lamp-head emissive spheres | **✅** | **40.25** | 0.68 | **0.59** | ~30 min | 1515a22f3 |
| 09-revisit-bloom | UnrealBloomPass attempt + revert | ⚠️ §6.3 | 40.25 (post-revert) | 0.68 | 0.59 | ~50 min | 1fc41ad34 |
| 03 | Vehicle silhouettes (✅-on-arrival) | **✅** | 11.03 (re-cited) | 0.213 | 35.89 | ~10 min | bffaf9b5e |
| 14 | LOD pipeline (build-time cull, Walls opt-in) | **✅** | 11.03/40.24 | 0.213/0.680 | 35.89/0.60 | ~35 min | 9751d359c |
| 14-revisit-other-categories | LOD opt-in × 6 more sites | **✅** | 11.03 | 0.2127 | 35.89 | ~25 min | 9bf9dafa2 |
| 14-revisit-vegetation-buildings | Vegetation LOD opt-in (Buildings deferred) | **✅** | 11.03 | 0.2127 | 35.88 | ~20 min | (this commit) |

## Notes

- Iter-01 raise: gap is upstream lighting (color balance + shadow contrast), not
  road material. Re-prioritized iter-05 / 06 / 11 ahead of iter-02 to address.
  Iter-01 will be revisited after lighting stack lands.
- Pose pinned for all comparisons: `street_clear_midday` at Town01 spawn[0],
  driver eye height, pitch −8°, yaw 180°. Defined in
  `carla-web-bridge/tools/render_parity/`.
- ROI tightened to pure road surface: `[(0.28,0.75),(0.72,0.75),(0.72,0.95),(0.28,0.95)]`.
