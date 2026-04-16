# iter-07-revisit-wind plan

Vertex-shader wind sway via onBeforeCompile on vegetation materials.
Uniforms:
  - uTime: frame-incremented
  - uWindIntensity: normalized 0-1 from weather.wind_intensity/100

Sway term: transformed.x/z += sin(time*1.3 + pos×0.08) × height × 0.06 × windIntensity.
Higher local-y vertices sway more (treetops); trunk base stays anchored.
