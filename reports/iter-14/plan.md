# iter-14 plan — LOD pipeline

**Phase tag:** A → G (compressed)
**Time budget:** 1 h hard

## Target row
> iter-14 — LOD pipeline — distant geometry impostors / decimated meshes

## Approach
Build-time distance culling in GltfInstanced — instances beyond
`maxDistance` of `referencePoint` are skipped at scene construction
time. InstancedMesh count drops, GPU draws fewer instances per frame.
Default `Infinity` = no behavior change for callers that don't opt in.

## Files
  - `carla-web/src/components/viewport/city-environment/gltf-instanced.tsx`
  - `carla-web/src/components/viewport/city-environment/Structures.tsx` — Walls applies maxDistance=300m anchored at iter-01 pose

## Out of scope
  - Runtime per-frame visibility tracking (queued as
    iter-14-revisit-runtime-lod)
  - True LOD chain (multiple mesh detail levels swapped at distance)
  - Application to other categories beyond Walls

## Acceptance
  - tsc clean
  - Harness day + night both within noise floor of pre-LOD baseline
    (proves cull doesn't affect visible content at iter-01 pose)
