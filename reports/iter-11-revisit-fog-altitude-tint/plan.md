# iter-11-revisit-fog-altitude-tint plan

Fog color is hard-coded to HSL(210, 4%, L) — cool neutral gray that
reads wrong at dawn/dusk where UE5's SkyAtmosphere tints the volume
warm. Ramp hue + saturation by sun-altitude: at `sun_alt=60` stay
HSL(210, 4%, L) (current); at `sun_alt=0` shift to HSL(30, 18%, L)
(warm orange). Linear interp on `altFactor = clamp(sun_alt, 0, 60) / 60`.

No-op at the primary `street_clear_midday` pose (sun_alt=60). Out of
scope: volumetric fog, height-ramped density.

Acceptance: tsc clean; harness byte-identical at street_clear_midday.
