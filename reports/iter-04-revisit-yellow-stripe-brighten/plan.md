# iter-04-revisit-yellow-stripe-brighten plan

Centerline yellow paint `vec3(0.94, 0.74, 0.18)` wasn't bumped when
the white stripe was brightened in iter-04-revisit-stripe-brightness.
Bump to `vec3(0.98, 0.78, 0.22)` — same warm yellow relative, ~5%
overall brighter. Keeps parity between white and yellow stripe
brightness scales.

Out of scope: hue retune; paint-type-specific wear.

Acceptance: tsc clean. Under §4.3 1 dB swap threshold.
