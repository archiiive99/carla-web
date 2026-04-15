# iter-14-revisit-buildings report

**Status: ✅ PASS** — Buildings layer opted into iter-14 LOD via a single
`objects` filter at the entry useMemo. Buildings render
one-component-per-mesh (not InstancedMesh), so the cull avoids both
GPU draw cost AND React reconciliation cost for far buildings (their
Suspense + GltfBuilding boundaries don't even mount). Numbers
byte-identical to baseline. Fifteenth ✅ of session.

---

## §7.1 Architecture posture
Single-source preserved. One-line filter inserted in `Buildings.tsx`.

## §7.2 Feature delta
**`Buildings.tsx`**: input `objects` filtered by 300m of iter-01 pose
before split into `gltfBuildings` / `proceduralBuildings`. Same
constants as the other LOD opt-ins.

## §7.3 Pixel diff
None — baseline preserved.

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE | FPS | Note |
|---|---|---|---|---|---|
| iter-13-followon stab2 (pre-LOD) | 11.03 | 0.2127 | 35.89 | (n/a) | baseline |
| iter-14-revisit-perf-measurement | 11.03 | 0.2128 | 35.89 | **0.5** | post other LOD |
| iter-14-revisit-buildings (this) | **11.03** | **0.2127** | **35.89** | **0.5** | + Buildings LOD |

FPS unchanged — SwiftShader is shader-compile bound, not draw-call
bound; LOD draw-count reductions don't move FPS in this setup. Real
hardware-GL would show LOD wins, but harness is constrained to
SwiftShader for headless determinism.

## §7.5 Effort breakdown
~15 min (audit Buildings.tsx, single-line filter, harness, report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - **Filter at entry useMemo** — both the gltf and procedural paths
    consume the filtered list, so a single insertion handles both.
  - **Same 300m / iter-01 anchor** — consistent with all other LOD
    opt-ins this session.

## §7.8 Remaining gaps → paths
With Buildings opted in, the LOD work is structurally complete for
this session (8 GltfInstanced sites + Vegetation + Buildings = all
heavy scene categories now opt into build-time distance culling at
the iter-01 reference point).

Remaining LOD work in the queue:
  - iter-14-revisit-runtime-lod — per-frame camera-tracked cull
    (~1.5h) — would replace the static reference point with the live
    camera position
  - iter-14-revisit-buildings-extras — verify procedural buildings'
    box-stack count drops correspondingly (the procedural path may
    build smaller InstancedMesh now too)

## §7.9 Next iteration / Session end recommendation
Per session-raise §6.5: 15 ✅ + 5 ⚠️ rows in this session, all
tractable web-only work consumed. Remaining queue is dominated by:
  - **UE-editor-blocked**: iter-02 façade extraction, iter-07 vegetation
    extraction, iter-08 walker extraction, iter-15 IBL cubemap, iter-09-
    revisit-extracted-positions, iter-engine-weather-bp-revisit,
    iter-03-revisit-coverage, iter-12-revisit-parity (depends on BP
    fix), iter-05-revisit-pathC.
  - **Sizeable web-only**: iter-09-revisit-bloom-v2 (~1.5h),
    iter-05-revisit-pathB Hosek-Wilkie (~4-6h), iter-14-revisit-runtime-
    lod (~1.5h), iter-10-revisit-bulb-positions (GLB authoring).

Recommended: stop the loop here and surface the cumulative session
dashboard. Future sessions should begin with either a UE editor
session (unblocks the whole asset-extraction class) or pick one of
the long web-only iterations. SESSION-RAISE.md will be updated.
