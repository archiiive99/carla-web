# iter-09-revisit-halo-opacity-altitude plan

Night-lamp halo sphere opacity hard-pinned at 0.35. Real streetlamp
halos are more prominent in deep dark than in late-dusk twilight.
Ramp opacity by how deep into night we are: at `sun_alt = 0`
(horizon, still-visible sky) use 0.2; at `sun_alt ≤ -15` (full
dark) use 0.5.

`nightDepth = clamp(-sun_alt / 15, 0, 1)`; `opacity = 0.2 + nightDepth * 0.3`.

Out of scope: per-lamp attenuation (all four lamps share the halo).

Acceptance: tsc clean; midday byte-identical (halo mesh unmounts
at daytime).
