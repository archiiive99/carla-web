# iter-11-revisit-exposure-precip plan

ExposureDriver target: `base + cloudiness * 0.0015`. Adds nothing
for precipitation. Heavy rain scenes darken noticeably (direct sun
attenuated, plus wet surfaces reflect less diffuse). ExposureDriver
should lift the exposure target similarly.

Add `+ precip * 0.0010` where `precip = clamp(precipitation, 0, 100)`.
At precipitation=100 lifts exposure by +0.10 (smaller than
cloudiness's +0.15 since wet attenuation is already handled in
directIntensity by iter-06-revisit-sun-precip).

Out of scope: luminance feedback, v2 auto-exposure.

Acceptance: tsc clean; midday byte-identical (precipitation=0).
