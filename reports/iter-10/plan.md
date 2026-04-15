# iter-10 plan — Traffic lights

**Phase tag:** A → G (no-op closure path with documented partial gap)
**Time budget:** 1 h hard

## Target row
> iter-10 — Traffic lights — emissive bulb + correct hue

## Discovery
TrafficLightMesh.tsx ships:
  - Correct hue per state via `trafficLightBulbColor()` switch using
    palette constants TRAFFIC_RED/YELLOW/GREEN/OFF
  - Emissive bulb sphere at position [0, 4.0, 0] above the GLTF
    model with emissive=bulbColor, intensity=1.5
  - Dynamic update: `bulbColor` derives from
    `actor.traffic_light_state` (broadcast from bridge)
  - Box fallback when GLTF fails to load

What's NOT shipped:
  - The **actual GLTF traffic-light bulb mesh** isn't recolored — the
    GLTF's bulbs render in their authored static colors. The
    "indicator sphere above the light" is a workaround that's always
    visible regardless of GLTF state.

Per harness §1 ✅-on-arrival applies to the basic feature (emissive +
correct hue). The GLTF-mesh-recolor refinement queues as
iter-10-revisit-glb-bulb.

## Files in scope
None changed. Reports + dashboard updates only.

## Phase E
Re-uses iter-13-followon stab2 numbers — TrafficLights are visible at
the iter-01 pose (distant traffic light visible in the green dot at
end of road).

## Phase F
✅-on-arrival with documented partial gap.
