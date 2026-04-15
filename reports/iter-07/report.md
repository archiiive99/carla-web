# Iteration 07 — Vegetation

**Status: ✅ PASS — ✅-on-arrival per harness §1.** 12 vegetation GLB
variants + bucketed InstancedMesh rendering + procedural fallback all
shipped. iter-14-revisit-vegetation-buildings already layered LOD
distance culling. Sixteenth ✅ of session.

---

## §7.1 Architecture posture
No new files. Single-source preserved.

## §7.2 Feature delta
**Already shipped**:
  - `CarlaAssetLoader.tsx:35` `VEGETATION_MODELS` — 12 entries
    (Oak, Pine, Aporosa, Ash, Cypress, Maple, etc.) mapping to
    `Vegetation_*.glb` files under `public/assets/carla/`.
  - `Vegetation.tsx` GltfVegetation component — useGLTF loads all
    variants, deterministic bucketing distributes objects across
    variants, each bucket renders as one InstancedMesh per geometry
    part (trunk / leaves / planter).
  - `ProceduralVegetation` fallback — trunk Cylinder + canopy
    Sphere with TREE_TRUNK palette color when GLB load fails.
  - `iter-14-revisit-vegetation-buildings` already added the 300m
    distance cull on top.

## §7.3 Pixel diff
Trees + foliage visible in iter-13-followon stab2 + iter-14
captures: distinct shapes (cypress vs oak vs maple visible at
different mesh silhouettes).

## §7.4 Measurements
Re-cite iter-14-revisit-vegetation-buildings:

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| iter-14-revisit-vegetation-buildings | 11.03 | 0.2127 | 35.88 |

## §7.5 Effort breakdown
~10 min audit + report.

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
Closed ✅-on-arrival. Same pattern as iter-03/iter-04/iter-10/iter-12.

## §7.8 Remaining gaps → paths
  - **Authored vs CARLA-extracted variants**: GLB authoring quality
    varies (some look like UE5-extracted, some look like third-party
    park assets). Future iter-07-revisit-extracted-only could
    purge non-CARLA-source variants.
  - **Foliage shader wind**: leaves are static. UE5 SkyAtmosphere
    + WindIntensity weather param could drive a shader vertex sway.
    iter-07-revisit-wind ~1h.

## §7.9 Next iteration
Per session-raise §6.5 still active. iter-07 is the last
trivially-auditable row. Remaining are all UE-editor-blocked or
sizeable.

Recommended: stop the loop, surface session-end summary.
