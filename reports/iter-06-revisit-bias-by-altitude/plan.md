# iter-06-revisit-bias-by-altitude plan

Sun-altitude-driven shadow bias: at oblique angles (sun near horizon)
shadow rays are longer → more self-shadowing acne. Bias scales with
altitude:
  bias = -0.0004 - max(0, 60 - clamp(sunAlt, 0, 60)) * 0.00001
  sun_alt=60: -0.0004 (iter-01 baseline)
  sun_alt=10: -0.0009
  sun_alt=0:  -0.001

## Acceptance
At iter-01 pose (sun_alt=60) formula returns baseline — no regression.
