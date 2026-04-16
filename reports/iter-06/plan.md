# iter-06 plan — Shadows from sun (cascaded SM tuning)

**Phase tag:** A → G (compressed, ✅-on-arrival)

## Discovery
`scene-environment.tsx:190-198` already configures a functional
directional-light shadow system:
  - shadow-mapSize [2048, 2048]
  - shadow-bias -0.0004
  - shadow-normalBias 0.02
  - shadow-camera-{far:900, left/right/top/bottom: ±350}
  - castShadow gated on daylight > 0.05 (avoids night ghost shadows)
  - Shadow camera target follows ego per WeatherLighting useFrame

Not true CSM (single shadow map), but for the iter-01 street-level
pose the existing ±350m ortho range covers visible content. True CSM
would add cascade-bucket splits with per-cascade resolution ramps —
substantial shader/pipeline refactor. Queue as iter-06-revisit-csm.

Per harness §1: close ✅-on-arrival for the functional shadow
implementation; cite evidence.
