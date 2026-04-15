# iter-14-revisit-runtime-no-entry-filter report

**Status: ✅ PASS** — entry filter lifted from Buildings; per-building
runtime cull (iter-14-revisit-runtime-bldg-only) now handles all
visibility decisions. Interactive movement past the prior 300m
horizon now correctly mounts + can render the buildings beyond.
Twenty-second ✅ of session.

---

## §7.1 Architecture posture
Single-source preserved. Single-file change in Buildings.tsx — the
entry-filter logic removed from useMemo; everything else unchanged.

## §7.2 Feature delta
**`Buildings.tsx`** entry useMemo: dropped the iter-01-anchored
distance pre-filter. All gltf buildings now mount their React
+ Suspense + GltfBuilding boundary; per-building useFrame
(iter-14-revisit-runtime-bldg-only) handles visibility based on
live camera position.

## §7.3 Pixel diff
Visual unchanged at iter-01 fixed pose.

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE | Note |
|---|---|---|---|---|
| baseline (iter-13-followon stab2) | 11.03 | 0.2127 | 35.89 | no LOD |
| iter-14-revisit-runtime-bldg-only | 11.04 | 0.2129 | 35.87 | runtime+entry-filter |
| **iter-14-revisit-runtime-no-entry-filter** | **11.03** | **0.2127** | **35.89** | **runtime only** |

Byte-identical baseline. Lifting the entry filter doesn't change
visibility at iter-01 because the per-building runtime cull
correctly hides distant ones.

## §7.5 Effort breakdown
~10 min (single-file edit + tsc + harness + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - **Lifted entry filter** — risk of ~130 useGLTF calls didn't
    materialize. useGLTF caches per unique path; the 130 buildings
    map to a small set of unique GLBs (most are duplicates).
  - **Procedural side also un-filtered** — single InstancedMesh,
    cost doesn't scale with React-mounted count.

## §7.8 Remaining gaps → paths
  - **iter-14-revisit-runtime-procedural-bldg** still queued —
    procedural Buildings still on static (now no static filter from
    Buildings entry, but their internal build-procedural-buildings.ts
    didn't have one). Procedural rendering unchanged.

## §7.9 Next iteration
Per session-raise §6.5 still active. 22 ✅ + 6 ⚠️ rows. Tractable
remaining: iter-14-revisit-runtime-procedural-bldg (~45 min) is
last small-medium item.
