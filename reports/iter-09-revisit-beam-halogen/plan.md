# iter-09-revisit-beam-halogen plan

NightStreetLights currently share the `HEADLIGHT_BEAM = #fff4d0`
color with vehicle headlights. Real streetlamps are typically
high-pressure sodium (warm amber) or warm-white LED — visually
distinct from vehicle low-beam white. Add a new palette constant
`STREETLAMP_BEAM = #ffb063` and use it in NightStreetLights for
emissive sphere, halo, and spotlight color.

Vehicle headlights keep HEADLIGHT_BEAM unchanged.

Out of scope: mercury-vapor blue lamps, gas-lamp yellow variation.

Acceptance: tsc clean; midday byte-identical (night rig unmounted).
