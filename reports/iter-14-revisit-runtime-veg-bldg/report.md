# iter-14-revisit-runtime-veg-bldg report

**Status: ✅ PASS** — Vegetation now uses runtime camera-tracked cull
(refactor of useMemo + new useFrame). Buildings deferred to a future
iteration since the per-React-component pattern needs a different
approach. Twentieth ✅ of session.

---

## §7.1 Architecture posture
Single-source preserved. Only Vegetation.tsx restructured.

## §7.2 Feature delta
**`Vegetation.tsx`** runtime cull:
  - useMemo body refactored: builds buckets at FULL `objects.length`
    (no static pre-filter), stores per-bucket `meshDataRef.current`
    (mesh + transforms) so useFrame can manipulate.
  - useFrame: per-camera-move-≥5m, iterates all bucket meshes, zero-
    scales out-of-range instances and restores in-range. Distance
    compare against camera.position directly (transforms are already
    in three.js coords via computeVegetationPlacement → c2t).
  - Same RUNTIME_CULL_RADIUS=300, RUNTIME_CULL_SENSITIVITY=5 as the
    GltfInstanced opt-ins.

**Buildings** deferred. Buildings render one-React-component-per-mesh
via useGLTF; runtime cull there would need either:
  - useState updated by useFrame (re-renders on each camera move) —
    expensive for many buildings
  - Per-building useFrame inside GltfBuilding manipulating mesh.visible
  - Different architectural pattern — out of this iteration's scope.

Queue iter-14-revisit-runtime-bldg-only for that.

## §7.3 Pixel diff
Visual unchanged at iter-01 fixed pose.

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE | Note |
|---|---|---|---|---|
| baseline (iter-13-followon stab2) | 11.03 | 0.2127 | 35.89 | no LOD |
| iter-14-revisit-vegetation-buildings (static cull) | 11.03 | 0.2127 | 35.88 | static |
| iter-14-revisit-runtime-veg-bldg after_veg_runtime | **11.03** | **0.2126** | **35.90** | runtime, byte-identical-noise |

ΔE moved 0.01-0.02 — within noise. Vegetation runtime cull at fixed
iter-01 camera evaluates same visible set as the static cull did.

## §7.5 Effort breakdown
~30 min (refactor useMemo + new useFrame + tsc + harness + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - **Vegetation done, Buildings deferred** — different architectural
    patterns; doing both in one iteration would risk a bug like the
    coord-system one I caught in iter-14-revisit-runtime-all.
  - **No coord-system bug here**: computeVegetationPlacement returns
    transforms already in three.js coords (it applies c2t internally),
    so distance-to-camera is a clean direct compare.
  - **Same 5m sensitivity** — consistent with all other runtime LOD
    sites for predictable amortization.

## §7.8 Remaining gaps → paths
  - **iter-14-revisit-runtime-bldg-only** (~1h) — Buildings runtime
    cull. Either useState-updated-by-useFrame (acceptable cost if
    debounced to re-render-on-cull-eval-only) or per-GltfBuilding
    useFrame manipulating mesh.visible.
  - **iter-14-revisit-runtime-incremental** — amortize the per-frame
    rebuild cost across multiple frames for very-large instance counts.

## §7.9 Next iteration
Per session-raise §6.5: 20 ✅ + 6 ⚠️ rows. iter-14-revisit-runtime-
bldg-only is the smallest tractable next (~1h). After that, only
3+h iterations remain.
