# iter-08-revisit-body-hash-spread plan

`walkerBodyColor(actorId) = VARIATIONS[abs(actorId) % 6]` maps
sequential CARLA actor IDs to adjacent palette entries — spawn
ten walkers in a row and they cycle 0→1→2→3→4→5→0→1... which
clusters adjacent walkers with adjacent hues (orange next to
orange-red next to light-orange).

Change to `abs(actorId * 13 + 5) % 6` — same pattern the pants
function uses (`*7+3`). Prime multiplier scatters sequential IDs
across the palette so a crowd reads as more color-diverse.

Out of scope: non-deterministic variation, per-actor blend across
hues.

Acceptance: tsc clean; midday byte-identical (walkers outside
road ROI).
