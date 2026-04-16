# iter-10-revisit-bulb-sun-drive plan

Traffic-light bulb + indicator emissive intensity are hard-pinned
at 1.5. At noon that looks neon (over-bright against a sunlit
housing); at night it's too dim to carry the signal. Ramp by sun
altitude: `intensity = 1.0 + 1.6 × (1 - altFactor)`, `altFactor =
clamp(sun_alt, 0, 60) / 60`. Result: 1.0 at noon, 2.6 at horizon,
stays at 2.6 at negative altitude.

Out of scope: volumetric bulb glow, per-direction bulb occlusion.

Acceptance: tsc clean; harness byte-identical at street_clear_midday
(TLs not in road ROI). Commit + push.
