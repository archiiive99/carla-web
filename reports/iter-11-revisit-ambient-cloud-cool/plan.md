# iter-11-revisit-ambient-cloud-cool plan

Day `ambientLight` color hard-pinned to `#ffffff`. Overcast scenes
in UE5 desaturate toward a cool gray-blue as the sun is buried and
the sky becomes the dominant light. Interpolate `#ffffff` (clear)
→ `#c8d0da` (overcast) on existing `cloudFactor = cloudiness/100`.

No-op at `street_clear_midday` pose (`cloudiness = 0` → cloudFactor
= 0 → ambient color = `#ffffff`).

Out of scope: hemisphere sky-color desaturation (already partly
handled by rayleigh term).

Acceptance: tsc clean; midday byte-identical.
