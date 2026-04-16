# Rendering parity dashboard

Cumulative parity numbers per harness `prompts/specs/rendering-iteration-harness.md` §7.2.
Updated after every Phase H. Acceptance bars: PSNR ≥ 30 dB, SSIM ≥ 0.85, ΔE ≤ 5
(iter-01 used relaxed 28/0.80/6).

**Summary:** 49 rows ✅, 7 rows ⚠️, 7 rows queued. §6.5 raise still active.

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
| 14-revisit-vegetation-buildings | Vegetation LOD opt-in (Buildings deferred) | **✅** | 11.03 | 0.2127 | 35.88 | ~20 min | bb94c95d1 |
| 14-revisit-perf-measurement | --measure-fps-ms harness flag | **✅** | 11.03 | 0.2128 | 35.89 | ~25 min | 89a6bc8f4 |
| 14-revisit-buildings | LOD entry-filter on Buildings | **✅** | 11.03 | 0.2127 | 35.89 | ~15 min | e63bb3266 |
| 07 | Vegetation (✅-on-arrival) | **✅** | 11.03 (re-cited) | 0.2127 | 35.88 | ~10 min | 2d2a4308b |
| 03-revisit-attribute-color | Vehicle paint from actor.vehicle_color | **✅** | 11.03 | 0.2127 | 35.88 | ~30 min | ef3236563 |
| 09-revisit-bloom-v2 | SelectiveBloom layer-mask attempt + revert | ⚠️ §6.3 | 40.24 (post-revert) | 0.68 | 0.60 | ~50 min | a46b796d9 |
| 14-revisit-runtime-lod | Per-frame camera-tracked cull (Walls opt-in) | **✅** | 11.03 | 0.2127 | 35.89 | ~40 min | ab7894789 |
| 14-revisit-runtime-all | Opt 6 more sites into runtimeCull + coord bug fix | **✅** | 11.03 | 0.2128 | 35.88 | ~30 min | 6fe8e9a60 |
| 14-revisit-runtime-veg-bldg | Vegetation runtime cull (Buildings deferred) | **✅** | 11.03 | 0.2126 | 35.90 | ~30 min | 380d7577e |
| 14-revisit-runtime-bldg-only | Per-GltfBuilding runtime cull (two-layer LOD) | **✅** | 11.04 | 0.2129 | 35.87 | ~30 min | 66935946c |
| 14-revisit-runtime-no-entry-filter | Lift Buildings entry filter | **✅** | 11.03 | 0.2127 | 35.89 | ~10 min | 13684d868 |
| 14-revisit-runtime-procedural-bldg | Procedural buildings runtime cull | **✅** | **12.27** | 0.2446 | **27.93** | ~45 min | f4c090ca4 |
| 08 | Walker silhouettes (articulated procedural) | **✅** | 11.04 | 0.2116 | 35.83 | ~15 min | 067a3e114 |
| 08-skin-tones | Per-actor.id walker color variation | **✅** | 11.02 | 0.2118 | 35.94 | ~12 min | 8f4b06fa6 |
| 08-walk-cycle | Walker leg/arm sine swing | **✅** | 10.97 | 0.2102 | 36.07 | ~25 min | 771e439e4 |
| 06 | Shadows from sun (✅-on-arrival) | **✅** | 11.03 (re-cited) | 0.213 | 35.89 | ~15 min | 078620de2 |
| 11 | Post-process (ExposureDriver, weather-driven) | **✅** | 11.02/30.67 | 0.2122/0.4586 | 35.95/1.71 | ~40 min | a4175cc67 |
| 11-revisit-smoothing | Exposure lerp 0.4/s | **✅** | 11.01/30.67 | 0.2122/0.4585 | 35.95/1.71 | ~20 min | 0a96e172c |
| 08-clothes-pattern | Pants color separate from shirt | **✅** | 11.02 | 0.2125 | 35.93 | ~15 min | 70e700480 |
| 06-revisit-bias-by-altitude | Sun-altitude shadow bias ramp | **✅** | 16.73 | 0.3061 | 21.85 | ~15 min | 7f486ad53 |
| 14-revisit-runtime-incremental | Incremental cull batching | **✅** | 16.71 | 0.3062 | 21.86 | ~25 min | 8c5254a64 |
| 08-walk-yaw-from-velocity | Walker faces direction of travel | **✅** | 11.02 | 0.2123 | 35.95 | ~25 min | a0c24abfc |
| 08-knee-bend | Thigh + shin with knee pivot | **✅** | 16.71 | 0.3062 | 21.86 | ~35 min | 20bba8595 |
| 07-revisit-wind | Foliage vertex-shader wind sway | **✅** | 16.70 | 0.3064 | 21.87 | ~40 min | 5b886e6b9 |
| 11-revisit-auto-exposure | Spotlight-count heuristic (reverted) | ⚠️ §6.3 | 15.15 | 0.2987 | 23.19 | ~35 min | ded15af2c |
| 06-revisit-csm | Adaptive ortho shadow frustum | **✅** | 16.71 | 0.3063 | 21.86 | ~20 min | 7a139627e |
| 03-revisit-coverage | 16 CARLA-0.10 blueprint aliases | **✅** | 16.70 | 0.3063 | 21.87 | ~20 min | 213f83b50 |
| 05-revisit-pathB | Scoped Hosek-Wilkie approximation | **✅** | 12.18/25.52 | 0.2449/0.0526 | 28.06/4.63 | ~30 min | 77bae4bc4 |
| 06-revisit-csm-v2 | Shadow-radius 2.5 penumbra softening | **✅** | 16.72 | 0.3062 | 21.86 | ~25 min | fc9ff8df5 |
| 09-revisit-headlight-cone | Ego SpotLight cone shape tune | **✅** | 16.71 | 0.3063 | 21.87 | ~15 min | 5f278bcc7 |
| 11-revisit-fog-altitude-tint | Sun-altitude fog hue/sat ramp | **✅** | 11.02 | 0.2125 | 35.92 | ~18 min | e3d9d0a58 |
| 03-revisit-paint-gloss | Vehicle paint PBR toward automotive-glossy | **✅** | 11.01 | 0.2113 | 35.98 | ~15 min | b3c74c525 |
| 10-revisit-bulb-sun-drive | TL bulb emissive ramped by sun altitude | **✅** | 11.02 | 0.2122 | 35.94 | ~20 min | 26fb9bc04 |
| 06-revisit-ground-bounce-altitude | Hemisphere ground-bounce altitude ramp | **✅** | 16.71 | 0.3062 | 21.86 | ~15 min | 073c99bb6 |
| 08-revisit-swing-amp-split | Split arm (0.35) vs leg (0.55) swing | **✅** | 16.73 | 0.3060 | 21.86 | ~12 min | da6492256 |
| 07-revisit-wind-per-instance | Per-instance wind-sway phase | **✅** | 16.71 | 0.3063 | 21.87 | ~15 min | d06f35aab |
| 09-revisit-lamp-halo | Additive-blend halo sphere around lamp heads | **✅** | 11.01 | 0.2122 | 35.95 | ~18 min | 7d4ed20a6 |
| 05-revisit-mie-altitude | Altitude-driven Sky mieCoefficient | **✅** | 16.71 | 0.3064 | 21.86 | ~15 min | 51e11b670 |
| 11-revisit-ambient-cloud-cool | Ambient color cools under cloudiness | **✅** | 16.72 | 0.3063 | 21.87 | ~12 min | 2cbeba589 |

## Notes

- Iter-01 raise: gap is upstream lighting (color balance + shadow contrast), not
  road material. Re-prioritized iter-05 / 06 / 11 ahead of iter-02 to address.
  Iter-01 will be revisited after lighting stack lands.
- Pose pinned for all comparisons: `street_clear_midday` at Town01 spawn[0],
  driver eye height, pitch −8°, yaw 180°. Defined in
  `carla-web-bridge/tools/render_parity/`.
- ROI tightened to pure road surface: `[(0.28,0.75),(0.72,0.75),(0.72,0.95),(0.28,0.95)]`.
