# Session-final report

**Date:** 2026-04-15
**Cron `73155c1f`:** cancelled by agent at session-end-recommendation.

---

## Totals

**32 iterations (26 ✅ / 6 ⚠️) | 59 commits | ~12 hours.**

## What landed

### Substantive code work (web-side)

  - **iter-13** scene-palette unification: 26 typed string-hex
    constants in `scene-palette.ts`, 11 files rewired from inline
    hex to named imports. (PSNR/SSIM unchanged — refactor only.)
  - **iter-09** night street lights: 4 hardcoded SpotLights at the
    iter-01 intersection, gated `weather.sun_altitude_angle < 0`.
    *PSNR=40.23 (+34% over 30 bar), ΔE=0.59 (-88% under 5 bar).*
  - **iter-09-revisit-emissive**: lamp head emissive spheres so
    spotlight cones have visible sources.
  - **iter-10-revisit-glb-bulb**: GLB traffic-light bulb
    (WorldGridMaterial) → state-driven emissive material. Distant
    TL renders correct state color on the model itself.
  - **iter-03-revisit-attribute-color**: vehicle GLB paint
    (WorldGridMaterial discovery) → state-driven MeshStandardMaterial
    from `actor.vehicle_color` broadcast. Pre-fix every vehicle
    rendered as engine-default checker.
  - **iter-08** + **iter-08-skin-tones** + **iter-08-walk-cycle**:
    walker placeholder upgraded from single capsule to
    6-piece anatomical body with per-actor.id color variation
    and useFrame-driven sine-swing limb animation.
  - **iter-14 + revisits** LOD pipeline: maxDistance + runtimeCull
    opt-in across all major scene categories (8 GltfInstanced
    sites + Vegetation + GltfBuilding + ProceduralBuilding). Two-
    layer LOD (entry filter + per-instance runtime).

### Substantive engine work (UE5 C++)

  - **iter-engine-weather-bp**: `AWeather::ApplyWeather` C++
    fallback drives ASkyBase + ADirectionalLight from
    FWeatherParameters. Verified executes via UE_LOG audit; ⚠️
    closed because UE5's macro day/night state is owned by
    something downstream (BP_GeneralSceneSettings or
    SkyAtmosphereComponent — needs UE editor to inspect).
  - **iter-05** Path-A web sky tuning (Preetham turbidity bump,
    Kelvin sun color, warm hemisphere bounce) — closed ⚠️
    pending the BP weather fix that would let measurement actually
    probe sky parity.

### Harness infrastructure

  - **iter-13-followon**: NPC-clear-before-capture in compare.py.
    Made measurement reproducible (PSNR ΔΔ=0.02 dB across runs).
  - **iter-05-revisit-roi-sky**: `--roi {road|sky}` mode +
    brightness-threshold sky mask.
  - **iter-13-revisit-pose-coverage**: 3 new poses (birdseye,
    chase, intersection_corner) + per-pose weather override
    registry (POSE_WEATHER_OVERRIDES).
  - **iter-09 night pose**: `street_clear_night` + sun_alt=-30.
  - **iter-12** verify wet-surface binding + `--weather-wetness`
    flag.
  - **iter-14-revisit-perf-measurement**: `--measure-fps-ms` flag.

### Verifications + ✅-on-arrival rows

iter-03 vehicles, iter-04 lane markings, iter-07 vegetation, iter-10
traffic-light emissive — all confirmed shipped end-to-end with
measurement evidence cited from prior captures.

## Closed ⚠️ rows (6)

  1. iter-01 §6.3 (PSNR 14.32 vs 28 bar — gap attributed to
     upstream lighting)
  2. iter-05 §6.1 (Preetham tune unmeasured pending BP fix)
  3. iter-engine-weather-bp §4.3 (C++ verifiably runs but UE5's
     night state is owned elsewhere)
  4. iter-13 (refactor success but reference instability →
     fixed in iter-13-followon)
  5. iter-09-revisit-bloom §6.3 (canvas-root Bloom broke render —
     reverted)
  6. iter-09-revisit-bloom-v2 §6.3 (SelectiveBloom layer-mask also
     broke render — root cause is architectural; reverted)

## What's left

### Tractable web-only (1.5h+ each)

  - iter-09-revisit-bloom-v3/v4 (~3-4h each): per-viewport effects
    OR custom render loop without EffectComposer. WorldCanvas's
    multi-camera SceneCompositor is incompatible with
    canvas-root-EffectComposer.
  - iter-05-revisit-pathB Hosek-Wilkie sky shader (~4-6h)
  - iter-05-revisit-pathC HDR cubemap (needs IBL extraction first)
  - iter-14-revisit-runtime-incremental (~1h, low intrinsic value
    at current scene size)

### UE-editor-blocked

  - iter-02 building façades (extracted meshes)
  - iter-15 IBL cubemaps per weather/TOD pair
  - iter-engine-weather-bp-revisit (BP graph inspection)
  - iter-09-revisit-extracted-positions (Town01 lamp coords)
  - iter-08-extract-glb (real walker GLBs)
  - iter-03-revisit-coverage (~60 more vehicle blueprints)

## Recommendation for next session

Pick one:

1. **Open UE5 editor on GPU 2** (interactive — user action). Unblocks
   the entire asset-extraction class + the BP_CarlaWeather chain
   inspection. Highest leverage.
2. **iter-05-revisit-pathB Hosek-Wilkie sky** (~4-6h commitment).
   Standalone shader work, no UE dependency.
3. **iter-09-revisit-bloom-v3** (~3-4h). Refactor multi-viewport
   renderer to allow per-viewport bloom; bloom would substantially
   improve night render polish.

Cron `73155c1f` cancelled. Next session should explicitly choose
direction.
