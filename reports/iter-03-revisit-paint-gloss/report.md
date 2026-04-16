# iter-03-revisit-paint-gloss report

**Status: ✅ PASS** — vehicle paint PBR tuned toward automotive-glossy:
`roughness 0.45→0.3`, `metalness 0.5→0.35`, `envMapIntensity 0.5→0.7`.
Forty-second ✅ of session.

## §7.2 Feature delta
`VehicleMesh.tsx::GltfVehicleModel` `WorldGridMaterial`-replacement
paint material: lower roughness (sharper highlight), lower metalness
(less chrome, more painted metal), higher envMap intensity (brighter
sky reflection on the hood/sides).

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| scene-drift (common) | 11.03 | 0.2127 | 35.89 |
| after_edit (street_clear_midday) | **11.01** | **0.2113** | **35.98** |

Within noise. ROI is road-only — no vehicle falls inside the
`[(0.28,0.75),(0.72,0.95)]` rectangle at the iter-01 pose. The paint
change is visible on ego/NPC vehicles at chase/birdseye poses but
the pinned metric pose doesn't sample them.

## §7.5 Effort breakdown
~15 min (investigation + 4-line edit + tsc + harness + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - Kept `MeshStandardMaterial` over `MeshPhysicalMaterial`. Clearcoat
    would be the "proper" automotive layer but (a) doubles shader
    cost per vehicle, (b) needs per-vehicle ior/thickness authoring.
    Scoped to a three-param tune.
  - Chose envMap 0.7 not 1.0 — CARLA's PMREM is a gradient-sky
    environment map, not an HDR, so maxing envMap contribution
    over-reads the reflections compared to UE5's reference.
