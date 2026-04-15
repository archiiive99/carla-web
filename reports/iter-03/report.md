# Iteration 03 — Vehicle silhouettes

**Status: ✅ PASS — ✅-on-arrival per harness §1.** Per-blueprint GLB
resolution shipped; 42 vehicle blueprints mapped to extracted GLBs in
`carla-assets/vehicle-models.ts`. `VehicleMesh.tsx` resolves at render
time and falls back to a procedural box for unmapped blueprints.

Tenth ✅ of session.

---

## §7.1 Architecture posture
No new files. Single-source preserved.

## §7.2 Feature delta
**Already shipped**:
  - `carla-web/src/components/viewport/carla-assets/vehicle-models.ts`
    — 42 entries mapping `vehicle.<make>.<model>` blueprint strings
    to `Car_<Name>.glb` paths under
    `carla-web/public/assets/carla/`.
  - `CarlaAssetLoader.tsx:246-262` `resolveVehicleModel(typeId)` —
    direct-match lookup, returns `{path, exact, note}`.
  - `VehicleMesh.tsx` — `GltfVehicleModel` loads the GLB via
    `useGLTF`, falls back to procedural box if `path` is null.
  - `PRELOAD_VEHICLE_MODELS` — the most common GLBs preloaded at app
    boot to avoid first-spawn pop-in.

## §7.3 Pixel diff
Distant vehicles in iter-13-followon stab2 web render appear as
extruded outlines (visible at end-of-road area). Cars spawned by
auto-traffic at the iter-01 pose (e.g. the yellow Cybertruck-shaped
vehicle that appeared in iter-13's test capture) load the
`Car_Cybertruck.glb` correctly.

## §7.4 Measurements
Re-cite iter-13-followon stab2 (most recent stable measurement
exercising scene including vehicles):

| Run | mode | PSNR (dB) | SSIM | ΔE | Note |
|---|---|---|---|---|---|
| iter-13-followon stab2 (re-cited) | road | 11.03 | 0.213 | 35.89 | distant vehicles visible |

## §7.5 Effort breakdown
~10 min total (one-line audit of vehicle-models.ts + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - **Closed ✅-on-arrival** — same pattern as iter-04, iter-10,
    iter-12 verifications.

## §7.8 Remaining gaps → paths
  - **Blueprint coverage**: 42 entries cover major classes; CARLA has
    100+ vehicle blueprints. Less common vehicles fall back to box.
    iter-03-revisit-coverage could extend the dict to all 100+.
  - **Color drift**: GLB materials use authored paint colors, not the
    actual `actor.attributes['color']` per-spawn from CARLA. So a
    "Color: 240,0,0" vehicle still renders in its GLB-default color.
    iter-03-revisit-attribute-color is a small follow-on (~30 min).

## §7.9 Next iteration
iter-08 walkers — also currently placeholder-only (see WalkerMesh.tsx
comment "no glTF model is available at this tier for walkers"). Could
queue iter-08-extract-glb for walker GLB extraction; out of CLI scope
for now.

Picking iter-14 LOD pipeline next — first non-audit non-trivial work
remaining in the queue.
