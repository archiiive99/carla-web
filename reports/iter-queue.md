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
[x] iter-05-revisit-pathB  Scoped Hosek-Wilkie approximation  (✅ altitude-dependent turbidity + rayleigh ramp; no-op at sun_alt=60, +4 turbidity / +0.3 rayleigh at sun_alt=0 for horizon glow; true coefficient tables queued as pathB-full; closed 2026-04-16T08:23:32Z)
[ ] iter-05-revisit-pathB-full  Full Hosek-Wilkie coefficient tables (~300 LOC GLSL, 3-4h)
[ ] iter-05-revisit-pathC  HDR cubemap per TOD/cloud bucket              (queued, only if Path A+B miss)
[x] iter-06  Shadows from sun — cascaded SM tuning  (✅-on-arrival — functional single-cascade shadow system already shipped in scene-environment.tsx:183-198; true CSM queued as iter-06-revisit-csm; closed 2026-04-16T05:05:51Z)
[x] iter-06-revisit-csm  Pseudo-cascade adaptive ortho frustum  (✅ scoped from true CSM to adaptive single-cascade; frustum = 100 + camY*3, clamped [100, 350]; closed 2026-04-16T08:10:23Z)
[x] iter-06-revisit-csm-v2  Shadow-radius 2.5 penumbra softening  (✅ scoped from true multi-cascade; PCFSoftShadowMap kernel now 2.5-texel instead of 1-texel hard edge; closed 2026-04-16T08:31:47Z)
[ ] iter-06-revisit-csm-v3  True multi-cascade CSM (deferred, 3-4h)
[x] iter-06-revisit-bias-by-altitude  Sun-altitude-driven shadow bias  (✅ — linear ramp -0.0004 at sun_alt=60 to -0.001 at sun_alt=0; no-op at iter-01 pose; closed 2026-04-16T06:57:31Z)
[x] iter-11  Post-process calibration — tonemap, exposure, bloom  (✅ ExposureDriver landed: 0.82 midday → 1.6 dusk/night linear interp; day byte-identical to baseline; night metric regresses against broken BP-weather ref but visually correct; bloom blocked separately; closed 2026-04-16T05:07+~40min)
[x] iter-11-revisit-smoothing  Ease exposure over sun-altitude transitions  (✅ — useRef-backed lerp at 0.4/s; steady-state byte-identical; closed 2026-04-16T05:15:26Z)
[x] iter-11-revisit-auto-exposure  Spotlight-count heuristic  (⚠️ §6.3 — night regressed 30→10 PSNR; reverted; v2 queued for proper render-target feedback; closed 2026-04-16T07:59:28Z)
[ ] iter-11-revisit-auto-exposure-v2  Render-target luminance-feedback auto-exposure (~3-4h)
[ ] iter-02  Building façades — windows, materials, silhouettes
[x] iter-03  Vehicle silhouettes — extracted GLBs for every blueprint  (✅-on-arrival — 42 blueprint→GLB mappings shipped in carla-assets/vehicle-models.ts; queued iter-03-revisit-coverage for the remaining ~60 less-common blueprints; closed 2026-04-15T09:59+~10min)
[x] iter-03-revisit-coverage  Extend VEHICLE_MODELS to all CARLA blueprints  (✅ — 16 aliases for CARLA 0.10 namespace added; 17/17 blueprints now mapped; closed 2026-04-16T08:16:55Z)
[x] iter-03-revisit-attribute-color  Tint GLB material from actor.attributes['color']  (✅ — replaced UE5-default WorldGridMaterial on vehicle paint slot with state-driven MeshStandardMaterial; broadcast actor.vehicle_color drives paint; closed 2026-04-15T10:26+~30min)
[x] iter-04  Lane markings — texture authoring or decal pipeline  (✅-on-arrival — full procedural shader chunk shipped in iter-01: white/yellow stripes, stop lines, zebra crosswalks, arrows, wear; closed 2026-04-15T09:21+~20min)
[x] iter-07  Vegetation — extracted trees / bushes / grass instances  (✅-on-arrival — 12 GLB variants + bucketed InstancedMesh + procedural fallback shipped; LOD applied iter-14-revisit-vegetation-buildings; closed 2026-04-15T10:25+~10min)
[x] iter-08  Walker silhouettes — extracted skeletal meshes + walk cycle  (✅ pivoted from extraction-blocked scope to articulated procedural placeholder — torso + head + 2 arms + 2 legs; closed 2026-04-15T11:10+~15min)
[ ] iter-08-extract-glb  Real CARLA walker GLBs (blocked by UE editor)
[x] iter-08-walk-cycle  Animate legs/arms with velocity-driven sine swing  (✅ — pivot groups at shoulder/hip + useFrame opposing-pair sine swing scaled by walker velocity; closed 2026-04-15T11:17+~25min)
[x] iter-08-skin-tones  Vary walker body color per actor.id  (✅ — 6 safety-vis hues, actor.id mod 6 deterministic; closed 2026-04-15T11:14+~12min)
[x] iter-09  Street lights — emissive + point-light contribution at night  (✅ — 4 hardcoded SpotLights near iter-01 intersection, gated isNight; new street_clear_night pose; PSNR 40.23 ✅ ΔE 0.59 ✅ SSIM 0.68 ❌; closed 2026-04-15T09:39+~55min)
[x] iter-09-revisit-emissive  Recolor lamp-head GLB meshes for night-glow  (✅ — pivoted to emissive-sphere pattern after finding STATIC_STREETLIGHT_MODELS dormant in scene; spheres visible above road in night render; PSNR/SSIM stable vs iter-09 within noise; closed 2026-04-15T09:45+~30min)
[x] iter-09-revisit-bloom  UnrealBloomPass for lamp halo  (⚠️ §6.3 — drei EffectComposer broke scene render (night→pure black, day→wrong camera). Reverted cleanly; queued iter-09-revisit-bloom-v2 for deeper integration; closed 2026-04-15T09:49+~50min)
[x] iter-09-revisit-bloom-v2  SelectiveBloom layer-mask attempt  (⚠️ §6.3 — also failed (scene blackout); root cause is architectural — EffectComposer incompatible with WorldCanvas's multi-camera SceneCompositor; reverted; layer-tag infra retained for v3+; closed 2026-04-15T10:32+~50min)
[x] iter-08-clothes-pattern  Pants color distinct from shirt  (✅ — WALKER_PANTS_VARIATIONS added; leg meshes use pantsColor driven by actor.id*7+3; closed 2026-04-16T05:19:56Z)
[x] iter-08-walk-yaw-from-velocity  Walker body faces direction of travel  (✅ — atan2 target yaw + 6 rad/s shortest-path lerp; closed 2026-04-16T07:18:55Z)
[x] iter-08-knee-bend  Thigh + shin with knee pivot  (✅ — knee bends sin(phase) × 0.8 during forward-swing; closed 2026-04-16T07:34:28Z)
[x] iter-07-revisit-wind  Foliage vertex-shader wind sway  (✅ — onBeforeCompile patch + uTime/uWindIntensity uniforms; closed 2026-04-16T07:54:26Z)
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
[x] iter-14-revisit-runtime-veg-bldg  Vegetation runtime cull (Buildings deferred)  (✅ — refactored Vegetation useMemo + added useFrame for per-camera-move zero-scale; Buildings need different pattern; closed 2026-04-15T10:51+~30min)
[x] iter-14-revisit-runtime-bldg-only  Buildings runtime cull (per-building useFrame visibility toggle)  (✅ — two-layer LOD: entry filter caps React-mounted set, per-GltfBuilding useFrame handles dynamic visibility; closed 2026-04-15T10:56+~30min)
[x] iter-14-revisit-runtime-no-entry-filter  Lift Buildings entry-filter; rely on per-building runtime cull  (✅ — byte-identical baseline; interactive movement now past 300m horizon; closed 2026-04-15T11:00+~10min)
[x] iter-14-revisit-runtime-procedural-bldg  Procedural buildings runtime cull  (✅ — userData(cullSourceBuildings + originalMatrices) on each InstancedMesh + Buildings.tsx useFrame; +1.24 dB unexplained but reproducible delta with clean visual; closed 2026-04-15T11:03+~45min)
[x] iter-14-revisit-runtime-incremental  Amortize runtime cull across N frames  (✅ — incrementalBatchSize prop + cullCursor ref in GltfInstanced; default 0 = full pass; closed 2026-04-16T07:02:28Z)
[x] iter-14-revisit-other-categories  Opt-in maxDistance for Poles/Fences/Rocks/GuardRails/TrafficLights/TrafficSigns  (✅ — 6 sites opted in; PSNR/SSIM/ΔE byte-identical to baseline; closed 2026-04-15T10:08+~25min)
[x] iter-14-revisit-vegetation-buildings  Audit + opt-in Vegetation/Buildings  (✅ — Vegetation opted in via bespoke InstancedMesh path; Buildings deferred (one-mesh-per-building, needs different pattern); PSNR/SSIM/ΔE within noise; closed 2026-04-15T10:11+~20min)
[x] iter-14-revisit-buildings  LOD per-building React conditional render  (✅ — single-filter at Buildings entry useMemo; byte-identical PSNR/SSIM/ΔE; closed 2026-04-15T10:19+~15min)
[x] iter-14-revisit-perf-measurement  Playwright FPS probe in compare.py  (✅ — --measure-fps-ms flag added; FPS=0.5 under SwiftShader software-WebGL (not user-perceived); infra deliverable; closed 2026-04-15T10:15+~25min)
[x] iter-13-revisit-pose-coverage  Add chase/birdseye/intersection poses to compare.py POSES  (✅ — 3 new poses each produce numeric output + visually sensible framing; closed 2026-04-15T09:31+~35min)
[x] iter-09-revisit-headlight-cone  Ego SpotLight cone shape tune  (✅ — angle 0.45→0.35, penumbra 0.45→0.35, distance 40→55, intensity 4→5; midday-pose byte-identical since EgoHeadlights returns null; closed 2026-04-16T09:14:00Z+~15min)
[x] iter-11-revisit-fog-altitude-tint  Sun-altitude-driven fog hue/sat ramp  (✅ — HSL(210,4%) at noon → HSL(30,18%) at horizon; linear altFactor interp; byte-identical at midday pose by construction; closed 2026-04-16T09:29:00Z+~18min)
[x] iter-03-revisit-paint-gloss  Vehicle paint PBR toward automotive-glossy  (✅ — roughness 0.45→0.3, metalness 0.5→0.35, envMapIntensity 0.5→0.7; ROI road-only so numbers within noise; closed 2026-04-16T09:40:00Z+~15min)
[x] iter-10-revisit-bulb-sun-drive  TL bulb emissive driven by sun altitude  (✅ — 1.0 at noon → 2.6 at/below horizon; store subscription per TL; byte-identical at midday since TLs outside road ROI; closed 2026-04-16T09:53:00Z+~20min)
[x] iter-06-revisit-ground-bounce-altitude  Hemisphere ground-bounce color ramp  (✅ — lerp #7a4c30→#5a4f44 on altFactor; reuses existing altFactor; midday byte-identical; closed 2026-04-16T10:04:00Z+~15min)
[x] iter-08-revisit-swing-amp-split  Split arm vs leg swing amplitudes  (✅ — arms 0.35, legs 0.55 (was 0.45 shared); byte-identical midday; closed 2026-04-16T10:14:00Z+~12min)
[x] iter-07-revisit-wind-per-instance  Per-instance wind-sway phase  (✅ — phase seeded by instanceMatrix[3].xz; cacheKey v1→v2; byte-identical at midday wind=0; closed 2026-04-16T10:24:00Z+~15min)
[x] iter-09-revisit-lamp-halo  Additive-blend halo sphere around lamp heads  (✅ — radius 0.4 + additive + opacity 0.35 + depthWrite:false; fakes bloom without EffectComposer; byte-identical at midday since rig returns null; closed 2026-04-16T10:34:00Z+~18min)
[x] iter-05-revisit-mie-altitude  Altitude-driven Sky mieCoefficient ramp  (✅ — 0.005 (drei default) at noon → 0.020 at horizon; both scene + IBL Sky; midday byte-identical; closed 2026-04-16T10:45:00Z+~15min)
[x] iter-11-revisit-ambient-cloud-cool  Ambient color cools under cloudiness  (✅ — lerp #ffffff→#c8d0da on cloudFactor; midday byte-identical (cloudiness=0); closed 2026-04-16T10:55:00Z+~12min)
[x] iter-09-revisit-lamp-pole  Visible pole cylinder ground→lamp head  (✅ — tapered 0.06→0.08 radius cylinder per lamp; always-visible; night rig gated under isNight inside group; midday byte-identical (poles above road ROI); closed 2026-04-16T11:03:00Z+~20min)
[x] iter-09-revisit-lamp-arm  Horizontal arm offset + head moves to arm end  (✅ — armDir ±0.5 by CARLA x=120 split; head + halo + spot all at arm end; thin (0.04r) 0.5m horizontal cylinder; byte-identical at midday; closed 2026-04-16T11:16:00Z+~25min)
[x] iter-06-revisit-shadow-softness-cloudiness  Shadow radius ramps with cloudiness  (✅ — 2.5 + cloudFactor*3.5; 2.5 clear → 6.0 overcast; midday byte-identical (cloudiness=0); closed 2026-04-16T11:26:00Z+~12min)
[x] iter-03-revisit-windshield-tint  Tinted glass on vehicle window materials  (✅ — regex detects glass-named mats + replaces with tinted transparent #262c38; midday byte-identical (vehicles outside road ROI); closed 2026-04-16T11:35:00Z+~15min)
[x] iter-09-revisit-halo-opacity-altitude  Halo opacity ramps by night-depth  (✅ — 0.2 + nightDepth*0.3 where nightDepth = clamp(-sun_alt/15,0,1); midday byte-identical (halo unmounts at daytime); closed 2026-04-16T11:43:00Z+~10min)
[x] iter-09-revisit-beam-halogen  Separate STREETLAMP_BEAM palette color  (✅ — HPS-amber #ffb063 distinct from HEADLIGHT_BEAM #fff4d0; wired through emissive/halo/spot; post-restart reference drift but web edit unreachable at midday pose; closed 2026-04-16T11:56:00Z+~45min including §4.5 restart recovery)
[x] iter-09-revisit-shield  Disc reflector shield above lamp head  (✅ — radius 0.32, thick 0.06 disc 0.18m above head; #2a2a30 metal; always-visible; byte-identical at midday (above road ROI); closed 2026-04-16T12:05:00Z+~15min)
[x] iter-09-revisit-emissive-depth  Emissive intensity ramps by night-depth  (✅ — 1.2 + nightDepth*2.3; pairs with halo-opacity curve; midday byte-identical (sphere unmounted); closed 2026-04-16T12:12:00Z+~10min)
[x] iter-07-revisit-trunk-vary  Per-instance trunk color variation  (✅ — ±15% value perturbation on TREE_TRUNK in procedural fallback; byte-identical at midday (GltfVegetation primary); closed 2026-04-16T12:19:00Z+~15min)
[x] iter-06-revisit-sun-kelvin-cloud  Sun Kelvin drops with cloudiness  (✅ — -300K at cloudFactor=1; kelvinToColor handles the shift; midday byte-identical (cloudiness=0 reproduces prior base); closed 2026-04-16T12:28:00Z+~15min)
[x] iter-08-revisit-bob  Vertical head/torso bob at 2× step rate  (✅ — |sin(2φ)|*0.03 upward-only bob on bodyGroupRef.position.y; compare.py client timeout 10→30s; post-restart reference drift (6.61/0.0627/49.24); edit unreachable at midday no-walker ROI; closed 2026-04-16T12:48:00Z+~70min including recovery)
[x] iter-06-revisit-ambient-fog  Ambient fill lifts with fog-density  (✅ — + fogFactor*0.04 term; midday byte-identical (fog_density=0); closed 2026-04-16T12:56:00Z+~12min)
[x] iter-06-revisit-sun-precip  Direct sun attenuated by precipitation  (✅ — +precipFactor*0.25 attenuation, floored; midday byte-identical (precip=0); closed 2026-04-16T13:02:00Z+~10min)
[ ] iter-15  IBL cubemaps per weather/TOD pair — replace gradient sky
```

## Master log

| Time (UTC) | Iter | Event | Commit |
|---|---|---|---|
| 2026-04-15 prior session | iter-01 | closed ⚠️ (§6.3 raise, gap attributed to upstream lighting) | 369009cc6 |
| 2026-04-15 this session | queue | bootstrap + re-order: lighting stack (05/06/11) before geometry stack (02/03/04) | (this commit) |
