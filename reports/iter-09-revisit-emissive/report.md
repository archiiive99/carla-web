# iter-09-revisit-emissive report

**Status: ✅ PASS** — emissive lamp-head spheres added at the iter-09
SpotLight positions; visible in night render as bright source-points
above the spotlight cones. PSNR/ΔE stable vs iter-09 baseline (within
noise; spheres at 6m height are above the road ROI). Ninth ✅ of
session.

---

## §7.1 Architecture posture
Single-source preserved. Only `NightStreetLights.tsx` extended.

## §7.2 Feature delta
**`NightStreetLights.tsx`** adds an emissive sphere alongside each
SpotLight at the lamp-head position:
  - sphereGeometry args [0.18, 12, 12]
  - meshStandardMaterial color=HEADLIGHT_BEAM,
    emissive=HEADLIGHT_BEAM, emissiveIntensity=2.5

Pivoted from the original "recolor lamp-head GLB mesh" plan because
investigation showed `STATIC_STREETLIGHT_MODELS` is exported from
CarlaAssetLoader.tsx but never imported anywhere — the static-prop
streetlight GLBs are dormant assets, not in the scene. Without them
in the scene, there's no GLB mesh to recolor. The emissive sphere
plays the lamp-head role visually.

## §7.3 Pixel diff
- `web_render_after_lamp_heads.png`: spotlight cones on road as in
  iter-09, PLUS visible bright dots above the road at lamp height
  (the new emissive spheres).
- iter-09 had cones-without-source; this iteration adds the source.

## §7.4 Measurements

| Run | PSNR (dB) | SSIM | ΔE | Note |
|---|---|---|---|---|
| iter-09 after_streetlights | 40.23 | 0.6771 | 0.59 | cones only, no head |
| iter-09-revisit-emissive after_lamp_heads | **40.25** | **0.6787** | **0.59** | + emissive head spheres |

Delta: PSNR +0.02 dB, SSIM +0.002, ΔE 0.00 — within noise floor.
Heads are above the road ROI so they don't shift the road metric.
Visual delta is real (spheres visible upper-frame); numerical delta
not.

## §7.5 Effort breakdown
  - Investigation (GLB material + scene-usage check): ~10 min
  - Pivot decision (GLB unused → emissive sphere): ~5 min
  - Implementation (~12 LOC sphere addition): ~5 min
  - Harness + report: ~10 min
  - **Total: ~30 min, well under 1 h budget.**

## §7.6 Honesty-badge audit
0 NEW hits — verified.

## §7.7 Autonomy decisions
  - **Pivoted from GLB recolor to emissive sphere** when investigation
    showed the lamp GLBs are dormant. Documented the pivot cleanly;
    didn't try to force a non-applicable pattern.
  - **Sphere radius 0.18m** — small enough to read as "lamp bulb" not
    "balloon"; chose by analogy to the TrafficLight indicator-sphere
    radius (0.3m / 12 segments).
  - **emissiveIntensity 2.5** vs the SpotLight's 30 — head appears
    glowing at distance without overpowering the cone. (SpotLight
    intensity drives photon contribution to the scene; emissive
    drives visible self-glow only.)

## §7.8 Remaining gaps → paths
  - **Real lamp positions**: same gap as iter-09; iter-09-revisit-
    extracted-positions still queued.
  - **Bloom on lamp heads**: emissiveIntensity=2.5 reads as a flat
    bright dot, not a glowing bulb with halo. UnrealBloomPass in the
    EffectComposer would add halo. Queueable as iter-09-revisit-bloom.
  - **Lamp post geometry**: the spheres float without supporting
    posts. A simple cylinder mesh (carla pole) at each lamp position
    would tie them to the ground. Out of scope this iteration.

## §7.9 Next iteration
Per session-raise §6.5 still in effect; 9 ✅ rows (5 substantive +
4 audit/refactor/harness). Tractable next:
  - **iter-14 LOD pipeline** — performance work, web-only, no parity
    target needed
  - **iter-09-revisit-bloom** — UnrealBloomPass setup
  - **iter-09-revisit-extracted-positions** — long iteration

Picking iter-09-revisit-bloom next — small, high visual impact,
finishes the night-look polish.
