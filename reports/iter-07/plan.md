# iter-07 plan — Vegetation (✅-on-arrival)

**Phase tag:** A → G (no-op closure)

## Discovery
`carla-web/src/components/viewport/CarlaAssetLoader.tsx:35`
defines `VEGETATION_MODELS` (12 GLB variants — Oak, Pine,
Aporosa, Ash, Cypress, Maple, etc.). `Vegetation.tsx` loads them
via `useGLTF`, distributes input objects across variants
(seeded RNG bucketing), and renders each bucket as InstancedMesh
groups for perf. Procedural fallback (`ProceduralVegetation`) for
when the GLB-load path fails — trunk + canopy spheres.

iter-14-revisit-vegetation-buildings already added LOD distance
culling on top of this layer.

Per harness §1: ✅-on-arrival.
