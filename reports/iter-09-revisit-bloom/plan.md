# iter-09-revisit-bloom plan

**Phase tag:** A → D (small iteration)
**Time budget:** 1 h hard

## Target
Add UnrealBloomPass via `@react-three/postprocessing` so the iter-09
night street-light heads + emissive surfaces (TL bulbs, building
windows) glow with halo at night.

## Files in scope
  - `carla-web/src/components/viewport/WorldCanvas.tsx` — wrap scene
    children in `<EffectComposer><Bloom /></EffectComposer>`
  - `carla-web/package.json` — newly added @react-three/postprocessing
    dependency (already npm-installed)

## Phase B — paths
  1. **Drei `<EffectComposer><Bloom />`** — standard pattern,
     drop-in, ~10 LOC.
  2. **Custom three.js EffectComposer + UnrealBloomPass + OutputPass
     manually wired** — more flexible (custom passes), but no need
     here.

Path 1 chosen.

## Bloom params
  - `intensity={0.6}` — moderate glow
  - `luminanceThreshold={0.85}` — only the brightest pixels (lamp
    heads, emissive bulbs, building windows) bloom; not the whole
    scene
  - `luminanceSmoothing={0.2}` — soft cutoff
  - `mipmapBlur={true}` — modern blur path

## Phase E
Re-measure street_clear_night. Numbers will likely drift slightly
(bloom adds halo that bleeds into adjacent pixels, including the
road ROI). Visual: lamp heads have halos.

## Out of scope
  - Per-pose bloom param tuning (one global value this iteration)
  - Bloom in day-mode (acceptable since most day pixels are below
    luminance threshold)
