# CARLA UE5 → Web Renderer: Full Visual Parity Mandate

## 0. Mission

Reproduce the rendered output of the **CARLA Unreal Engine 5 simulator** inside a
**browser dashboard** with **pixel-level fidelity at matched camera frustum**. The
target is *not* "looks similar." The target is: **for every camera pose, weather
state, time of day, and map region, the browser-side render produces an image
that is statistically and perceptually indistinguishable from the UE5 native
output**, measured by ΔE\*76 ≤ 1.0 average over the full frame, SSIM ≥ 0.97
(luma), and PSNR ≥ 32 dB.

When this target cannot be hit on a given feature with the chosen client-side
path, **move the work**: server-side render → stream pixels (WebRTC/WebCodecs),
WASM/Rust hot paths, WebGPU compute, baked offline assets — whatever closes the
gap. The browser is the *delivery* surface, not the *implementation* surface.

---

## 1. Engineering Honesty Contract

This is a hard contract. Every rule overrides the default tendency toward
reassurance, optimism, or hedging.

### 1.1 Definition of "verified"

A claim is "verified" only when **all** of:

  (a) A concrete repeatable check ran (script, diff, metric, test, log grep).
  (b) A baseline existed (UE5 native output — not memory, not docs, not stale
      screenshots).
  (c) Specific enumerated attributes were compared with pass/fail per attribute
      (per-channel mean, ΔE\*76, SSIM, PSNR, frame-time, schema fields).
  (d) Coverage matched the claim's scope. If you checked 3 buildings, you have
      not verified "all buildings render correctly" — you verified those 3.

If any of (a)-(d) is missing, the correct word is **partial check**, **sampled**,
**smoke-tested**, **visually inspected**, **unchecked**, or **unknown**.

### 1.2 Banned phrases without a measurement adjacent

`confirmed`, `verified`, `validated`, `it works`, `working correctly`,
`matches`, `equivalent`, `parity achieved`, `done`, `complete`, `ready`,
`production-ready`, `looks right`, `seems fine`, `should be fine`,
`probably works`, `roughly matches`, `approximately equivalent`,
`basically the same`, `practically identical`, `no issues found` (when you did
not look), `tested` (when you ran it once and it didn't crash).

"I didn't see any errors" is **not** evidence of correctness — it's evidence
that you didn't look for errors. State it as the latter.

### 1.3 Scope-inflation trap

Never generalize from a sample to the whole. If the check covered a subset of
inputs / frames / actors / map regions / weathers / times of day / sensor
modalities, the claim is bounded to that subset.

Always include in any status-bearing message:

```
Checked: [explicit list]
NOT checked: [explicit list]
Unknown: [explicit list]
```

If the **NOT checked** list is empty, you are almost certainly lying to
yourself — re-examine.

### 1.4 Mandatory self-audit before every status message

```
[ ] Every "verified"-class word is backed by a specific check.
[ ] Scope of each claim is bounded.
[ ] Every assumption is labeled "assumed" / "inferred" / "likely" — not stated as fact.
[ ] NOT-checked and Unknown lists are non-empty and honest.
[ ] No banned phrase from §1.2 appears without adjacent evidence.
```

If the audit fails, prepend a `PARTIAL-VERIFICATION RE-REPORT` section that
restates with correct scope, then continue.

### 1.5 Uncertainty is a first-class output

"I don't know" and "I have not checked this" are valid, **preferred** answers
over confident guesses. Unknown state must be surfaced, not buried in confident
prose. If the user asked yes/no and you have not measured the answer, reply
"unknown — here is what I would need to run to answer it."

---

## 2. Reimplementation Mandate (no "impossible" escapes)

### 2.1 Core contract

When the task is to reproduce a feature from a source system (UE5 / Unreal /
CARLA / a native engine) in a target system (web stack, Three.js, browser,
different language runtime), the feature **must** be reimplemented. The only
open question is **how**, never **whether**.

### 2.2 Forbidden conclusions

Do not emit any of (or paraphrase of):

- "This is structurally impossible to reproduce on the web."
- "The pipelines are fundamentally different, so this feature is omitted."
- "Three.js / the browser / WebGL / WebGPU cannot do this."
- "This is engine-specific and cannot be ported."
- "We would need the full Unreal renderer to replicate this."
- "This is a known limitation of the target stack."
- "It is not feasible within the current architecture."
- "We'll have to accept this divergence."
- Any variant that ends the conversation with the feature missing and **no
  implementation plan**.

These are banned because in every observed case they were used as an excuse
for "I didn't implement it," not as a statement of physical impossibility.
Physical impossibility in software, on general-purpose hardware, with an
unbounded choice of languages and runtimes, is extraordinarily rare.

### 2.3 Required workflow when a feature looks hard

**Step 1 — Characterize the source pipeline.**
What stages exist (geometry, materials, lighting, post-process, compute passes,
streaming, LOD, culling)? What inputs / outputs does each stage have? What
data crosses the boundary to the user (pixels, G-buffers, structured state,
video stream)?

**Step 2 — Propose at least two concrete target-side paths.** Examples of
legitimate paths:

- Pure client: Three.js + custom GLSL/WGSL shaders replicating the source pass.
- Client compute: WebGPU compute, WASM SIMD, OffscreenCanvas + Web Workers.
- Native-speed client: Rust → WASM with SharedArrayBuffer + parallelism.
- Server-authoritative rendering: run the source renderer (or a
  reimplementation) on the server, stream pixels (WebRTC, WebCodecs, HLS,
  MJPEG, raw WS).
- Server-authoritative simulation + client visualization: server computes the
  expensive pass, streams structured results, client renders lightweight
  geometry.
- Hybrid: heavy passes server-side, lightweight interactive layer client-side,
  composited in the browser.
- Native module bridge: Node/Rust addon → IPC → browser via WebSocket.
- Precomputed / baked: if the pass is static or semi-static, bake offline,
  ship as assets.

**Step 3 — Compare paths on:** fidelity, latency, throughput, bandwidth,
implementation effort, maintenance cost. Use numbers (FPS, ms/frame, MB/s,
memory budget).

**Step 4 — Pick one, state why, implement it.** If the user has not picked,
present the tradeoffs and ask.

### 2.4 Performance is not an excuse

If the concern is "the browser is too slow," the response is **not** "drop the
feature." It is one of:

- Move the work to GPU (WebGL2 / WebGPU compute).
- Rewrite hot paths in Rust/C++ → WASM with SIMD.
- Move the work to the server; stream results.
- Reduce the problem (lower res, temporal upsampling, reprojection,
  variable-rate shading, frustum/occlusion culling, LOD, instancing).
- Precompute offline.

Present numbers before concluding anything is "too slow." "Feels slow" is not
a measurement.

### 2.5 Language / runtime is never a constraint

Reach for whatever serves the feature: TypeScript, JavaScript, Rust, C, C++,
Zig, Go, Python (server-side), GLSL, WGSL, HLSL cross-compiled, CUDA (server
side), native addons, FFI bridges. The browser is the delivery surface; the
implementation surface is unbounded.

### 2.6 Status vocabulary

Use exactly one when reporting feature status. Do not invent new categories.

| Status | Meaning |
|---|---|
| `IMPLEMENTED (verified)` | Meets §1.1 (a)-(d). Cite evidence. |
| `IMPLEMENTED (unverified)` | Code written, not yet compared to source. |
| `IN PROGRESS` | Actively being built; state the blocker. |
| `NOT IMPLEMENTED` | Not built yet. State the planned path from §2.3. |
| `DEFERRED (with reason)` | Postponed by user decision. Cite the decision. |

`NOT REPRODUCIBLE` is **not a valid status**. If you believe it is, you skipped
§2.3; restart from Step 1.

---

## 3. Reporting Format for Every Status Message

Every cross-system comparison report must include this matrix. Free-form prose
summaries are insufficient and not accepted.

| Feature / Aspect | Source (UE5/CARLA) state | Target (Web) state | Evidence | Status |
|---|---|---|---|---|
| Building geometry | … | … | … | ✅/⚠️/❌/❓ |
| Building materials (per PBR channel) | … | … | … | … |
| Vehicle models (geometry, animation) | … | … | … | … |
| Vehicle physics state | … | … | … | … |
| Walker geometry + animation | … | … | … | … |
| Lighting — direct (sun) | … | … | … | … |
| Lighting — indirect (Lumen GI) | … | … | … | … |
| Lighting — IBL / sky capture | … | … | … | … |
| Shadows — CSM cascades | … | … | … | … |
| Shadows — contact shadows | … | … | … | … |
| Shadows — ray-traced (where enabled) | … | … | … | … |
| Tone mapping (ACES filmic) | … | … | … | … |
| Color space (sRGB output) | … | … | … | … |
| Auto-exposure / `toneMappingExposure` | … | … | … | … |
| Bloom (threshold, kernel, intensity) | … | … | … | … |
| SSAO / GTAO | … | … | … | … |
| Reflections — SSR | … | … | … | … |
| Reflections — capture probes | … | … | … | … |
| Anti-aliasing (TAA) | … | … | … | … |
| DOF / motion blur / vignette / chromatic aberration / film grain | … | … | … | … |
| Sky atmosphere (Hillaire / sky-atm physically based) | … | … | … | … |
| Fog (exponential height fog vs linear) | … | … | … | … |
| Weather — sun azimuth + altitude | … | … | … | … |
| Weather — cloudiness | … | … | … | … |
| Weather — precipitation particles | … | … | … | … |
| Weather — wetness / wet-shader response | … | … | … | … |
| Weather — fog density + falloff + scattering | … | … | … | … |
| Time of day → sun position + intensity + color | … | … | … | … |
| Sensor — RGB camera | … | … | … | … |
| Sensor — depth | … | … | … | … |
| Sensor — semantic segmentation | … | … | … | … |
| Sensor — instance segmentation | … | … | … | … |
| Sensor — LiDAR | … | … | … | … |
| Sensor — radar | … | … | … | … |
| Sensor — IMU | … | … | … | … |
| Sensor — GNSS | … | … | … | … |
| Traffic lights — geometry | … | … | … | … |
| Traffic lights — state-driven emissive | … | … | … | … |
| Road markings (decals) | … | … | … | … |
| Vegetation — geometry | … | … | … | … |
| Vegetation — wind animation | … | … | … | … |
| Vegetation — subsurface scattering | … | … | … | … |
| Network / streaming protocol | … | … | … | … |
| Performance (fps / ms / MB·s⁻¹) | … | … | … | … |

**Legend**

- ✅ verified parity (evidence cited)
- ⚠️ partial — state exactly what is and is not covered
- ❌ divergent / missing — state the §2.3 reimplementation plan
- ❓ unchecked — state what check would resolve it

A report with any ✅ that does not cite evidence is a failure state. Rewrite
before sending.

---

## 4. Source Pipeline (UE5 / CARLA) — what we are reproducing

Brief stage map of the source renderer. Every web-side feature must trace back
to a source stage so the reproduction strategy is explicit.

### 4.1 Frame stages (UE5, deferred renderer with Lumen)

1. **Visibility** — frustum + occlusion culling, primitive submission.
2. **Pre-pass** — depth + velocity to G-buffer (used by TAA, motion blur, SSR).
3. **Base pass** — material BSDF evaluation → G-buffer (albedo, normal,
   roughness, metallic, AO, emissive).
4. **Lighting** — direct shadows (CSM, contact, ray-traced when enabled),
   Lumen indirect (screen + world-space surface cache + voxel scene + final
   gather), reflections (Lumen reflections or SSR or probe).
5. **Translucency** — separate forward pass.
6. **Post-process** — bloom, tone mapping (ACES filmic by default),
   color grading (LUT + sliders), DOF, motion blur, TAA, vignette,
   chromatic aberration, film grain, eye adaptation (auto-exposure).
7. **UI / debug overlays.**

### 4.2 Sky / atmosphere

UE5 5.x ships with **Sky Atmosphere** (Hillaire 2020 model, physically based)
combined with **Volumetric Cloud** and **Sky Light** capture. CARLA's weather
maps fold into these via the `WeatherParameters` struct on `World`.

### 4.3 Sensor capture path (CARLA)

`CaptureSensor` → scene capture component → `FRHIGPUTextureReadback` → BGRA
pixel buffer → CARLA RPC stream → `LibCarla::Image` decode → bridge → WS to
client. Depth and semantic seg use packed encodings:

- **Depth**: per-pixel meters mapped to `(R + G·256 + B·256²) / (256³ − 1) ·
  1000` (`LibCarla/.../ColorConverter.h:35-39`).
- **Semantic seg**: class id stored in R channel; client maps via Cityscapes
  palette (`LibCarla/.../CityScapesPalette.h`).

### 4.4 World-fixed environment objects

`world.get_environment_objects(label)` returns the static actor set per
`CityObjectLabel` (Buildings, Roads, Sidewalks, Vegetation, Poles, Walls,
Fences, TrafficLight, TrafficSigns, Water, Rocks, GuardRail, RoadLines).
Each object exposes `transform.location` (world) and `bounding_box`
(world-space center + extents + yaw).

### 4.5 Town01_Opt actor families (verified inventory required)

Real Town01_Opt geometry uses prefab families that are **not** the generic
`SM_House01..17` set:

- `Bl_House_AmerSuburb*` (≈88 instances)
- `Bl_CityBuilding_ResidentialTall*` and `…ResidentialTallWStairs*` (≈40)
- `Bl_CityBuilding_REsidentialBig_Bp*`
- `Bl_CityBuilding_Residential_Arch_*`
- `Bl_CityBuilding_SupermarketWOffice_*`
- `Bl_CityBuilding_GasStation_*`
- `SantaClara_SuburbHouse*` and `Santaclara_Suburbhouse*`
- `BP_House12`, `BP_TerraxcedHouse`, `BP_Apartment01`
- `Bl_Garage_SantaClaraSuburb*`
- `prop_snacksStand5_*`, `GuardShelter2_*`, `MergingBuilding`,
  `MutlipleFloorBuilding4`

Any reproduction that maps these to procedural gray boxes is **not** parity.
Either export the underlying StaticMesh per blueprint, or export the entire
`.umap` as a single composed scene (see §6.4).

---

## 5. Acceptance Criteria

The reproduction is **complete** when, for every entry in the §3 matrix, the
status column is `IMPLEMENTED (verified)` or `DEFERRED (with reason)` and the
following whole-frame metrics hold over the test corpus:

### 5.1 Per-frame metrics (matched-frustum capture)

For each `(map, pose, weather, time-of-day)` test point:

- **ΔE\*76 mean** ≤ 1.0 (perceptual color difference; 1.0 = just-noticeable)
- **ΔE\*76 95th percentile** ≤ 3.0
- **SSIM (luma)** ≥ 0.97
- **PSNR** ≥ 32 dB
- **Histogram intersection (luma, 64 bins)** ≥ 0.92

### 5.2 Test corpus

At minimum, the corpus covers:

- Maps: Town01_Opt, Town02_Opt, Town03_Opt, Town04_Opt, Town05_Opt, Town06_Opt,
  Town07_Opt, Town10HD_Opt
- Poses per map: ≥ 16 sampled at uniform spawn-point indices
- Weather presets: ClearNoon, ClearSunset, CloudyNoon, WetNoon, WetCloudyNoon,
  MidRainyNoon, HardRainNoon, SoftRainNoon, ClearNight, CloudyNight, WetNight,
  WetCloudyNight, SoftRainNight, MidRainyNight, HardRainNight
- Time-of-day sweeps: sun_altitude_angle ∈ {-15, 5, 20, 45, 70, 90} degrees
- Sensor modalities: RGB, depth, semantic seg, instance seg, LiDAR, IMU, GNSS

Total ≥ 8 maps × 16 poses × 15 weathers × 6 ToD = **11 520 cells per
modality**. Sampling smaller subsets is allowed for development; acceptance
runs the full grid.

### 5.3 Performance metrics

- Browser frame time ≤ 16.7 ms (60 FPS) on a single RTX 4060 / Mac M-series
- WS bandwidth ≤ 25 MB/s steady state
- End-to-end latency (sim tick → display) ≤ 80 ms p50, ≤ 150 ms p99

### 5.4 Schema metrics

- Bridge `/api/*` payloads validated against the Pydantic `models/schemas.py`
  with zero serialization warnings.
- WebSocket binary frames pass the offline `compare_render.py test-pattern`
  and `depth-roundtrip` and `palette-diff` subcommands with exit 0.

---

## 6. Implementation Strategy (initial recommendation; may be revised per §2.3)

These are starting points. Each item must produce a §2.3 plan with at least
two paths before code lands.

### 6.1 Lighting / tone mapping

- `WebGLRenderer.toneMapping = ACESFilmicToneMapping`
- `WebGLRenderer.outputColorSpace = SRGBColorSpace`
- `toneMappingExposure` driven by sun altitude + cloudiness (no banding)
- IBL: drei `<Environment>` capturing the live `<Sky>` into PMREM, refreshed
  on weather change. Stretch goal: bake UE5 sky-capture cubemaps offline,
  ship as `.hdr`, load via `RGBELoader` → `PMREMGenerator`.

### 6.2 Post-processing

- `EffectComposer` chain: `RenderPass` → `SSAOPass` (or GTAO via
  `postprocessing` lib) → `UnrealBloomPass` → `OutputPass`.
- TAA: `TAARenderPass` driven by jittered camera matrix.
- DOF, motion blur, vignette, chromatic aberration: `postprocessing` library
  effects, parameters synced to UE5 post-process volume settings exposed
  through a new bridge endpoint `/api/world/post-process`.

### 6.3 Sky / weather

- Replace drei `<Sky>` (Preetham 1999) with a **Hillaire 2020** WGSL
  implementation behind a feature flag, matched to UE5 Sky Atmosphere.
- Fog: `<fogExp2>` driven by `weather.fog_density`, with optional
  height-falloff via custom shader injection (`onBeforeCompile`) replicating
  UE5 `ExponentialHeightFog`.
- Rain: GPU particle system (≥ 5 000 streaks) with screen-space wetness
  shader (roughness uniform, animated normal map).

### 6.4 Geometry — Town01_Opt prefab parity

Pick one of:

- **B1 — Per-prefab export:** UE5 Python commandlet enumerates
  `Bl_House_AmerSuburb*`, `Bl_CityBuilding_*`, `SantaClara_*`, etc.; resolves
  blueprint → underlying StaticMesh; exports each via
  `UGLTFExporter::ExportToGLTF()` with bake materials + textures. Map
  blueprint names to glb paths in `BUILDING_MODELS`. ~140 glbs.
- **B2 — Whole-level export:** UE5 commandlet iterates
  `EditorLevelLibrary.get_all_level_actors()` for the loaded `.umap`; emits
  every actor's static-mesh + transform into a single `town01_opt_scene.glb`
  (~500 MB – 1 GB). Client loads at origin, no per-actor mapping needed.
- **B3 — Server-side hybrid:** for non-ego viewpoints, render UE5 from a
  bridge-spawned spectator camera, stream pixels; keep client Three.js for
  ego-cam overlays and 3D selection.

### 6.5 Vegetation

- Wind: vertex shader displacement using world-space noise + time, parameters
  matching SpeedTree wind (gust frequency, branch sway amplitude).
- Subsurface scattering on leaves: `MeshPhysicalMaterial` with `transmission`
  + `thickness` map + `attenuationColor`, or custom translucent shader.

### 6.6 Decals

UE5 road markings are decals. Web-side options:

- `decal-geometry` projecting onto road meshes (Three.js `DecalGeometry`).
- Bake the decal pass into the road-mesh albedo at export time (loses
  dynamic decals like construction repaint).

### 6.7 Sensors beyond RGB

- Depth: bridge already encodes per `ColorConverter.h`; client decodes via
  `image.py` (proven by `compare_render.py depth-roundtrip`).
- Semantic seg: class-id-as-R-channel + Cityscapes palette table on client.
- LiDAR: bridge sends raw points (BSON or binary float buffer); client renders
  via `THREE.Points` with size attenuation + class color.
- Radar / IMU / GNSS: structured JSON over WS at 20 Hz.

### 6.8 Network / streaming

- WS protocol stable framing: 1-byte type + 4-byte sensor_id + 4-byte
  timestamp_ms + payload. Timestamps in CARLA-server clock domain.
- Client subscriptions: `{action:"subscribe", sensor_id:N}` /
  `{action:"unsubscribe", sensor_id:N}`.
- Adaptive rate: bridge tracks per-client RTT, drops to lower fps when
  backpressure detected (existing `adaptive_rate.py`).

---

## 7. Verification Tooling (`carla-web-bridge/tools/compare_render.py`)

Use the existing harness; extend rather than replace.

### 7.1 Subcommands

```
stats <three.png> <ue5.jpg>
    Sample both, print per-channel / luminance / histogram deltas.

test-pattern [--backend auto|turbojpeg|pillow] [--quality 85]
    Synthetic BGRA → JPEG round-trip. Per-patch ΔE76 + channel-order check.

depth-roundtrip
    10 depths in [0, 1000 m]: BGRA encode (CARLA formula) → decode → assert
    recovered meters within quantization.

palette-diff
    Cityscapes palette equality vs LibCarla header.

jpeg-sweep [--quality 60,75,85,95] [--input ue5.png]
    Q × {4:2:0, 4:4:4}, bytes + SSIM_Y, CSV.

live --bridge ws://HOST:PORT/ws --carla HOST:PORT --frames N
    Bridge RGB stream and a parallel native-CARLA camera at identical pose.
    Save N matched pairs, report mean ΔE / PSNR / SSIM on a road ROI.
```

### 7.2 Required additional subcommands

- `match-frustum --map M --pose P --weather W --tod T --frames N` — drive
  UE5 spectator + Three.js camera to identical transform via the dev URL
  param `?camMatch=<actor_id>` or `?camPose=x,y,z,yaw,pitch,roll`. Emit
  matched PNG/JPG pairs + per-frame metrics CSV.
- `corpus-run --maps … --weathers … --tods … --poses-per-map N` — sweep the
  acceptance corpus from §5.2, write `acceptance.csv` with one row per cell.
- `regress --baseline acceptance.csv --new acceptance.csv` — diff two
  acceptance runs, fail non-zero if any metric regresses beyond tolerance.

### 7.3 Harness determinism rules

- glTF streaming creates per-session variance. Mitigation: capture the same
  scene **twice** in fresh Playwright sessions; **discard the first** and
  use the second.
- Pause CARLA sim (`POST /api/simulation/pause`) before paired captures so
  actor positions match.
- For UE5 RGB capture, subscribe via WS to the managed camera (sensor id from
  `/api/realtime/session`); for Three.js capture, use `canvas.toDataURL`
  on `canvas[data-engine^="three.js"]`.
- Pre-warm fonts (`document.fonts.ready`) before `page.screenshot` to avoid
  Playwright font-wait timeouts, OR bypass `page.screenshot` entirely with
  `canvas.toDataURL`.

---

## 8. Stack Operations (do not violate)

- **Streaming stack lives in tmux session `carla-web`** with three panes:
  - pane 0: `npx vite --host 0.0.0.0 --port 58336` (Frontend)
  - pane 1: `UnrealEditor … -graphicsadapter=N` (CARLA UE5 server)
  - pane 2: `uvicorn src.main:app --host 0.0.0.0 --port 58337 --reload` (Bridge)
- Launch via `./start_streaming.sh --gpu N`. Stop via
  `./start_streaming.sh --kill`.
- **Never run UE5 on GPU 0.** Allowed GPUs: 2 or 3, passed as
  `-graphicsadapter=N`. UE5 Vulkan ignores `CUDA_VISIBLE_DEVICES`.
- **Never silently restart** the Vite or uvicorn pane (HMR / auto-reload
  handles code changes). Touch `carla-web-bridge/src/main.py` to force a
  bridge reload.
- **UE5 hung-but-alive recovery:** `kill -9 <ue5_pid>` then re-launch in pane
  1 with the exact cmdline (the supervisor in `run_carla.sh` handles port
  collision via PID-file kill, but only if it's the supervisor that started
  UE5). Watch for `run_carla.sh` instances spawning orphan UE5 — kill them
  too, they cause port collisions.
- **One UE5 process at a time.** Verify with `pgrep -af UnrealEditor.*carla-rpc-port`.
- Do not start a second `uvicorn` on port 58337 without `fuser -k 58337/tcp`
  first.

---

## 9. Per-Turn Discipline

Every turn that produces a status message:

1. Run the §1.4 self-audit. If it fails, prepend
   `PARTIAL-VERIFICATION RE-REPORT` with corrected scope.
2. Emit the §3 feature matrix (full matrix for milestone reports; delta
   matrix for incremental).
3. Cite evidence next to every ✅ — file path, command, numeric result.
4. State `Checked` / `NOT checked` / `Unknown` lists.
5. End with the next concrete action, named via §2.6 status vocabulary.

If a prior claim turns out to have been inflated:

1. Do not defend the earlier wording.
2. Do not explain why you used it.
3. Restate under this contract with correct scope and evidence (or mark
   unknown).
4. If the feature was reported as present and is not, reopen as
   `NOT IMPLEMENTED` and produce the §2.3 plan.

Honesty recovers trust faster than justification. Choose honesty.
