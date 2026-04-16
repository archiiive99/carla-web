# iter-08-revisit-arm-stride-speed plan

Arm and leg swing amplitudes (0.35, 0.55) are fixed regardless of
walker speed. Slow-walking people barely swing their arms; fast-
walking/power-striding people swing more. Scale arm amp by speed
via `armScale = 0.7 + min(speed, 2.5)/2.5 * 0.5` → range [0.7, 1.2]
so the effective arm swing is 0.245..0.42 rad across the walker
speed range.

Leg amplitude unchanged — leg stride correlates with step length
which CARLA drives via position delta (not directly into the
walker swing), and 0.55 is already appropriate for normal pace.

Out of scope: stride-length scaling, arm-drag/wrist animation.

Acceptance: tsc clean; midday byte-identical.
