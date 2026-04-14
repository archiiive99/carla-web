# Rendering 100% Parity Mandate — UE5 ↔ Web Client

> This is a hard contract for any agent working on the web-side 3D
> render (Three.js / WebGL / WebGPU / WASM / server-streamed). The
> bar is **visual parity with the UE5 / CARLA native render** —
> not "close enough", not "good enough for a browser", not "best
> effort." Parity. Measured. Every scene element.
>
> If you catch yourself typing "this is structurally impossible to
> reproduce on the web," stop and re-read §2. That sentence is
> banned.

---

## 0. Scope

### 0.1 What "parity" covers (non-exhaustive, but all mandatory)

Every visual element the user sees in the UE5 / CARLA editor view
must also be visible in the web client at comparable fidelity:

  - **Terrain / road surface**: asphalt material, aggregate noise,
    wear bands, patching, dirt-toward-curb gradient.
  - **Lane markings**: center lines, edge lines, dashed patterns,
    crosswalks, stop lines, arrows, symbols. Correct world-space
    scale, correct spacing, baked into material or projected via
    decals — never missing.
  - **Curbs, sidewalks, shoulders, gutters**: modeled, textured,
    visually distinct from the road.
  - **Intersections**: seamless, no visible polygon cracks, correct
    material continuity, crosswalks and stop lines present.
  - **Buildings**: geometry at correct scale, materials with normal
    maps, window patterns legible at typical camera distances, roof
    detail, façade variation.
  - **Vegetation**: trees, bushes, grass patches. Not flat billboards
    where UE5 shows volumetric foliage. Correct color under current
    weather / time-of-day.
  - **Street furniture**: traffic lights, signs, poles, benches,
    barriers, guard rails. Position, color, and material match.
  - **Vehicles**: model geometry, paint, lights, reflections,
    shadows. Correct pose synced with CARLA physics.
  - **Walkers (pedestrians)**: model, animation blend states where
    the bridge exposes them.
  - **Lighting**: sun direction, sun intensity, sky color, ambient
    tone, shadow direction and softness, indirect lighting where
    UE5 baked/computed it.
  - **Shadows**: cast by all shadow-casters the UE5 view shows.
    Soft/hard character match. No missing shadows, no shadow acne,
    no visible cascade seams at typical camera distances.
  - **Weather state**: cloudiness, precipitation, precipitation
    deposits (puddles, wet surfaces), wetness (specular response),
    fog (density / distance / falloff), wind intensity (foliage
    sway), sun azimuth and altitude.
  - **Time-of-day**: matches sun altitude / azimuth; sky gradient
    matches; specular character of surfaces matches the solar
    angle.
  - **Post-process**: tonemap, exposure, bloom, depth-of-field
    (if enabled in UE5), motion blur (if enabled), color grading,
    vignette, chromatic aberration (if enabled).
  - **Sensors visualized**: LIDAR point clouds, depth colormap,
    semantic segmentation palette, radar returns, IMU axes,
    camera frustums — all rendered consistently with CARLA's
    native visualizations.
  - **HUD / debug overlays**: when enabled, match CARLA's native
    debug drawing semantics.

### 0.2 What is explicitly OUT of scope
  - Pixel-exact reproduction at every camera angle on every GPU.
    (This would require a byte-identical GPU renderer — not the
    goal.)
  - Ray-traced global illumination if UE5 is NOT configured to use
    it. Only reproduce what the reference path actually ships.
  - Editor-only visualizations (volume boundaries, selection
    highlights) that the end user should not see.

### 0.3 "Parity" is defined numerically
A scene element is at parity when:
  - On a matched camera pose and weather/time state, the web
    render and the UE5 reference render differ by:
    - **PSNR ≥ 30 dB** on a center ROI (60% of frame area).
    - **SSIM ≥ 0.85** on the same ROI.
    - **Mean ΔE (CIE Lab) ≤ 5** on designated material ROIs
      (road surface, building façade, sky).
  - OR, where exact pixel parity is infeasible (baked-GI differences,
    procedural noise seeds), the element reads as the SAME element
    to an uninformed viewer in a blind A/B test across 5+ viewers
    at a glance (≤ 3 s viewing time), and passes the designated
    feature checklist for that element (see §4.2).

"Looks about right" is not in the definition.

---

## 1. Verification honesty — non-negotiable

You will use words like "verified", "correct", "match", "done",
"parity achieved" ONLY when backed by:
  1. An executed comparison against the UE5 / CARLA reference at
     a specific camera pose and state.
  2. A numeric measurement (PSNR / SSIM / ΔE / feature-checklist
     tally).
  3. An explicit list of what was covered and what was not.

Partial verification is labeled "PARTIAL — covered {A, B}; not
covered {C, D, E}." Never extend a sample into a whole-system
conclusion.

Banned without evidence:
  "looks good", "seems right", "roughly equivalent", "basically
  the same", "close enough", "no issues", "working", "done",
  "production-ready", "parity" (unadorned).

If you catch yourself writing any of those, stop, rewrite with
evidence or with "PARTIAL / UNKNOWN."

---

## 2. The reimplementation mandate

Every visual element the UE5 render produces MUST be reproducible
on the web side. The only open question is HOW.

### 2.1 Forbidden conclusions
  - "Structurally impossible to reproduce in the browser."
  - "WebGL/WebGPU cannot do this."
  - "Three.js doesn't support it."
  - "Engine-specific; cannot be ported."
  - "Would need the full Unreal renderer."
  - "Known limitation of the web stack."
  - "Accept this divergence."

These phrases are banned because every observed case was an excuse
for "I didn't implement it." Physical impossibility is rare in
software on general-purpose hardware with unbounded language choice.

### 2.2 Legitimate implementation paths
Pick at least two and compare before choosing:

  1. **Pure client, Three.js / R3F**: MeshStandardMaterial /
     MeshPhysicalMaterial with authored PBR maps (albedo, normal,
     roughness, metallic, AO). Decals for lane markings.
  2. **Pure client, custom shader**: GLSL/WGSL for effects the
     built-in materials can't express (anisotropic road, wet
     specular puddles, complex foliage).
  3. **Compute-heavy client**: WebGPU compute passes for what is
     too slow on the CPU/fragment side (e.g. screen-space GI,
     particle simulation).
  4. **Rust + WASM**: when JS/TS is too slow for a hot path
     (mesh generation, spatial indexing, image codecs, physics
     interpolation). Use `wasm-bindgen` / `wasm-pack`, SIMD on.
  5. **Server-authoritative render**: run the UE5 renderer (or a
     reimplementation) server-side, stream pixels via WebCodecs
     (H.264/HEVC/AV1) over WebRTC or WebSocket. This path trades
     GPU compute for bandwidth.
  6. **Hybrid**: server renders expensive passes (e.g. shadow map
     or GI probe data), client composites with lightweight
     local geometry. Or: server pre-renders keyframes, client
     reprojects.
  7. **Native module bridge**: a local helper (Rust binary / Node
     native addon) exposed via WebSocket to a browser on the same
     machine.
  8. **Precomputed / baked**: for static or semi-static elements
     (building interiors, distant city LOD), bake offline and ship
     as assets.

For every element or effect that looks "hard":
  - Step 1: Characterize the UE5 source pipeline for it.
  - Step 2: List ≥ 2 candidate paths from the list above.
  - Step 3: Compare on fidelity / latency / bandwidth / effort.
  - Step 4: Pick one. Implement it. State why.

### 2.3 Performance is not an exit
If the candidate path is "too slow", the next move is not
"abandon." It is:
  - Move to GPU (WebGL2 / WebGPU compute / fragment).
  - Rewrite hot path in Rust/WASM with SIMD.
  - Move to server; stream.
  - Reduce the problem (LOD, temporal upsampling, variable-rate
    shading, reprojection, frustum and occlusion culling,
    instancing).
  - Precompute.

Numbers first, conclusion second. "Feels slow" is not a
measurement.

### 2.4 Language/runtime unconstrained
Reach for whatever serves the goal: TypeScript, JavaScript, Rust,
C, C++, Zig, Go, Python (server-side), GLSL, WGSL, HLSL
cross-compiled, CUDA on the server, native addons, FFI. The
delivery surface is the browser; the implementation surface is
open.

---

## 3. Required workflow

### 3.1 Full-surface audit before any edit
Enumerate the current state. In writing, before touching code:

  1. Every scene category from §0.1: present / partial / missing
     / broken in the current web client.
  2. For each "present" element: list the concrete implementation
     choice (e.g. "road = MeshStandardMaterial with one tiled
     albedo texture, no normal map, no decals for markings").
  3. For each "broken" element: describe the failure mode with a
     screenshot and a one-line diagnosis.
  4. For each "missing" element: describe how UE5 renders it,
     and the candidate paths (§2.2) for reproducing it.

This audit goes in the final report. Reviewers read it to confirm
you looked at everything, not just what you happened to fix.

### 3.2 Matched-pair reference capture
Before fixing anything, capture UE5 / CARLA reference frames:

  - Use `carla.Client()` + a native python camera, OR use the UE5
    editor's High Resolution Screenshot feature, to capture
    reference images at:
    - A street-level pose (driver's eye height, looking forward).
    - A chase-cam pose (behind vehicle, slightly elevated).
    - A top-down pose (bird's eye).
    - Three weather states: clear midday, rain, fog.
    - Two time-of-day: midday, golden hour.
  - Total: 3 × 3 × 2 = 18 reference images minimum. Name them
    deterministically (`ref_pose-street_weather-clear_tod-midday.png`).
  - Store under `carla-web-bridge/tools/render_parity/references/`
    (create the directory).

These are your ground truth for the duration of the work.

### 3.3 Root-cause diagnostic before writing shaders
Most "looks wrong" failures are one of:

  - **Missing material assignment**: default / placeholder /
    vertex-color fallback.
  - **Texture loading failure**: 404, CORS, wrong path, fallback
    to a 1×1 pink pixel.
  - **Wrong UVs**: planar UVs on a curved mesh → stretching;
    centerline-parametric needed.
  - **Wrong texel density**: too few texels/m → blurry; too many
    → obvious tiling.
  - **Lane markings approach**: baked into material mask vs
    decals vs floating geometry (each has tradeoffs and failure
    modes).
  - **Shading model**: unlit material where PBR is needed.
  - **Missing edge geometry**: roads running into void instead
    of modeled curbs/sidewalks.
  - **Intersection stitching**: mismatched UVs at polygon seams.
  - **Post-process crush**: tonemap / exposure destroying
    mid-tones so everything reads as a gray blob.
  - **Color-space mismatch**: linear vs sRGB assumption broken at
    one texture upload or at the canvas stage.

State WHICH category applies, with evidence, before writing the
fix. If "several", address in order of visual impact.

---

## 4. Measurement and acceptance

### 4.1 Measurement harness (required deliverable)
Tool: `carla-web-bridge/tools/render_parity/compare.py` (extend
the existing `tools/compare_render.py` or add a new one here).

What it does:
  1. Loads reference images from §3.2.
  2. Drives the web client via Playwright (or equivalent) to the
     same camera pose / weather / time-of-day. Use the existing
     `start_streaming.sh` tmux session — do NOT restart it.
  3. Captures a screenshot from the web client's 3D canvas.
  4. For each matched pair:
     - PSNR (full frame + ROI).
     - SSIM (full frame + ROI).
     - Mean ΔE over designated material ROIs (road, façade,
       sky).
     - Histogram comparison (RGB + luminance).
  5. Emits a Markdown report with the table + side-by-side
     thumbnail strip.
  6. Exit code 0 if all thresholds pass, nonzero otherwise —
     suitable for CI.

Thresholds per §0.3. Document any per-scenario exceptions with
written justification.

### 4.2 Feature checklist (required, per scene category)
For scenes where pixel parity is infeasible (procedural noise,
baked GI seed), you still must pass a feature checklist. Each
row is ✅ / ⚠️ / ❌ / ❓ with evidence.

Example checklist for a street-level frame:

  | # | Feature                         | Status | Evidence     |
  |---|---------------------------------|--------|--------------|
  | 1 | Asphalt material reads as road  |  ✅    | SSIM 0.89    |
  | 2 | Center line present, correct    |        |              |
  |   |   scale, no z-fighting           |        |              |
  | 3 | Edge line present                |        |              |
  | 4 | Crosswalks at intersections      |        |              |
  | 5 | Stop lines at intersections      |        |              |
  | 6 | Curbs modeled, distinct color    |        |              |
  | 7 | Sidewalks present, distinct      |        |              |
  | 8 | Building façades textured        |        |              |
  | 9 | Building windows legible         |        |              |
  | 10| Vegetation not billboard-only    |        |              |
  | 11| Traffic lights visible           |        |              |
  | 12| Sky gradient matches reference   |        |              |
  | 13| Sun position matches             |        |              |
  | 14| Shadow direction matches         |        |              |
  | 15| Shadow softness matches          |        |              |
  | 16| Tonemap / exposure not crushed   |        |              |
  | 17| No obvious texture tiling        |        |              |
  | 18| No missing edges at intersect.   |        |              |
  | 19| Weather state visible in render  |        |              |
  | 20| Time-of-day visible in render    |        |              |

Any ❌ triggers §2.2 workflow for that feature.

### 4.3 Acceptance criteria (all must be evidence-backed)
  [ ] Audit from §3.1 complete, attached to report.
  [ ] 18+ matched-pair references captured (§3.2).
  [ ] Measurement harness runs with one command, produces report.
  [ ] §0.3 PSNR / SSIM / ΔE thresholds met for ≥ 80% of matched
      pairs. Any failing pair has a written follow-up plan.
  [ ] Feature checklist (§4.2) fully populated per matched pair
      with evidence per row.
  [ ] Zero ❌ rows that lack an implementation-path plan from §2.2.
  [ ] A first-time viewer, shown only the web render, identifies
      every scene element correctly without prompting (blind
      test, 5+ viewers, ≤ 3 s per frame).
  [ ] Bridge / streaming stack was NOT restarted during this work
      (the "never restart" rule applies).

---

## 5. Forbidden patterns

### 5.1 Legacy-is-sacred
Do not leave old rendering code untouched "because it already
existed." If the old code produces non-parity output, it is the
target. Sweep the whole render layer for the same class of
violation (see §7).

### 5.2 Cosmetic-only changes
A fix that tweaks an alpha value but doesn't close a feature-
checklist gap is not progress. If Delete/Consolidate/Clarify
counts are zero and Add is large, reconsider.

### 5.3 Defensive fallback proliferation
Every `if (!texture) return defaultGrayMaterial` hides a real
bug. Either load the texture correctly or fail loud. No silent
pink-texel fallbacks.

### 5.4 Divergence normalized
"This diverges from UE5 but I think it looks fine" is not an
acceptable resolution. UE5 is the reference. If divergence is
justified (e.g. a post-process too expensive in the browser),
document the divergence, the cost that motivated it, and the
mitigation taken to minimize perceptual distance.

### 5.5 Screenshot fabrication
Do not describe what a rendered frame "would look like." Either
capture a frame with the measurement harness or state "not
captured." No imagined screenshots.

---

## 6. Report format

Every report this agent produces ends with:

  1. **Audit** (§3.1): current state per scene category.
  2. **Matched-pair metrics** (§4.1): PSNR / SSIM / ΔE table for
     every reference pair, with pass/fail per row.
  3. **Feature checklist** (§4.2): populated per matched pair.
  4. **Change log**: per change — (element, before, after,
     principle cited, evidence link).
  5. **Delete / Consolidate / Clarify / Add counts**. Add should
     not dominate.
  6. **Legacy touched**: files predating this task that were
     modified for parity. Empty list → you failed the mandate.
  7. **Screenshots before / after**: rendered side-by-side strip.
  8. **Verified / Unverified per change** with evidence.
  9. **Known gaps**: what did NOT reach parity in this pass and
     the path forward.

---

## 7. Failure recovery

When the user or a reviewer points out a surviving non-parity
element:
  1. Do not argue "out of scope" or "pre-existing."
  2. Do not fix only the one instance — sweep the render layer
     for the same class of violation and fix them all.
  3. Update the §3.1 audit to include that class so future
     passes don't miss it.

The right response to "the building windows look wrong" is not
"I'll fix that one building." It is "I'll re-audit every building
material for window legibility and report back with a full pass."

---

## 8. Coordination

This agent touches the web client's 3D render layer. It does NOT
touch:
  - Server-side encoders (`carla-web-bridge/src/compression/image.py`)
    — Agent C owns color/encoding fidelity audits.
  - Session manager / ego vehicle logic (`src/realtime_session.py`)
    — Agent B.
  - Sensor data plane (`src/sensor_manager.py`, `src/ws_broadcaster.py`)
    — Agent A.
  - Adaptive rate control — Agent D.
  - Integration tests — Agent E.
  - UI chrome (panels, buttons, toolbars) — the UI/UX agent.

Share measurements with Agent C (server-side color) so the
server-side contribution to color drift can be separated from
client-side tonemap / gamma / shader issues.

---

## 9. Banned-phrase reminder (one more time)

Before sending your report, grep your own text for:
  "roughly", "basically", "close enough", "should work", "works
  fine", "good enough", "can't be done", "structural", "pipeline
  different", "accept this divergence", "best effort", "browser
  limitation", "engine-specific."

If any hit, rewrite with evidence, scope, or a §2.2 path.
