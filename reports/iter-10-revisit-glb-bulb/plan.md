# iter-10-revisit-glb-bulb plan

**Phase tag:** A (opened 2026-04-15T09:25:49Z)
**Time budget:** 1 h hard

## Target
Recolor the GLTF traffic-light's authored bulb mesh by state, replacing
the indicator-sphere workaround above the model with proper bulb
illumination on the model itself.

## GLB structure (Phase B finding)
`TrafficLight_Horizontal.glb`:
  - 1 node, 1 mesh `SM_TrafficLights_Horizontal_Module_01` with 2
    primitives.
  - 2 materials:
      - `M_TrafficLight_Module_01` — the housing/structure
      - `WorldGridMaterial` — UE5 editor default left in slot when
        bulb material wasn't preserved on export. When Three.js loads
        this it becomes a checker-pattern. THIS is the bulb primitive.

## Path
In `GltfTrafficLight`, after the scene clone:
  1. `traverse((child) => { if Mesh and material.name === 'WorldGridMaterial': replace material with state-driven MeshStandardMaterial(emissive=bulbColor, intensity=1.5) })`.
  2. Move the existing indicator sphere down OR remove it (the bulb
     itself now glows, indicator becomes redundant). Keep the box
     fallback for GLTF-load-failure case.

## Files in scope
  - `carla-web/src/components/viewport/actor-rendering/TrafficLightMesh.tsx`

## Out of scope
  - Other GLB variants (Crosswalk, Pedestrian, etc.) — same mesh-name
    pattern likely but verify in iter-10-revisit-glb-bulb-extras if
    needed.
  - Per-bulb position (3 separate Red/Yellow/Green positions on the
    bulb housing) — current GLB has them as one primitive, so all
    three "bulbs" light up the same color regardless of state. A
    proper bulb-by-bulb implementation needs new GLB authoring.

## Phase E
Two harness runs (--label glb_bulb_dry, --label glb_bulb_after) at
iter-01 pose where a green TL is visible in the road ROI. Numbers
should be similar to iter-13-followon stab2 (the change is small —
bulb color was already on the indicator sphere, now also on the
model bulb primitive).
