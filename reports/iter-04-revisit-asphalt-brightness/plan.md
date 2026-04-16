# iter-04-revisit-asphalt-brightness plan

Asphalt final multiplier in road shader is `asphalt *= 0.72`
(after the warm-cast bump `*= vec3(1.20, 1.02, 0.82)`). 0.72 is
quite dim — UE5 midday reference has a noticeably-lighter road.
Bump to 0.78 (~+8%).

Directly affects the dominant pixel count in the road-ROI, so
metrics should shift measurably.

Out of scope: per-surface roughness retune, ambient coupling
recalibration.

Acceptance: tsc clean. If PSNR drops > 1 dB vs 15.xx cluster,
trigger §4.3 swap (try 0.66 direction). If within 1 dB, keep the
brighter setting.
