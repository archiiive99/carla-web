# Rendering Overhaul — No Cosmetic Escape

> Read this in addition to `rendering-100-percent-parity.md`. That
> document defines the bar (parity, measured). This document closes
> the specific escape hatches agents have been using to avoid the
> work while claiming they did it. If you are the rendering agent,
> these rules override any default tendency to deliver "improvements"
> that do not move pixels.

---

## 0. The escape pattern this document exists to kill

A previous iteration closed its session with a summary that looked
like this:

> - Deduplicated weather quick-preset tiles into a shared
>   `weather-quick-presets.ts` module...
> - Added a `3D: asset` / `3D: placeholder` **honesty badge** to
>   `ActorMetadataBadges` for vehicle actors... The selected actor's
>   details pane now directly tells the user whether the 3D viewport
>   is rendering that vehicle via a faithful UE glTF match or as the
>   class-sized wireframe placeholder...
> - Biggest remaining limitations:
>   - No street lights, signage illumination, or NPC headlights at
>     night — **honesty disclosure only**.
>   - Two-wheeler placeholder is still a rounded capsule — **better
>     than a box but clearly placeholder-grade**.
>   - Procedural buildings still stacked-box massing for unmapped
>     blueprints.

Every line above is a failure. Read them again with the right frame:

  - "Deduplicated weather quick-preset tiles" — UI refactor. Not
    rendering.
  - "Added a 3D: asset / 3D: placeholder honesty badge" — UI
    disclosure that the render is still broken. The user does not
    need a badge explaining the failure; the user needs the failure
    removed.
  - "No street lights... honesty disclosure only" — the agent
    replaced "implement the feature" with "tell the user we
    didn't."
  - "Two-wheeler placeholder is still a rounded capsule" — still a
    placeholder. Capsules do not look like motorcycles.
  - "Procedural buildings still stacked-box massing" — cityscape
    still reads as Minecraft. Not touched.

This pattern — **narrate the gap instead of close it** — is the
thing this document bans. It is banned even when it is well-named
("honesty"), even when it is cleanly factored ("shared
module"), and even when it typechecks ("clean tsc").

---

## 1. What "rendering overhaul" actually means

If the task label contains the word "rendering", the deliverable is
**pixels on screen that changed for the right reason**. Concretely
that means some combination of:

  - New 3D geometry in the scene that was not there before
    (buildings, curbs, street furniture, vegetation, vehicles with
    correct silhouettes, pedestrians, props).
  - New materials / shaders that change how existing geometry
    reflects light (PBR maps, wet surface response, anisotropic
    asphalt, foliage translucency).
  - New lighting or shadow contribution (sun, sky, ambient,
    emissive signs, headlights, street lamps, window lights at
    night).
  - New post-process passes (tonemap calibrated to reference,
    bloom on emissives, SSAO on geometry edges).
  - New asset pipeline work that feeds any of the above (extracting
    UE5 meshes, fetching OpenDRIVE + OSM + CARLA-exposed geometry,
    baking atlases, generating LODs).
  - Measured parity improvement on the harness described in
    `rendering-100-percent-parity.md` §4.

If your change log contains none of the above, you did not do
rendering work. Do not claim you did.

---

## 2. Single-source 3D architecture (FOUNDATIONAL — read first)

This is the load-bearing architectural rule. Every other section
in this document assumes it. Violating it makes parity
**structurally impossible** no matter how good your shaders are.

### 2.1 The required architecture

There must be exactly **ONE 3D scene graph** in the browser. That
scene is the single source of truth for everything visual:

```
[Browser]  one Three.js scene
            ├── geometry: roads, buildings, vegetation, props,
            │             vehicles, walkers, signage, lights
            ├── materials: PBR (albedo, normal, roughness, AO,
            │             emissive)
            ├── lighting: sun (directional), sky (gradient/HDR),
            │             street lights, headlights, signage emissives
            ├── post-process: tonemap, bloom, SSAO, FXAA/TAA
            └── multiple cameras, ALL rendering this same scene:
                 ├── Free-cam (user inspector / 3D viewport)
                 ├── Chase-cam (third-person follow ego)
                 ├── Cockpit / driver-eye (first-person ego)
                 └── Sensor cameras = virtual cameras attached to
                     ego (or any actor) at sensor.transform,
                     rendered to a WebGLRenderTarget, displayed
                     inside the SensorView panel as the
                     "camera feed".
```

The 3D viewport and the camera feed panels are **different
viewports onto the SAME scene**. They cannot diverge by
construction. If geometry is wrong in one, it is wrong in the
other — there is no place for them to disagree.

### 2.2 The architecture this REPLACES (banned)

The current decoupled architecture is banned and must be removed:

```
[CARLA UE5]  full UE5 render
              └── sensor.camera.rgb → BGRA → JPEG → WebSocket
                                                       │
[Browser]                                              v
   ├── SensorView panel ◄── decoded JPEG (CARLA-rendered pixels)
   └── 3D viewport      ◄── COMPLETELY SEPARATE Three.js scene
                            with placeholder geometry
                            (capsules, stacked boxes)
```

Why this is banned, in order of severity:

  1. **It is impossible to ever achieve parity.** The two views
     literally cannot show the same picture because they are
     drawn by different renderers from different data. Every
     improvement to one creates new divergence from the other.
  2. **It hides rendering failures.** Users can look at the
     CARLA-rendered camera feed (looks great because it is UE5)
     and conclude the system works, while the 3D viewport that
     they actually interact with shows capsules and boxes. The
     decoupling is what makes "honesty badges" feel acceptable
     — the agent can shrug and point at the camera feed.
  3. **It wastes server GPU and bandwidth** for a stream that
     could be rendered locally for free if the assets existed.
  4. **It blocks features** like "place camera anywhere",
     "multiple simultaneous cameras", "user-controlled FOV",
     "instant viewpoint change" — all of which require a
     server round-trip in the streamed model and are free in
     the single-source model.
  5. **It misleads every measurement.** Parity metrics compared
     against UE5 look fine on the streamed feed (because the
     stream IS UE5) but reveal nothing about whether the
     browser's interactive 3D world has improved.

### 2.3 What this means concretely

  - **Sensor cameras are Three.js `PerspectiveCamera` instances**
    parented to the same actor objects (vehicles, walkers) as
    the 3D viewport's camera. Their transform comes from CARLA
    (sensor pose synced over WS). Their rendering target is a
    `WebGLRenderTarget`; the resulting texture is what the
    SensorView panel displays.
  - **The CARLA `sensor.camera.rgb` JPEG stream is REMOVED** for
    the primary RGB camera path. The bridge no longer pumps
    JPEG bytes for that case. The bridge still streams sensor
    DATA that has no client-side equivalent (LIDAR point clouds,
    RADAR returns, IMU, GNSS, depth & semantic segmentation
    when those depend on the engine's z-buffer / classification
    that the client doesn't have).
  - **Depth / semantic-segmentation cameras**: two acceptable
    paths — (a) render them client-side too (Three.js can
    produce both: depth via shader, segmentation via a
    per-object id buffer rendered to a separate target);
    (b) keep streaming from CARLA with the understanding that
    these are engine-derived ground truth, not visual
    reproductions. Pick (a) wherever feasible.
  - **The 3D viewport and the SensorView camera panel must read
    from the same `Scene` reference** in code. There must be a
    single `WORLD_SCENE` (or equivalent) module-level object.
    No "viewport scene" + "sensor scene" pair.

### 2.4 Acceptance for the architecture itself

The single-source architecture is in place when ALL of:

  [ ] Exactly one Three.js `Scene` object exists at runtime
      (verifiable: search for `new THREE.Scene()` — should
      occur exactly once across the client codebase).
  [ ] Every camera panel (free-cam viewport, chase-cam, sensor
      RGB camera) is a `PerspectiveCamera` rendering that one
      `Scene`.
  [ ] The bridge no longer streams JPEG for the primary RGB
      camera (verifiable: WS traffic for that channel is zero
      while the SensorView panel still updates at the requested
      fps).
  [ ] Moving a building, changing a vehicle paint color, or
      toggling time-of-day in the 3D viewport changes the
      camera-feed panel in the same frame, with no server
      round-trip.
  [ ] Adding a new camera viewpoint requires zero bridge
      changes — purely a client-side `PerspectiveCamera`
      addition.

### 2.5 Migration guardrail

If you find yourself "improving" anything inside the JPEG-stream
camera path (encoder quality, color profile, frame skip, decoder
tuning) for the primary RGB camera, STOP. You are improving the
thing that needs to be deleted. Migrate to §2.1 first; the
encoder code goes away with the architecture.

This rule does NOT apply to the depth / segmentation streams (if
you keep them server-side per §2.3) nor to the LIDAR / RADAR /
IMU / GNSS data planes (those are not visual reproductions and
their streaming pipeline stays).

### 2.6 Forbidden architecture-level excuses

  - "We need the JPEG stream as a fallback while the asset
    pipeline is incomplete." No. The asset pipeline IS the
    work. Keeping the JPEG stream alongside guarantees the
    work never finishes.
  - "Some users have weak GPUs and can't render the full scene
    locally." Address with LOD, not with a parallel server
    renderer. Or stream PIXELS only as an explicit
    user-selected fallback mode, never as the default.
  - "Depth/semantic segmentation are too hard to do
    client-side." Acceptable per §2.3(b) for those specific
    sensors only — RGB does not get this exception.
  - "Refactoring to one scene is risky." It is the prerequisite
    for the parity goal. Risk it.

### 2.7 UE5 source is local — "we can't reproduce X" is banned

The full UE5 engine source AND the CARLA UE5 plugin source AND
the CARLA project Content (every .uasset, every material graph,
every shader) are on this filesystem:

  - UE5 engine: `/data1/song99/carla/Unreal/Engine/`
  - CARLA plugin: `/data1/song99/carla/Unreal/CarlaUnreal/Plugins/Carla/Source/`
  - CARLA Content: `/data1/song99/carla/Unreal/CarlaUnreal/Content/`
  - CARLA project: `/data1/song99/carla/Unreal/CarlaUnreal/CarlaUnreal.uproject`

Every UE5 visual is therefore **forensically reproducible**.
Every shader, every post-process pass, every material graph, every
mesh, every texture is readable. Every "we can't match UE5's X"
sentence is wrong. Concretely:

  1. If the question is "how does UE5 render X?" — read the
     source. The file paths above are the answer.
  2. If the question is "can the browser renderer match it?" —
     write a custom GLSL/WGSL shader from the UE5 shader source
     as spec; or compile a Rust+WASM compute module; or stream
     pixels via the existing Pixel Streaming WebRTC mode (which
     is already in the codebase) as a user-explicit fallback —
     NEVER as the default per §2.6.
  3. If the question is "how do we get the assets?" — see the
     `asset-extraction-pipeline.md` spec. The pipeline IS the
     work, not a precondition that must exist before work
     starts.

There is no fourth question. "Impossible" is banned permanently
because at least one of (1)+(2) or the streaming fallback always
applies.

### 2.8 GPU 2 mandate for any UE5-side work

If your iteration touches the Unreal side at all — launching
the editor, running a commandlet, cooking, extracting assets,
opening a Pixel Streaming session — every UE process MUST run on
GPU index 2:

```
-graphicsadapter=2
```

Vulkan (UE5's Linux RHI) ignores `CUDA_VISIBLE_DEVICES`, so the
env-var approach silently fails. The flag is the only reliable
pin. See `asset-extraction-pipeline.md` §2 for full rationale and
verification steps. GPU 0 is reserved for other workloads;
GPU 3 is also off-limits for this work — coordinate, do not
silently hop adapters.

---

## 3. Explicitly banned "rendering work"

The following are NOT rendering work. Shipping them as "rendering
overhaul" output is rejected.

### 3.1 Honesty badges / disclosure labels

Any UI element whose purpose is to tell the user "this part of the
3D view is a placeholder / low fidelity / approximate / mock" is
banned from this task. Examples of banned output:

  - `3D: placeholder` badge on an actor details panel.
  - `Using procedural geometry` tooltip on a building.
  - `Asset not loaded` warning icon on a vehicle row.
  - `Approximate` / `Demo quality` / `Draft` watermark on the
    viewport.
  - A legend explaining which vehicle types render as capsules.

Why: these move the rendering defect from "the render" into
"textual disclosure." The user already knows it is wrong — that is
why the task exists. Disclosing the problem is not solving the
problem.

If a genuinely partial state must exist during a multi-step rollout,
the disclosure belongs in the task report, not the UI.

### 3.2 UI refactors adjacent to rendering

Banned:
  - Deduplicating a list / preset / enum into a shared module when
    the list itself is rendered as UI chrome.
  - Renaming components.
  - Adding or removing React imports.
  - Tooltip wording changes.
  - Theme token migrations.
  - Commandpalette entries, icon swaps, keyboard shortcuts.

These belong to the UI/UX agent. They do not count toward
rendering. If the rendering code happens to need a small TS type
fix to compile, that's fine — but the delta must be ≤ 5 % of the
total diff by line count. If you caught yourself moving weather
tiles between files, you lost the plot.

### 3.3 Tolerating placeholders

Banned outputs:
  - "Two-wheeler placeholder is still a capsule."
  - "Buildings still stacked-box for unmapped blueprints."
  - "Pedestrians still cylinder."
  - "Trees still billboard quads."
  - "No street lights at night."

Each of these is a ❌ row on the §4.2 feature checklist from the
parity mandate. Each triggers §2.2 of the parity mandate
(enumerate implementation paths, pick one, implement). A bullet in
"remaining limitations" is not an implementation path.

### 3.4 Type/build-only "verification"

`npx tsc -b --noEmit — clean` and `npx vite build — clean` are
necessary but completely insufficient for rendering work. These
prove the code compiles. They do not prove anything rendered.

A rendering task's verification is a screenshot (or
measurement-harness output) that shows the pixels changed. If your
only verification line is a compile pass, the task is not verified
— say so honestly.

### 3.5 Compile-passing code that renders nothing

Adding a component, exporting a hook, wiring a prop, defining a
type — none of that is rendering unless pixels change. A rendering
PR whose diff is all `.ts` / `.tsx` scaffolding with zero change
to an actual rendered frame is rejected even if it compiles.

### 3.6 Improving the JPEG camera stream (post-§2 ban)

Per §2.5: any work to improve quality, latency, or efficiency of
the primary-RGB-camera JPEG stream is banned. That entire path is
slated for deletion. Improving it is improving the wrong artifact.

---

## 4. Required asset pipeline work

The root cause of most "it renders as a placeholder" states is the
absence of actual geometry/texture assets on the web side. The
correct fix is an asset pipeline, not an apology.

Note: under the §2 single-source architecture, the asset pipeline
is no longer optional. Without real assets, the SensorView camera
feed shows the same capsules and boxes as the 3D viewport — and
users will see it. The decoupled JPEG stream that previously
hid this is gone.

### 4.1 Geometry sources you must consider
At least ONE path must be implemented for every ❌ category:

  1. **CARLA exposes it directly**: `world.get_environment_objects`,
     `world.get_level_bbs`, OpenDRIVE (road network), map's static
     meshes via `carla.Map.get_topology` and related APIs. Hit the
     bridge, serialize, send.
  2. **UE5 project assets**: CARLA ships meshes under
     `Unreal/CarlaUnreal/Content/`. Extract to glTF via an editor
     commandlet or a headless UE build step. Bundle at build time.
  3. **Public-domain city data**: OSM 2.5D building footprints +
     height tags; use as a fallback or as a supplement for blocks
     CARLA doesn't expose.
  4. **Procedural, but not cubes**: if a category truly must be
     generated, generate it correctly — roofs with pitch, windows
     with mullions, vegetation with volume. "Stacked boxes" is not
     a procedural strategy; it is a not-implemented strategy.
  5. **Pre-baked atlases / impostors**: distant geometry as
     rendered-once-per-direction impostor sprites — legitimate
     cost saving, requires the geometry exists first.

### 4.2 Vehicle / pedestrian models
  - CARLA blueprint library already names every vehicle and walker
    type. Each has a corresponding UE5 static/skeletal mesh.
  - Extract these to glTF (GLB). Build a blueprint → GLB lookup.
  - No capsule. No rounded box. No "class-sized wireframe." If
    the extraction pipeline doesn't exist, your task is to build
    it — not to ship a capsule with a badge.
  - Skeletal mesh for pedestrians: the UE animation graph is not
    portable, but basic walk/idle cycles are authorable in glTF
    or computed client-side with a simple IK rig.

### 4.3 Lighting and emissives
  - Street lights, traffic lights, signage, headlights: these
    are light sources in UE5 and must be light sources on the
    web. Three.js supports point lights and spot lights; WebGPU
    compute supports clustered shading for dozens+. Implement.
  - Sun: a directional light whose direction is driven by CARLA's
    `sun_azimuth_angle` / `sun_altitude_angle`.
  - Sky: a gradient shader or a scattering model (Hosek-Wilkie /
    preetham) driven by the same angles.

### 4.4 Materials
PBR maps are required for every surface a user sees at
street-level distance. Ship at minimum: albedo, normal,
roughness, ambient occlusion. Metallic only where relevant.

---

## 5. Time budget — how to catch yourself drifting

When you sit down to a rendering iteration, declare up front in
your plan:

  - % of planned effort on pixels: **must be ≥ 80 %**.
  - % on UI / badges / command palette / tooltip wording: **must
    be ≤ 10 %**.
  - % on type hygiene / small refactors: **must be ≤ 10 %**.

At the end, report actuals. If your actual pixel-effort fell below
70 %, the iteration is graded as a miss even if everything you
shipped was individually fine.

A concrete red flag: if your final diff's largest file by line
count is a `.tsx` inside `components/controls/` or
`components/shared/`, you drifted. The largest files in a
rendering iteration should be inside `components/viewport/`,
`components/3d/`, `shaders/`, `assets/`, or the asset pipeline
directory.

---

## 6. Required workflow

### Step 1 — Confirm §2 architecture is in place
If the codebase still has a separate Three.js scene from a
JPEG-streamed sensor view, your first iteration's ONLY job is to
collapse to single-source per §2. Do not attempt other rendering
work until that is done; it would be wasted effort.

### Step 2 — Re-read the audit
Open `rendering-100-percent-parity.md` §3.1 (full-surface audit).
If your last audit is more than 24 h old, redo it — the scene
changes.

### Step 3 — Pick the single largest ❌ from the feature checklist
Rank ❌ rows by visual impact. Street-level first-person view is
weighted highest. Top-down and minimap are lowest. Example
impact ranking (approximate):

  1. Road surface reads as asphalt
  2. Building façades have windows/detail
  3. Vehicles have correct silhouettes
  4. Lane markings present + correct scale
  5. Sky / sun direction match
  6. Shadows cast from sun
  7. Vegetation has volume
  8. Pedestrians have shape
  9. Street lights emit light at night
 10. Traffic lights emit light

Pick the top ❌ row. Do NOT pick the easiest row. Do NOT pick a
UI adjacency.

### Step 4 — Enumerate implementation paths
From parity mandate §2.2, list ≥ 2 paths. Pick one. Write a
one-paragraph rationale. State the rough effort (hours → days).

### Step 5 — Build the asset pipeline piece if needed
If the chosen path needs geometry/textures that don't exist yet,
your iteration starts with the pipeline. That is rendering work.

### Step 6 — Implement
Change the scene. Pixels move. Because of §2, those pixels
appear simultaneously in the 3D viewport AND in the camera-feed
panel — confirm both updated.

### Step 7 — Capture matched-pair screenshots
Reference frame (UE5/CARLA native) vs web frame, same pose /
weather / time. Capture BOTH the 3D viewport view AND the camera
feed panel view; under §2 they should be identical from the
matching camera pose. Attach to report.

### Step 8 — Measure
Run the harness. PSNR / SSIM / ΔE numbers on the affected ROIs.

### Step 9 — Update audit
Flip the ❌ to ✅ (or ⚠️ with specifics). Do not delete the audit
row.

### Step 10 — Report
Per §7.

---

## 7. Report format (strict)

Your iteration report ends with exactly these sections in this
order:

### 7.1 Architecture posture
State the §2 status: "single-source achieved", "in migration
(step X of Y)", or "still decoupled — this iteration is the
migration." If still decoupled and not migrating, the report is
rejected.

### 7.2 Feature delta
Which ❌ rows moved to ✅ / ⚠️ this iteration. Exactly one row
per bullet, with the row's evidence link.

### 7.3 Pixel diff
Side-by-side screenshot strip: reference vs web 3D viewport vs
web camera-feed panel, at ≥ 2 camera poses. If the 3D viewport
and the camera-feed panel disagree, §2 is broken — call it out.
If no screenshots, state "no pixels changed this iteration" and
explain why that was correct (rare — this should almost never be
the right answer for a rendering iteration).

### 7.4 Measurements
PSNR / SSIM / ΔE numbers for each affected ROI, before vs after.

### 7.5 Effort breakdown
`% on pixels / % on UI / % on refactor` — actuals. If pixels <
70 %, label the iteration "drifted into UI" and note the
correction for next iteration.

### 7.6 Honesty-badge audit
Grep your own diff for: `placeholder`, `approximate`, `mock`,
`demo`, `draft`, `not yet`, `disclosure`, `honesty`,
`remaining limitation`. Report matches. Any match means you must
justify why it is NOT a disclosure-as-substitute-for-work pattern.

### 7.7 Remaining gaps → paths (not "limitations")
Every ❌ still remaining gets an implementation-path line, not a
"we don't support this yet" line. Use the §4 categories.

Banned section names: "Remaining limitations", "Known limitations",
"Honest disclosure", "Best we could do", "Future work". Each of
these was used to shield non-work in a prior iteration.

---

## 8. Forbidden phrases in the report

Grep your own report before sending. If any of these appear, rewrite:

  - "honesty badge" / "honesty disclosure"
  - "placeholder-grade"
  - "better than before" (without a measurement)
  - "class-sized wireframe" (used as a description of shipped output)
  - "clearly placeholder" (if present in shipped output, it is
    the thing to fix, not the thing to caption)
  - "procedural ... stacked-box massing" (unless describing the
    bug you just removed)
  - "disclosure only"
  - "source of truth" (when used to describe a label that reveals
    rendering is wrong, rather than a label that reveals rendering
    is right)
  - "fallback to JPEG stream" (per §2.6 — banned excuse).
  - "the 3D view and the camera feed are different by design"
    (per §2 — they are not).

These phrases were used to frame non-work as work in the escape-
pattern example. They are load-bearing for that failure mode.

---

## 9. Coordination

  - UI / UX agent owns chrome, panels, command palette, weather
    preset tiles, and everything under `components/controls/`,
    `components/layout/`, `components/shared/` — with a couple of
    rendering-specific exceptions you should agree on up front.
    If you change a file under those paths, expect it to be
    rejected as out-of-lane.
  - Agent C owns server-side color/encoding for sensor streams
    that still go through the bridge (depth, segmentation,
    LIDAR). Coordinate on gamma / tonemap / color-space for
    those specifically. The primary RGB camera path that §2
    deletes is no longer Agent C's surface either.
  - Agent A (sensor data plane) is affected by §2: removing the
    primary RGB JPEG stream changes what the bridge transmits.
    Coordinate the cutover.
  - Never restart the tmux streaming session. Use the documented
    hot-reload trigger if you must.

---

## 10. The one-line test

Before sending your iteration report, ask yourself two questions:

> 1. "If someone screenshotted the viewport before and after my
>    iteration, would a stranger be able to tell which is which?"
>
> 2. "If I move the camera in the 3D viewport, does the camera
>    feed panel show the same scene from the same vantage —
>    rendered by the same code?"

If the answer to either is "no", you did not do rendering work
under the §2 architecture. Label the iteration accordingly and
course-correct.
