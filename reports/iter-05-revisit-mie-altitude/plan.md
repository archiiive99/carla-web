# iter-05-revisit-mie-altitude plan

Drei `<Sky>` (Preetham) accepts `mieCoefficient` (default 0.005) and
`mieDirectionalG` (default 0.8). Higher mieCoefficient = more
aerosol scattering = wider warm halo around the sun disc. Matches
the UE5 "warm aerosol ring at low sun" behavior that rayleigh alone
doesn't produce.

Ramp `mieCoefficient` from 0.005 at sun_alt=60 to 0.02 at sun_alt=0
(linear on altFactor), `mieDirectionalG` unchanged. Passed to both
the scene `<Sky>` and the IBL `<Environment>` `<Sky>`.

No-op at `street_clear_midday` by construction.

Out of scope: multi-scattering, tunable g.

Acceptance: tsc clean; midday byte-identical.
