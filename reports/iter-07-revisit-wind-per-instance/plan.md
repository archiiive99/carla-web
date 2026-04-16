# iter-07-revisit-wind-per-instance plan

iter-07-revisit-wind used vertex-local `position.x/z` to desync sway.
But each instance of a bucket shares the same mesh geometry, so all
instances of "tree model A" sway with the same phase; only different
models desynced. Switch to `instanceMatrix[3].xyz` (world instance
translation) so every planted tree has its own phase.

Bump `customProgramCacheKey` to `vegetation-wind-v2` so old cached
programs don't shadow the patch.

Out of scope: rotation-dependent sway (leaves face wind direction).

Acceptance: tsc clean; byte-identical at midday (wind_intensity=0
zeros the windAmp factor at `street_clear_midday` pose).
