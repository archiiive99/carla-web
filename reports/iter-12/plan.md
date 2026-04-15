# iter-12 plan — Wet-surface response (driven by CARLA wetness param)

**Phase tag:** A (opened 2026-04-15T09:14:32Z)
**Time budget:** 1.5 h hard / 6 h watchdog

## Target row
> iter-12 — Wet-surface response — driven by CARLA wetness param

## Why now
With harness reproducible (iter-13-followon) and sky-ROI mode landed
(iter-05-revisit-roi-sky), this is a tractable web-side iteration
that:
  - uses the existing weather data flow (no new bridge schema work);
  - produces a visibly measurable scene change (lower roughness on
    asphalt → mirror-like specular response);
  - doesn't depend on UE5 asset extraction or the broken BP weather
    chain.

## Success looks like
  - `RoadMesh` material's `roughness` is driven from
    `useSimulationStore((s) => s.weather.wetness)`. wetness=0 → current
    dry roughness; wetness=100 → ~0.2 (mirror-wet); linear interpolation
    in between.
  - Optionally tighten `metalness` slightly when wet (wet asphalt has a
    more reflective specular response).
  - Two harness runs at the iter-01 pose:
      run A with wetness=0 (current); run B with wetness=80.
    Web render delta visually shows brighter specular highlights on
    the road in run B. Numeric: run B's PSNR vs reference may be
    LOWER (because wet web doesn't match dry CARLA reference) — that's
    expected and proves the binding works.

## Files in scope
  - `carla-web/src/components/viewport/RoadMesh.tsx` (or wherever the
    road material lives)
  - `carla-web/src/components/viewport/road-materials.ts` (per
    iter-01's commit)
  - `carla-web-bridge/tools/render_parity/compare.py` — only if
    needed to plumb a per-run weather override into the harness call

## Out of scope
  - Any UE5 / engine work
  - Procedural puddle geometry / mesh deformation (out of budget)
  - Full screen-space reflection or planar reflection
  - The kelvinToColor / sky tuning (iter-05 territory)
  - SegmentationView (always out)

## Phase B paths
  1. **Drive `roughness` uniform from weather.wetness in
     RoadMesh component**: update the material props each render via
     useFrame or a state-derived recalc. Simplest, no shader edit.
  2. **Add a custom uniform + shader chunk to RoadMesh**: more flexible
     (could blend albedo darker when wet, add an emissive specular
     boost), but more work.

Path 1 chosen — the road material is already a MeshStandardMaterial;
modulating its `roughness` property is one prop binding.

## Phase E acceptance
  - Run A (wetness=0): web render at iter-01 pose shows current asphalt.
  - Run B (wetness=80): web render shows visibly lower roughness on the
    road (brighter specular response).
  - Metrics from harness with --roi road for both runs. Delta in road
    metrics between A and B proves the binding fires (numbers will
    diverge because the CARLA reference is dry midday-ish at this pose).
  - tsc clean.

## Note on harness limitation
The current `compare.py` always sets the harness weather to
`(cloudiness=10, sun_alt=60, sun_azim=220, wetness=0)`. To compare
wet-vs-dry, I'd need to either:
  - add a `--weather-wetness N` flag to compare.py (simple), OR
  - manually `world.set_weather(wetness=80)` from python before the
    harness run.

Plan: add the flag (light addition). Required so the iteration can
demonstrate the wet binding measurably.
