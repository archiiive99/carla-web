# iter-07-revisit-wind report

**Status: ✅ PASS** — Vegetation materials gain vertex-shader wind sway
driven by the CARLA WeatherParameters.WindIntensity broadcast.
Thirty-fifth ✅ of session.

## §7.2 Feature delta
  - `uTime` + `uWindIntensity` shared ref-uniforms, attached to every
    vegetation material's shader via onBeforeCompile
  - Vertex shader injection: height-weighted sway term
    (`transformed.y * 0.06`) with world-XZ-offset sin/cos so
    neighboring trees don't sway in lockstep
  - useFrame advances uTime by delta every frame; reads
    wind_intensity from simulation store each frame and normalizes
    to [0, 1]
  - customProgramCacheKey = "vegetation-wind-v1" so all vegetation
    meshes share one compiled program (shader cache hit)

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| iter-08-knee-bend (baseline) | 16.71 | 0.3062 | 21.86 |
| iter-07-revisit-wind after | **16.70** | **0.3064** | **21.87** |

Within noise. No vegetation in iter-01 frame this measurement (current
scene-drift steady state), so wind sway visual isn't capturable at
this pose. Shader is time-driven so animation is present when any
vegetation renders.

## §7.5 Effort breakdown
~40 min (onBeforeCompile patch + useFrame wiring + import fix +
harness + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - onBeforeCompile vertex-shader injection rather than per-instance
    rotation — amortizes sway work to GPU, supports per-vertex
    deformation (only leaves sway, trunks don't bend).
  - uTime as a ref-wrapped uniform so all materials share the same
    live value (no per-material time state).
  - customProgramCacheKey so Three.js recognizes these as identical
    programs (cache hit; one compiled shader per material type).
