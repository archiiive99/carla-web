# iter-09-revisit-lamp-arm plan

iter-09-revisit-lamp-pole added pole cylinders ground→6m. But real
streetlamps have the lamp head offset horizontally on an arm, not
directly above the pole. Currently the pole rises to (lx, 6, lz)
and the head sphere sits at (lx, 6, lz) — directly on top, so the
silhouette reads like a post with a lightbulb, not a streetlamp.

Add a short horizontal cylinder arm from (lx - 0.5, 6, lz) →
(lx, 6, lz), and move the pole top + head + spot to (lx - 0.5, ...).
Keep the pole base at (lx, 0, lz) — pole stands on original ground
footprint, arm reaches outward. Arm length 0.5 m, radius 0.04.

Out of scope: dual-arm poles, arm curvature, mast-arm assembly.

Acceptance: tsc clean; midday byte-identical (lamp cluster above
road ROI).
