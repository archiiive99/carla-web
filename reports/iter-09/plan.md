# iter-09 plan — Street lights

**Phase tag:** A (opened 2026-04-15T09:39:18Z)
**Time budget:** 2 h hard

## Target row
> iter-09 — Street lights — emissive + point-light contribution at night

## Why now
With pose coverage (iter-13-revisit-pose-coverage) and reproducible
harness (iter-13-followon), iter-09 can:
  - Add a `street_clear_night` pose to the registry (sun_alt=-30).
  - Implement web-side SpotLight emitters at known street-lamp
    positions near the iter-01 pose intersection, gated on isNight.
  - Measure dry vs wet (without/with night street lights) at the
    night pose.

The CARLA reference at the iter-01 pose has been showing night with
streetlights since session start (BP_CarlaWeather wiring sticks the
sun below horizon); so adding web street lights closes a real visible
gap in the comparison even at midday-default weather setting.

## Success looks like
  - New `NightStreetLights` component in
    `components/viewport/NightStreetLights.tsx` — renders ~4
    `<spotLight>` instances at hardcoded positions near the iter-01
    intersection, active only when `weather.sun_altitude_angle < 0`.
  - New `street_clear_night` pose in compare.py POSES (sun_alt=-30 at
    iter-01 x/y/yaw).
  - Two harness runs:
    1. `--pose street_clear_night` BEFORE adding NightStreetLights to
       WorldScene's mounted tree (baseline)
    2. AFTER mounting (numbers should differ — light cones on road
       change the road-ROI luminance distribution)
  - Visual: web night render shows light cones on road where the
    spotlights are placed.

## Files in scope
  - NEW: `carla-web/src/components/viewport/NightStreetLights.tsx`
  - `carla-web/src/components/viewport/WorldScene.tsx` (mount the new
    component) — note: WorldScene is NOT in `components/{controls,
    shared,layout}/` so this is allowed
  - `carla-web-bridge/tools/render_parity/compare.py` (add
    street_clear_night pose; harness's set_weather will need to set
    sun_alt=-30 for that pose — needs a pose-driven weather block)

## Out of scope
  - Per-lamp accurate placement from XODR/UE5 lamp positions
    (hardcoded coords for this iteration)
  - Glare / lens flare / volumetric scattering (just SpotLight cones)
  - Any UE5 work (no rebuild)

## Phase B paths
  1. **Hardcoded SpotLight positions**: 4 lights placed near the
     iter-01 intersection in carla world coords. Cheap, deterministic,
     enough to measure.
  2. **Detect lamp positions from existing static-mesh actors**: would
     require enumerating actors with type "static.prop.streetlamp" or
     similar; bridge would need new schema field; out of iteration
     scope.

Path 1 chosen.

## Implementation note: night weather in harness
compare.py currently sets a fixed weather block with sun_alt=60. For
the night pose, I need to set sun_alt=-30 instead. Will derive the
weather block from the pose (each pose can have an optional
"weather_overrides" dict that defaults to the iter-01 midday block).
