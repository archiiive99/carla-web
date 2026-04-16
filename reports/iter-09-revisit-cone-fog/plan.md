# iter-09-revisit-cone-fog plan

Light-cone opacity is `haloOpacity * 0.4` — constant ratio. Real
beam volume is most visible through fog. Multiply by a
`1 + fogFactor * 1.5` amplifier so clear night = 0.4× halo (subtle);
heavy fog = 1.0× halo (cone as prominent as sphere halo).

No-op at `fog_density=0`.

Out of scope: scattering physics, god-ray rendering.

Acceptance: tsc clean; midday byte-identical.
