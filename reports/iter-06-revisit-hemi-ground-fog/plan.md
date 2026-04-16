# iter-06-revisit-hemi-ground-fog plan

Hemisphere ground-color day branch currently interpolates between
`#7a4c30` and `#5a4f44` on altFactor. Under heavy fog the ground
bounce perceptually desaturates toward neutral. Compose a second
lerp on top: take the altitude-computed color and lerp it toward
`#6a6565` (fog neutral warm-gray) on fogFactor.

No-op at fog_density=0.

Out of scope: three-way blend with cloudiness, per-material fog
coupling.

Acceptance: tsc clean; midday byte-identical.
