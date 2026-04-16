# iter-09-revisit-lamp-halo plan

iter-09-revisit-bloom + bloom-v2 both failed (EffectComposer broke
multi-camera WorldCanvas composition). Queued bloom-v3/v4 need a
full renderer refactor. Cheaper win: fake the halo via geometry —
a second larger transparent `additive-blend` sphere around each
lamp-head emissive sphere. Radius 0.4 (vs 0.18 inner), opacity 0.35,
additive-blend so it brightens the sky behind the lamp without
darkening. Looks bloom-like without touching the render pipeline.

Out of scope: beam-shaft volumetrics, billboard camera-facing sprite
(would need layer-gated rendering to hide from sensor cameras).

Acceptance: tsc clean; byte-identical at midday (NightStreetLights
returns null for isNight=false).
