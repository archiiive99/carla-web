# Iteration 01 — Road Surface PBR + Parity Measurement Harness

> Required reading before you start (do not skip):
>   - `rendering-100-percent-parity.md` (the bar)
>   - `rendering-overhaul-no-cosmetic-escape.md` (escape patterns
>     and the §2 architecture you just landed)
>   - `asset-extraction-pipeline.md` (asset rules + GPU 2 mandate)
>   - Memory: `project_ue5_source_local.md` (local source paths)
>
> §2 single-source architecture is in place. This is the FIRST
> pixel iteration.

---

## 0. Why two things in one iteration

This iteration bundles a feature-row pixel improvement (road
surface reads as asphalt — parity-mandate §3 ranking row #1) with
the measurement harness MVP. They ship together because:

  - Every future iteration owes evidence (PSNR / SSIM / ΔE).
  - There is nothing to measure until the first feature row is in
    flight, so the harness has no useful test target on its own.
  - Building both at once forces the harness to actually work
    against a real change rather than being a pristine but
    unproven tool.

This bundling is a one-time concession. From iteration 02 onward,
the harness exists; pixel iterations use it without re-building.

---

## 1. Scope

### 1.1 IN scope
  - Road surface material on the web side: asphalt PBR (albedo,
    normal, roughness, AO) replacing the current near-flat shader.
  - Lane-marking texture or decal pipeline that produces correct
    world-space scale and survives curves and intersections.
  - Asset extraction subset: ONLY road-relevant materials + lane-
    marking textures. Do NOT extract walkers, buildings, vegetation
    in this iteration.
  - Measurement harness MVP at
    `carla-web-bridge/tools/render_parity/compare.py` (or
    `carla-web/tools/render_parity/`, agent's call — document the
    location).

### 1.2 OUT of scope (do not touch)
  - Walker mesh / silhouettes (capsule placeholder stays for now).
  - Building façades (stacked-box stays for now).
  - Street lights / emissives / night signage.
  - Vegetation.
  - Free-cam controller refinement.
  - Lidar scene fold-in.
  - Cleanup of stale "honesty"-framed comments in files unrelated
    to road work. Defer to whichever future iteration actually
    edits those files.
  - Anything under `components/controls/`, `components/shared/`,
    `components/layout/` beyond a ≤ 5-line type fix to compile.

If a fix in road code requires touching another file outside the
road scope, surface it in the report; don't expand the iteration.

---

## 2. Required investigation (do this before writing code)

### 2.1 Read the UE5 road material source
The CARLA road material is in the local UE5 project content. Find
it by searching:

```bash
ls /data1/song99/carla/Unreal/CarlaUnreal/Content/Carla/Static/Road/
ls /data1/song99/carla/Unreal/CarlaUnreal/Content/Carla/Static/RoadPainter/
# Materials likely live alongside or under a /Materials/ subdir
rg -l 'M_Road' /data1/song99/carla/Unreal/CarlaUnreal/Content/ \
   --type-add 'asset:*.uasset' -tasset 2>/dev/null || \
   find /data1/song99/carla/Unreal/CarlaUnreal/Content -name 'M_Road*.uasset'
```

Identify:
  - Master road material (likely `M_Road*` or similar).
  - Lane-marking material(s).
  - Asphalt detail / aggregate noise textures referenced by the
    material.
  - Wear / patching / dirt-toward-curb textures or shader nodes.

Read the material graph (open with UE editor on GPU 2, or parse
the `.uasset` tooling). Document in your report what passes the
UE material runs, in what order. This becomes the spec for the
Three.js side.

### 2.2 Read the existing client road code
  - `carla-web/src/components/viewport/RoadNetwork.tsx`
  - `carla-web/src/components/viewport/RoadMesh.tsx` (or wherever
    the shader lives now)
  - Any `road-materials.ts` or similar.

Document the current implementation: what textures it uses, what
shader operations, what UV parameterization. This becomes the
"before" baseline.

### 2.3 Check existing client lane-marking approach
The agent's audit said the current code has shader-generated lane
markings on a mostly-flat albedo. Confirm. Decide whether to:
  - (A) Keep procedurally generated markings but improve the
        underlying asphalt material (faster path, lower fidelity
        ceiling).
  - (B) Switch to decal/texture-baked markings extracted from UE5
        (higher fidelity, more work).

Pick (B) if the UE5 source uses authored marking textures (likely)
or (A) only if the UE5 source itself is procedural (less likely).
Justify in writing.

---

## 3. Asset extraction subset

Per `asset-extraction-pipeline.md` §2: any UE5-side process MUST
run with `-graphicsadapter=2`. Verify with `nvidia-smi` after
launch.

### 3.1 Required outputs
  - Asphalt PBR set: albedo + normal + roughness + AO at
    1 m–4 m tileable, 2K resolution. KTX2 / Basis Universal
    compressed.
  - Lane-marking texture(s): white solid line, white dashed line,
    yellow solid line, yellow dashed line, crosswalk pattern,
    stop line, arrow set. Either as separate alpha-masked
    textures or one packed atlas with UV coordinates per
    marking type.
  - Optional aggregate / wear detail textures if the UE5
    material uses them and they materially affect the look at
    street-level distances.

### 3.2 Output location
`carla-web/public/assets/carla/road/`. Subdirectories at your
discretion (e.g. `asphalt/`, `markings/`).

### 3.3 Manifest
Add `carla-web/src/components/viewport/carla-assets/road-assets.ts`
exporting the texture path constants the road material code will
import. Single source of truth for paths.

### 3.4 Extraction tooling
Pick ONE of `asset-extraction-pipeline.md` §4 paths. For this
iteration's small subset, §4.3 (FBX intermediate + manual texture
export) is acceptable speed-vs-effort. If you build a commandlet
(§4.1), it counts toward future iterations' velocity — bonus, not
required this iteration.

Do NOT extract more than the road needs. Walker / building / etc.
extraction is a separate iteration.

---

## 4. Implementation — road material

### 4.1 Decide path between procedural and decal
Per §2.3 above. Document the decision and the reason.

### 4.2 UV strategy
Centerline-parametric UVs along each road segment. Texels-per-
meter constant across all segments (document the chosen rate,
e.g. 256 texels/m). Verify by inspecting curve sections in the
viewport — no visible stretching at curves, no obvious tile seams
between straight and curved sections.

### 4.3 Shader / material composition
Either a `MeshStandardMaterial` with the extracted textures wired
in, OR a custom GLSL/WGSL shader that blends a tileable detail
with low-frequency variation to hide tiling. If the UE5 material
uses macro-variation (it often does), reproduce that on the
client.

### 4.4 Wet surface response (preview, optional this iteration)
If the CARLA `wetness` weather parameter is non-zero, the road
should show specular puddles or general roughness drop. Wiring
this is a stretch goal; the bridge already exposes the weather
state. Mark as ⚠️ in the report if you don't get to it (not ❌,
because it's not the iteration target — but document the path).

### 4.5 Intersections and seams
After material change, walk the camera through at least 3
intersections in the dev session. Confirm:
  - No visible polygon seams.
  - Marking continuity (crosswalks / stop lines present and aligned).
  - Material consistency (no "different asphalt across the seam").

If broken: that may be a mesh-stitching issue from the upstream
road network, not a material issue. Surface the finding without
trying to fix the mesh in this iteration.

---

## 5. Measurement harness MVP

### 5.1 Tool
Path: `carla-web-bridge/tools/render_parity/compare.py` (Python)
plus `carla-web/tools/render_parity/capture.ts` (Playwright
script for browser screenshot) — document the split if you go
this route, or pick a single-language tool.

### 5.2 Required commands
One CLI entrypoint, e.g.:
```
python tools/render_parity/compare.py \
   --pose street_clear_midday \
   --bridge-url ws://host:58338 \
   --carla-host localhost:2000 \
   --out reports/iter01/
```

### 5.3 Required behavior
For ONE pose initially (street-level, midday, clear weather):
  1. Drive the web client to that pose via Playwright (or set
     the camera transform via a debug WS message — pick one).
  2. Capture a screenshot of the main 3D viewport at fixed
     resolution (1920×1080).
  3. Independently, use `carla.Client()` (Python) to spawn a
     transient `sensor.camera.rgb` at the same world transform,
     capture one frame, save as PNG.
  4. Compute on the matched pair, restricted to a road ROI
     (fraction-of-frame coordinates, default
     `[(0.2,0.6),(0.8,0.6),(0.8,0.95),(0.2,0.95)]` — center-bottom
     where the road is):
     - PSNR
     - SSIM
     - Mean ΔE (CIE76 is fine for the MVP; CIE2000 if convenient)
  5. Emit `reports/iter01/report.md` with the table + a
     side-by-side image strip + the raw numbers in
     `reports/iter01/report.json`.

### 5.4 What the MVP does NOT need yet
  - More than one pose. (Future iterations will add poses.)
  - Multiple weather/TOD permutations.
  - Automatic camera pose negotiation between client and CARLA.
  - CI integration. (Manual-run is fine.)

### 5.5 Important constraint
The harness compares the WEB renderer against the CARLA UE5
renderer. After §2 single-source migration, the web renderer is
authoritative for the user's view. The CARLA `sensor.camera.rgb`
remains accessible as a REFERENCE captured directly via
`carla.Client()` — that is how you measure parity. Capturing the
reference does NOT re-introduce the JPEG WS stream; it's a
side-channel for testing only. Document this distinction in the
harness README so nobody re-wires the UI to the CARLA stream.

---

## 6. Acceptance criteria

  [ ] Road feature checklist row in
      `rendering-100-percent-parity.md` audit moves from ❌ to ✅
      or ⚠️ with explicit unmet sub-items.
  [ ] On the chosen street-level / clear-midday matched pair,
      ROI metrics meet OR justify deviation:
        - PSNR ≥ 28 dB (slightly relaxed from the §0.3 30 dB bar
          for this first iteration; raise the bar in iteration
          02 once the harness has a baseline).
        - SSIM ≥ 0.80.
        - Mean ΔE ≤ 6.
      If not met, the report MUST contain a written analysis of
      where the gap comes from (UV mismatch / wrong tonemap /
      missing detail map / wrong color space at upload / etc.)
      and the next-iteration fix path.
  [ ] Harness runs to completion with one command. Report file
      exists and contains numbers + screenshots.
  [ ] Asset bundle delta documented: how many MB added under
      `carla-web/public/assets/carla/road/`.
  [ ] Effort breakdown: pixels + asset pipeline ≥ 80 %, harness
      ≤ 15 %, type/refactor ≤ 5 %.
  [ ] No edits to `components/controls/`, `components/shared/`,
      `components/layout/` beyond ≤ 5 lines of compile-fix.
  [ ] Honesty-badge audit clean (per existing §7.6 rules).
  [ ] No regression in §2 architecture: `rg "new (THREE\\.)?Scene"`
      still returns the same single-source set as iteration 0
      (WorldCanvas + LidarScene only).

---

## 7. Workflow

  1. **Investigation** (§2): UE5 material reading + client code
     reading. Write findings into the report draft now.
  2. **Pose selection**: pick the one street-level pose for the
     harness. Pin its world transform in code so subsequent
     iterations measure the same point.
  3. **Asset extraction** (§3): GPU 2, only road-relevant assets.
  4. **Harness MVP** (§5): build it next, before the road code
     change. Capture the BEFORE numbers (current flat shader vs.
     UE5 reference).
  5. **Road material change** (§4): implement.
  6. **Capture AFTER numbers**.
  7. **Update parity audit**: flip the row, attach evidence.
  8. **Report** (§7 of `rendering-overhaul-no-cosmetic-escape.md`).

---

## 8. Reminders

  - GPU 2 only for any UE5-side launch. Document
    `nvidia-smi` confirmation.
  - The §2 architecture is sacred — do not regress it.
  - "Roughly", "looks better", "approximately matches" without
    numbers → rejected per the verification-honesty rules.
  - If during the iteration you discover the road needs upstream
    mesh changes (intersection stitching, etc.), surface as a
    finding; do not silently expand into mesh work this iteration.

---

## 9. After this iteration

The next iteration is queued: **Iteration 02 — Building façades**
(parity row #2). Building work needs an extraction pass for façade
meshes + window/door detail textures. Do NOT touch building code
in this iteration; that scope is deliberately reserved.

The harness from this iteration will gain additional poses and
weather/TOD permutations as iterations 02+ land.
