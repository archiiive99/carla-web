# iter-06-revisit-ground-bounce-altitude plan

Hemisphere ground-bounce color hard-pinned to `#5a4f44` in day mode.
UE5 SkyAtmosphere's ground reflectance warms noticeably at low sun
angles. Interp between `#7a4c30` (horizon) and `#5a4f44` (noon) by
`altFactor = clamp(sun_alt, 0, 60) / 60`. No-op at
`street_clear_midday` by construction.

Out of scope: sun-azimuth dependence, multi-bounce GI.

Acceptance: tsc clean; midday byte-identical.
