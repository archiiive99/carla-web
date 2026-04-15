# Rendering iteration queue

Live work-list for the harness in `prompts/specs/rendering-iteration-harness.md`.
Status legend: `[ ]` queued, `[~]` in-progress (with UTC timestamp), `[x]` done,
`✅` parity bar met, `⚠️` parity bar missed but documented gap, `❌` raised §6.

---

## Active queue (re-ordered 2026-04-15)

Re-ordering rationale (harness §1 re-prioritization clause): iter-01's after-numbers
report (`reports/iter01/report.md` + commit `369009cc6`) attributes the residual
gap (PSNR 14.3 dB vs 28 bar, ΔE 19.8 vs 6) to **upstream lighting parity** —
inverted color balance (UE5 warm vs web cool) and missing directional-shadow
contrast (no tree shadows on web road). Building façades (iter-02) cannot improve
those numbers; sky+sun (iter-05), shadows (iter-06), and tonemap (iter-11) can.
Bumped lighting-stack rows ahead of geometry rows.

```
[x] iter-01  Road surface PBR + parity harness MVP                (⚠️ measured FAIL >±10% — §6.3 raised in 369009cc6, see report)
[x] iter-05  Sky + sun direction parity (Hosek-Wilkie or HDR)     (⚠️ §6.1 raise — closed 2026-04-15T07:50:51Z+~80min; Path A applied + tsc-clean, measurement blocked by BP_CarlaWeather wiring defect; see iter-05/report.md)
[x] iter-engine-weather-bp  BP_CarlaWeather → SkyAtmosphere wiring fix   (⚠️ §4.3 tuning-exhausted — closed 2026-04-15T08:06+~2h. C++ override of lone ADirectionalLight verifiably runs each set_weather but UE5's "night" is owned by something else. See iter-engine-weather-bp/report.md §7.8.)
[ ] iter-engine-weather-bp-revisit  BP_GeneralSceneSettings + SkyAtmosphere chain inspection  (needs UE editor session on GPU 2 — out of CLI scope)
[x] iter-05-revisit-roi-sky  Add sky-ROI mode to compare.py harness     (✅ second PASS of session — sky-ROI reproducible 0.00 dB ΔΔ; default road preserved byte-identically; closed 2026-04-15T09:06+~35min)
[ ] iter-05-revisit-pathB  Hosek-Wilkie shader if Path A still misses    (queued, only if needed)
[ ] iter-05-revisit-pathC  HDR cubemap per TOD/cloud bucket              (queued, only if Path A+B miss)
[ ] iter-06  Shadows from sun — cascaded SM tuning                (depends on iter-05 sun pose)
[ ] iter-11  Post-process calibration — tonemap, exposure, bloom   (closes warm/cool color balance)
[ ] iter-02  Building façades — windows, materials, silhouettes
[x] iter-03  Vehicle silhouettes — extracted GLBs for every blueprint  (✅-on-arrival — 42 blueprint→GLB mappings shipped in carla-assets/vehicle-models.ts; queued iter-03-revisit-coverage for the remaining ~60 less-common blueprints; closed 2026-04-15T09:59+~10min)
[ ] iter-03-revisit-coverage  Extend VEHICLE_MODELS to all CARLA blueprints (~30 min, web-only)
[x] iter-03-revisit-attribute-color  Tint GLB material from actor.attributes['color']  (✅ — replaced UE5-default WorldGridMaterial on vehicle paint slot with state-driven MeshStandardMaterial; broadcast actor.vehicle_color drives paint; closed 2026-04-15T10:26+~30min)
[x] iter-04  Lane markings — texture authoring or decal pipeline  (✅-on-arrival — full procedural shader chunk shipped in iter-01: white/yellow stripes, stop lines, zebra crosswalks, arrows, wear; closed 2026-04-15T09:21+~20min)
[x] iter-07  Vegetation — extracted trees / bushes / grass instances  (✅-on-arrival — 12 GLB variants + bucketed InstancedMesh + procedural fallback shipped; LOD applied iter-14-revisit-vegetation-buildings; closed 2026-04-15T10:25+~10min)
[ ] iter-08  Walker silhouettes — extracted skeletal meshes + walk cycle
[x] iter-09  Street lights — emissive + point-light contribution at night  (✅ — 4 hardcoded SpotLights near iter-01 intersection, gated isNight; new street_clear_night pose; PSNR 40.23 ✅ ΔE 0.59 ✅ SSIM 0.68 ❌; closed 2026-04-15T09:39+~55min)
[x] iter-09-revisit-emissive  Recolor lamp-head GLB meshes for night-glow  (✅ — pivoted to emissive-sphere pattern after finding STATIC_STREETLIGHT_MODELS dormant in scene; spheres visible above road in night render; PSNR/SSIM stable vs iter-09 within noise; closed 2026-04-15T09:45+~30min)
[x] iter-09-revisit-bloom  UnrealBloomPass for lamp halo  (⚠️ §6.3 — drei EffectComposer broke scene render (night→pure black, day→wrong camera). Reverted cleanly; queued iter-09-revisit-bloom-v2 for deeper integration; closed 2026-04-15T09:49+~50min)
[x] iter-09-revisit-bloom-v2  SelectiveBloom layer-mask attempt  (⚠️ §6.3 — also failed (scene blackout); root cause is architectural — EffectComposer incompatible with WorldCanvas's multi-camera SceneCompositor; reverted; layer-tag infra retained for v3+; closed 2026-04-15T10:32+~50min)
[ ] iter-09-revisit-bloom-v3  Per-viewport bloom mounting (~3-4h, refactor multi-viewport renderer)
[ ] iter-09-revisit-bloom-v4  Custom render loop with manual bloom pass (~3-4h)
[ ] iter-09-revisit-extracted-positions  Real lamp coords from Town01 static-prop dump (long iteration, needs UE5 commandlet or XODR parser)
[x] iter-10  Traffic lights — emissive bulb + correct hue  (✅-on-arrival — basic feature shipped via indicator-sphere; GLTF-mesh recolor queued as iter-10-revisit-glb-bulb; closed 2026-04-15T09:23+~15min)
[x] iter-10-revisit-glb-bulb  Traverse GLTF, recolor authored bulb mesh by name  (✅ — bulb primitive (WorldGridMaterial) detected + replaced with state-driven emissive material; visual confirmation distant TL shows current state color; closed 2026-04-15T09:25+~35min)
[x] iter-12  Wet-surface response — driven by CARLA wetness param  (✅-on-arrival — binding shipped in iter-01; verified end-to-end via new --weather-wetness flag; PSNR moves +0.51 dB dry→wet vs 0.02 dB noise floor; closed 2026-04-15T09:14+~30min)
[x] iter-13  Scene-palette unification — three.js material constants module  (⚠️ refactor SUCCESS, web render byte-pattern unchanged; measurement regression due to CARLA NPC vehicle blocking ROI — not refactor — see iter-13/report.md §7.4)
[x] iter-13-followon-harness-stabilize  Add NPC-clear-before-capture to compare.py  (✅ first PASS of session — PSNR ΔΔ=0.02 dB across 2 runs; reference now shows clean asphalt; closed 2026-04-15T09:00+~35min)
[x] iter-14  LOD pipeline — distant geometry impostors / decimated meshes  (✅ — build-time maxDistance + referencePoint added to GltfInstanced; Walls opted in at 300m from iter-01 pose; PSNR stable within noise; closed 2026-04-15T10:01+~35min)
[x] iter-14-revisit-runtime-lod  Per-frame camera-tracked cull  (✅ — runtimeCull opt-in prop on GltfInstanced; Walls demonstrates; harness byte-identical at fixed iter-01 pose; closed 2026-04-15T10:40+~40min)
[x] iter-14-revisit-runtime-all  Opt remaining 6 GltfInstanced sites into runtimeCull  (✅ — Poles/Fences/Rocks/GuardRails/TrafficLights/TrafficSigns; discovered + fixed coord-system bug in runtime cull; closed 2026-04-15T10:45+~30min)
[ ] iter-14-revisit-runtime-veg-bldg  Vegetation + Buildings runtime cull (~1h)
[ ] iter-14-revisit-runtime-incremental  Amortize runtime cull across N frames (~1h)
[x] iter-14-revisit-other-categories  Opt-in maxDistance for Poles/Fences/Rocks/GuardRails/TrafficLights/TrafficSigns  (✅ — 6 sites opted in; PSNR/SSIM/ΔE byte-identical to baseline; closed 2026-04-15T10:08+~25min)
[x] iter-14-revisit-vegetation-buildings  Audit + opt-in Vegetation/Buildings  (✅ — Vegetation opted in via bespoke InstancedMesh path; Buildings deferred (one-mesh-per-building, needs different pattern); PSNR/SSIM/ΔE within noise; closed 2026-04-15T10:11+~20min)
[x] iter-14-revisit-buildings  LOD per-building React conditional render  (✅ — single-filter at Buildings entry useMemo; byte-identical PSNR/SSIM/ΔE; closed 2026-04-15T10:19+~15min)
[x] iter-14-revisit-perf-measurement  Playwright FPS probe in compare.py  (✅ — --measure-fps-ms flag added; FPS=0.5 under SwiftShader software-WebGL (not user-perceived); infra deliverable; closed 2026-04-15T10:15+~25min)
[x] iter-13-revisit-pose-coverage  Add chase/birdseye/intersection poses to compare.py POSES  (✅ — 3 new poses each produce numeric output + visually sensible framing; closed 2026-04-15T09:31+~35min)
[ ] iter-15  IBL cubemaps per weather/TOD pair — replace gradient sky
```

## Master log

| Time (UTC) | Iter | Event | Commit |
|---|---|---|---|
| 2026-04-15 prior session | iter-01 | closed ⚠️ (§6.3 raise, gap attributed to upstream lighting) | 369009cc6 |
| 2026-04-15 this session | queue | bootstrap + re-order: lighting stack (05/06/11) before geometry stack (02/03/04) | (this commit) |
