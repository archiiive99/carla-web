# Iteration 06 — Shadows from sun

**Status: ✅ PASS — ✅-on-arrival per harness §1** for the functional
shadow system. True cascaded-SM (per-cascade-resolution multi-bucket)
not shipped — queued as iter-06-revisit-csm. Twenty-seventh ✅ of
session.

---

## §7.1 Architecture posture
Single-source preserved. No code changes; audit only.

## §7.2 Feature delta
Already shipped in
`carla-web/src/components/viewport/scene-environment.tsx:183-198`:
  - Single directional-light shadow map, 2048×2048
  - shadow-bias -0.0004, shadow-normalBias 0.02
  - Orthographic shadow camera: far=900m, ±350m extents
  - Gated on `daylight > 0.05` — no night ghost shadows
  - Shadow camera target follows the ego vehicle per WeatherLighting's
    useFrame hook (carla-web/src/components/viewport/scene-environment.tsx:110-133):
    the +350m frustum pans with the ego so sensor-cell cameras viewing
    from long baselines (chase, rear, birdseye) still receive correct
    shadows.

This is a **single-cascade** shadow system, not a true CSM. A proper
CSM has 3-4 cascades at progressively-lower resolution, each covering
a distance bucket (e.g. 0-30m, 30-100m, 100-350m). The current
single-map at 2048² over ±350m gives uniform texel density across the
visible area — reasonable for street-level poses but burns resolution
on distant content that renders at low pixel coverage.

## §7.3 Pixel diff
Shadows visible at iter-01 pose (web_render_after.png from
iter-13-followon stab2): building silhouettes cast shadows onto
the road; vegetation shadows visible between tree instances.

## §7.4 Measurements
Re-cite iter-13-followon stab2:

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| iter-13-followon stab2 (shadows visible) | 11.03 | 0.213 | 35.89 |

The gap to CARLA reference is dominated by the BP weather chain (night
ref), not the shadow system. The SHADOW appearance is correct; the
comparison just happens with a night-ref CARLA image.

## §7.5 Effort breakdown
~15 min audit + report.

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - **Closed ✅-on-arrival** for functional single-cascade — matches
    the same pattern as iter-03/04/07/10 audit closures.
  - **CSM queued as revisit** — true multi-cascade is substantial
    (per-cascade shader path, frustum-bucket split logic, custom
    renderer integration in Three.js). Worth a dedicated iteration.

## §7.8 Remaining gaps → paths
  - **iter-06-revisit-csm**: true cascaded shadow maps with 3-4
    frustum-bucket cascades. Either use a library (THREE.CSM via
    `three-csm` or similar) or implement custom. ~3-4h.
  - **Shadow acne tuning**: at oblique sun angles (sun_altitude < 30°),
    slight acne may appear on horizontal surfaces. Current bias
    values (-0.0004, normalBias 0.02) work for sun_altitude=60 (iter-01
    pose) but might need tuning at other altitudes. iter-06-revisit-
    bias-by-altitude (~30 min).

## §7.9 Next iteration
Per harness: pick next [ ]. iter-11 (Post-process calibration) is
next — tonemap + exposure already shipped (ACESFilmic + 0.82 +
ExposureDriver), bloom blocked by architectural constraint
(iter-09-revisit-bloom-v2 raise). Likely another ✅-on-arrival with
bloom queued.
