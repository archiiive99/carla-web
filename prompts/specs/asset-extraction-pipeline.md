# Asset Extraction Pipeline — UE5 → glTF

> Read this in addition to `rendering-100-percent-parity.md` and
> `rendering-overhaul-no-cosmetic-escape.md`. This document defines
> the asset-extraction work that feeds the browser's single-source
> 3D scene. Without this pipeline, every "render parity" claim is
> moot — the client cannot match UE5 with assets it does not have.

---

## 0. Why this document exists

After the §2 single-source architecture lands, the browser scene
is the only renderer. If a building shows as a stacked box, every
camera sees a stacked box. There is no longer a JPEG-streamed
camera feed to hide behind. This makes the asset pipeline
**load-bearing**, not "nice to have."

This document also exists to delete a class of excuse forever:
"we don't have the assets" / "asset extraction is blocked" /
"the meshes aren't accessible." Every UE5 mesh, material, texture,
and shader used by CARLA is on this filesystem. Every one is
mechanically extractable. There is no excuse left.

---

## 1. Hard facts — local source availability

These paths exist on the workstation. Verify with `ls` before
claiming otherwise:

  - **UE5 engine source**: `/data1/song99/carla/Unreal/Engine/`
  - **CARLA UE5 plugin source**: `/data1/song99/carla/Unreal/CarlaUnreal/Plugins/Carla/Source/`
  - **CARLA UE5 project**: `/data1/song99/carla/Unreal/CarlaUnreal/`
  - **CARLA content (assets)**: `/data1/song99/carla/Unreal/CarlaUnreal/Content/`
  - **CARLA project file**: `/data1/song99/carla/Unreal/CarlaUnreal/CarlaUnreal.uproject`

You have:
  - Every static mesh (`.uasset`) for every map.
  - Every skeletal mesh for vehicles and walkers.
  - Every material graph (also `.uasset`) used by those meshes.
  - Every texture (albedo / normal / roughness / AO / metallic /
    emissive), exportable to PNG / KTX2.
  - Every blueprint that defines spawn behavior.
  - Every weather / time-of-day post-process volume.
  - Every shader source consumed by the materials (HLSL via
    UE's material graph compile).

If you write the phrase "we don't have access to..." about
anything visual in CARLA, you are wrong. Verify the path, then
extract.

---

## 2. GPU 2 mandate for any UE5 work

**Every Unreal-side operation** — editor launch, headless cook,
commandlet run, asset extraction job, Pixel Streaming session —
must run on GPU index 2.

### 2.1 Why
The host has multiple GPUs. GPU 0 is reserved for other workloads
and must NEVER be used by Unreal. Vulkan (UE5's default RHI on
Linux) ignores `CUDA_VISIBLE_DEVICES`, so the standard env-var
isolation does not work. The only reliable way to pin UE5 to a
specific GPU is the `-graphicsadapter=N` command-line flag.

### 2.2 How
Every UE-side invocation MUST include:
```
-graphicsadapter=2
```
on the command line. Examples:

```bash
# Editor launch
.../Engine/Binaries/Linux/UnrealEditor \
    /data1/song99/carla/Unreal/CarlaUnreal/CarlaUnreal.uproject \
    -graphicsadapter=2

# Headless commandlet (asset export, cook, etc.)
.../Engine/Binaries/Linux/UnrealEditor-Cmd \
    /data1/song99/carla/Unreal/CarlaUnreal/CarlaUnreal.uproject \
    -run=YourCommandlet \
    -graphicsadapter=2 \
    [other args]

# Cook
.../Engine/Build/BatchFiles/RunUAT.sh BuildCookRun \
    -project=/data1/song99/carla/Unreal/CarlaUnreal/CarlaUnreal.uproject \
    -platform=Linux -cook -graphicsadapter=2 [...]
```

### 2.3 Verification
Before running any long UE job, sanity check with:
```bash
nvidia-smi   # confirm GPU 2 is the one with low utilization
```
After launching, re-check `nvidia-smi` — the UnrealEditor process
must appear under GPU index 2, not 0 or 1 or 3.

### 2.4 Forbidden
  - Omitting `-graphicsadapter=2` "because it usually works."
  - Setting `CUDA_VISIBLE_DEVICES=2` instead of (or in addition
    to) `-graphicsadapter=2`. Vulkan does not honor it.
  - Running multiple UE processes on the same GPU concurrently
    (cook + editor + extraction = OOM).
  - Picking GPU 3 because "GPU 2 is busy." Coordinate; don't
    silently hop GPUs — the rest of the team expects UE on 2.

If GPU 2 is genuinely unavailable for your job, raise it; do not
pick another adapter unilaterally.

---

## 3. Required pipeline outputs

### 3.1 Vehicles (existing — extend coverage)
  - One GLB per CARLA vehicle blueprint id (e.g.
    `vehicle.tesla.model3.glb`).
  - Embedded materials with PBR maps in the GLB (no external
    texture refs that would 404 in the browser).
  - LODs at minimum 2 levels (LOD0 for street-level, LOD1 for
    distant). KTX2 / Basis Universal compression on textures.
  - Output dir: `carla-web/public/assets/carla/vehicles/`.
  - Manifest: `carla-web/src/components/viewport/carla-assets/vehicle-models.ts`
    blueprint-id → GLB path mapping. Already exists; extend
    coverage.

### 3.2 Walkers (NEW — replaces capsule placeholder)
  - One GLB per CARLA walker blueprint id (`walker.pedestrian.NNNN`).
  - Skeletal mesh exported with rig; a basic walk + idle
    animation cycle authored as a glTF animation channel.
  - Output dir: `carla-web/public/assets/carla/walkers/`.
  - New manifest module:
    `carla-web/src/components/viewport/carla-assets/walker-models.ts`.
  - WalkerMesh.tsx is updated to load from the manifest, not
    capsule + sphere primitives.

### 3.3 Buildings (NEW — replaces stacked-box procedural)
  - Per map, extract the static mesh actors used in city blocks
    as individual GLBs, OR
  - Pack a per-map combined GLB (one mesh per building) with
    transforms baked in. Trade memory vs draw calls.
  - Output dir: `carla-web/public/assets/carla/maps/{TownNN}/buildings/`.
  - Manifest: per-map JSON listing GLB path + world transform per
    building.
  - The procedural stacked-box fallback path
    (`build-procedural-buildings.ts`) is deleted at the end of
    this work, not retained as fallback.

### 3.4 Vegetation (NEW)
  - Trees, bushes, grass clumps as GLBs.
  - Use instanced meshes for grass / repeated foliage to keep
    draw counts low; the GLB carries one mesh + the manifest
    carries instance transforms.
  - Output: `carla-web/public/assets/carla/maps/{TownNN}/vegetation/`.

### 3.5 Street furniture (NEW)
  - Traffic lights, traffic signs, lamp posts, benches, trash
    cans, barriers, guard rails, fire hydrants.
  - Each as a GLB.
  - Lamp posts AND traffic lights must carry an emissive
    sub-material on the bulb / lens so they can light up at
    night.
  - Output: `carla-web/public/assets/carla/maps/{TownNN}/street-furniture/`.

### 3.6 Materials catalogue (cross-cutting)
  - For materials that are referenced by multiple meshes (road
    asphalt, building façade variants), extract once into a
    shared material library to avoid texture duplication.
  - Output: `carla-web/public/assets/carla/materials/`.
  - Documented mapping from UE5 material name → glTF material in
    a manifest file.

### 3.7 Sky / IBL
  - Capture the UE5 SkyLight cubemap per typical weather + TOD
    pair (clear/midday, clear/golden, overcast/midday,
    rain/midday, fog/midday, clear/night).
  - Export as 8-bit-per-channel KTX2 or HDR EXR cubemaps.
  - Output: `carla-web/public/assets/carla/sky/`.
  - The Three.js `Environment` consumes these; `WeatherLighting`
    selects the right cube based on current weather/TOD.

---

## 4. Implementation paths

Pick ONE primary path. Document the choice. The pipeline is a
build-time tool; speed of execution matters less than
reproducibility.

### 4.1 UE5 editor commandlet (RECOMMENDED)
  - Write a custom commandlet in C++ inside the CARLA project.
    Iterates `UStaticMesh` / `USkeletalMesh` assets matching
    filters, exports each via UE5's built-in `glTFExporter`
    (Unreal 5 ships `GLTFExporter` plugin).
  - Pros: single tool, deterministic, version-controlled with
    the project.
  - Cons: requires a UE recompile.

### 4.2 Datasmith export
  - Use the Datasmith Exporter to dump the entire scene as
    .udatasmith, then convert to glTF via Datasmith Pipeline.
  - Pros: no commandlet code.
  - Cons: extra hop, less control over per-asset output paths.

### 4.3 FBX intermediate + gltfpack
  - Right-click export each asset to FBX from the editor (or
    automate via Python editor scripting), then convert FBX →
    glTF with `FBX2glTF` + optimize with `gltfpack`.
  - Pros: works without C++.
  - Cons: two-stage, lossy on advanced material features (UE
    material graph collapses to FBX standard material).

### 4.4 Asset registry + RawData pull
  - Headless Python in editor: enumerate the asset registry,
    cast each asset to a known type, call its export method.
  - Pros: scriptable, no commandlet C++.
  - Cons: per-asset-type code paths.

### 4.5 Required for ALL paths
  - Texture compression: KTX2 with Basis Universal (UASTC for
    normal/roughness, ETC1S for albedo). Use `toktx` or
    `gltfpack -c`.
  - Mesh optimization: `gltfpack` with `-cc` (mesh compression)
    + `-si 0.5` (simplification for LOD1) + `-tc` (texture
    compression).
  - Output validation: every emitted GLB must pass
    `gltf-validator` with zero errors.

---

## 5. Build integration

  - Pipeline runs as `tools/asset_extraction/run.sh` or a
    Python entrypoint. Idempotent: re-running with no UE asset
    changes produces identical bytes.
  - Outputs land under `carla-web/public/assets/carla/...` where
    Vite serves them statically.
  - Manifest files (`*.ts` modules) are regenerated by the
    pipeline; do not hand-edit. They go into git so the front-end
    builds without first running extraction.
  - GLB binaries also go into git (or git-LFS — decide based on
    total size; if > 100 MB use LFS).
  - CI: a smoke test job extracts ONE asset and validates the
    pipeline still runs; full extraction is a manual op for
    binary updates.

---

## 6. Material translation rules

UE5 material graphs do not translate 1:1 to glTF. Required
mappings:

  - **Base Color** → glTF `baseColorTexture` + factor.
  - **Normal** → glTF `normalTexture`. Watch handedness;
    UE5 is +Y-up Y-forward, glTF is +Y-up -Z-forward.
    Test on a known mesh.
  - **Roughness** + **Metallic** → glTF `metallicRoughnessTexture`
    (G = roughness, B = metallic per spec). Pack at extraction.
  - **AO** → glTF `occlusionTexture` (R channel).
  - **Emissive** → glTF `emissiveTexture` + factor. Critical
    for street lights / signs at night.
  - **Specular workflow** materials → convert to metallic
    workflow at extraction (or use the
    `KHR_materials_specular` glTF extension).
  - **Custom shader networks** (e.g. CARLA road material with
    procedural noise, water, snow) → cannot be expressed in
    glTF directly. Two options:
      (a) Bake to textures at a representative state and ship
          static. Document the loss of dynamic response.
      (b) Re-author as a custom Three.js shader on the client,
          referencing the UE5 shader source as the spec.
          See §7 of `rendering-overhaul-no-cosmetic-escape.md`.
    Prefer (b) for any material the user will see at street level.

---

## 7. Acceptance criteria

  [ ] Every CARLA vehicle blueprint id has a GLB; the manifest
      maps id → path; loading that GLB in the browser shows the
      correct vehicle silhouette (visual confirmation against
      UE5 reference).
  [ ] Every CARLA walker blueprint id has a GLB; capsule fallback
      code is deleted (not commented out, deleted).
  [ ] At least one map (Town01 or Town10) has full building +
      vegetation + street-furniture extraction; procedural
      stacked-box code path is deleted for that map.
  [ ] Sky cubemaps for the 6 weather/TOD pairs are extracted and
      consumed by `WeatherLighting`.
  [ ] `tools/asset_extraction/run.sh` is idempotent and runs to
      completion under `-graphicsadapter=2` on a clean checkout.
  [ ] All emitted GLBs pass `gltf-validator` with zero errors.
  [ ] Browser loads each GLB without console errors; no 404s on
      texture requests; no missing-material magenta surfaces.
  [ ] Total static asset payload documented (MB per map). If
      > 50 MB per map, plan LOD / streaming.

---

## 8. Forbidden excuses (extension of the rendering-overhaul ban list)

  - "We can't extract this asset" — verify the .uasset path
    first. It is on disk. If extraction tooling fails on a
    specific asset type, fix the tooling.
  - "UE material graph X has no glTF equivalent" — see §6
    option (b). Read the UE shader source (it is local) and
    re-author. Banned to skip and substitute a flat color.
  - "Skeletal animation is too complex" — basic walk+idle is
    enough for first parity pass. Procedural blending and IK
    can come later. Capsule with no animation is not enough.
  - "Building extraction would take too many GLBs" — pack per
    map. Or stream. Both are normal solutions. "Too many
    files" is not an architectural blocker.
  - "GPU 2 is busy, I'll use GPU 0" — no. Wait or coordinate.
    See §2.4.

---

## 9. Coordination

  - **Rendering agent**: consumes the outputs of this pipeline.
    Coordinate the manifest schema and the asset directory
    layout up front so the rendering agent's loaders match
    what the pipeline emits.
  - **Bridge agent (A)**: not affected directly — assets are
    static, served by the frontend's static file route.
  - **UI/UX agent**: not affected; this is a pure 3D-asset
    workstream.
  - **Color fidelity agent (C)**: depth/segmentation streams
    are independent. Texture color profile decisions in §6
    (sRGB vs linear for albedo) should be coordinated with
    Agent C's gamma audit findings.

---

## 10. Reporting

Per-iteration report includes:
  1. What asset categories were extracted this iteration
     (counts per category).
  2. Disk size delta of `carla-web/public/assets/carla/`.
  3. Which placeholder code paths were deleted (file:line list,
     not "kept as fallback").
  4. `nvidia-smi` snapshot during extraction proving the UE
     process ran on GPU index 2 (paste the relevant lines).
  5. Sample GLB visual confirmation: load one new asset in the
     browser and screenshot it, vs. the UE reference of the
     same asset.

Banned report content: "asset extraction blocked", "pipeline
needs more research", "asset format too complex". These are
forbidden per `feedback_no_unreproducible` and §8 above.
