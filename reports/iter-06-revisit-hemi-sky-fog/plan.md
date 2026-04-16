# iter-06-revisit-hemi-sky-fog plan

Hemisphere light's day sky-color is hard-pinned to `#a5a8ae`. At
high fog density the sky color perceptually desaturates toward the
fog color itself. Interp between `#a5a8ae` (clear) and `#c0c2c7`
(foggy neutral) on existing `fogFactor = fog_density/100`.

No-op at `street_clear_midday` (fog_density=0).

Pattern matches iter-11-revisit-ambient-cloud-cool and
iter-06-revisit-ambient-fog. Continues the weather-coupling cleanup.

Out of scope: ground-bounce fog coupling, IBL fog bake.

Acceptance: tsc clean; midday byte-identical.
