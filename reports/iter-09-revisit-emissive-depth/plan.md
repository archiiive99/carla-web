# iter-09-revisit-emissive-depth plan

Lamp emissive sphere intensity is hard-pinned to 2.5. Same argument
as iter-09-revisit-halo-opacity-altitude: twilight shouldn't have
full-strength glow. Ramp emissiveIntensity with the existing
`nightDepth = clamp(-sun_alt / 15, 0, 1)`: 1.2 at twilight, 3.5 at
deep night.

`emissiveIntensity = 1.2 + nightDepth * 2.3`.

Keeps halo-opacity ramp in proportion. No-op at
`street_clear_midday` (sphere doesn't mount).

Out of scope: per-lamp variation, spotlight-intensity tied to
same depth curve.

Acceptance: tsc clean; midday byte-identical.
