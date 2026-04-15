# iter-09-revisit-bloom-v2 report

**Status: ⚠️ §6.3 — SelectiveBloom approach also failed; reverted.**
Replaced canvas-root Bloom (v1) with SelectiveBloom on a dedicated
layer (BLOOM_LAYER=1) hoping the layer-mask would let multi-camera
composition continue. SAME catastrophic failure: scene-blackout in
both day and night renders. Root cause is architectural, not bloom-
parameter-related.

Reverted; the bloom-layer.ts module + NightStreetLights'
`mesh.layers.enable(BLOOM_LAYER)` call are kept in code (harmless
when no SelectiveBloom listens) so a future iteration's investigation
starts with the layer-tagging infrastructure already in place.

Eighteenth iteration; this brings ⚠️ count to 6.

---

## §7.1 Architecture posture
After revert: identical to iter-09-revisit-emissive (post-iter-14
infrastructure). Single-source preserved.

## §7.2 Feature delta
**Reverted change** — same scene-blackout as v1. Diagnosis:
EffectComposer (whether wrapping Bloom or SelectiveBloom) intercepts
WorldCanvas's multi-camera composition. The WorldCanvas already does
substantial multi-camera rendering via `<ViewportControllers>` +
`<SceneCompositor>` (multi-viewport sensor previews, picture-in-picture
preview windows, etc.). EffectComposer wraps the WHOLE scene render
into a single texture and then runs the bloom pass on that texture —
which means the multi-camera output is collapsed to a single render
target. Result: only one viewport's output is captured, the rest goes
black.

**Kept in code** for next-investigation continuity:
  - `carla-web/src/components/viewport/bloom-layer.ts` —
    `BLOOM_LAYER = 1` constant module
  - `NightStreetLights.tsx` — lamp head meshes call
    `mesh.layers.enable(BLOOM_LAYER)`. Harmless without an active
    SelectiveBloom listener (just adds objects to an unrendered layer).

## §7.3 Pixel diff
Pre-revert day + night: pure black (1920×1080 all zeros).
Post-revert: matches iter-14-revisit-buildings (40.24 dB at night).

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE | Note |
|---|---|---|---|---|
| iter-14-revisit-buildings (baseline night) | 40.24 | 0.6796 | 0.60 | pre-bloom-v2 |
| iter-09-revisit-bloom-v2 after_selective_bloom | 6.10 | 0.001 | 52.54 | broken |
| iter-09-revisit-bloom-v2 day_check | 8.30 | 0.0003 | 43.10 | broken |
| iter-09-revisit-bloom-v2 after_revert | **40.24** | **0.6796** | **0.60** | clean revert ✅ |

Night PSNR drop 40 → 6 confirms the EffectComposer interception even
with the layer mask — same root cause as v1.

## §7.5 Effort breakdown
~50 min (~10 invest, 15 impl, 15 measure, 10 revert + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - **Reverted on visual evidence** despite metric "improvement"
    direction (numbers got worse this time, but the principle is the
    same as v1 — broken render is broken regardless of metric).
  - **Kept the bloom-layer infra** — `mesh.layers.enable()` is a
    no-op when no SelectiveBloom listens. Future bloom-v3 (if
    pursued) starts with the layer-tagging done.
  - **Did NOT attempt v3 (per-viewport mounting) this iteration** —
    that's a substantial refactor (~3-4h) of the multi-viewport
    renderer. Out of the original 1.5h budget.

## §7.8 Remaining gaps → paths
  - **iter-09-revisit-bloom-v3**: per-viewport SelectiveBloom mounting
    inside each viewport's render context. Substantial — touches the
    multi-viewport architecture. Or:
  - **iter-09-revisit-bloom-v4**: custom render loop without
    EffectComposer — manually pipe scene render through a bloom shader
    pass via THREE.WebGLRenderTarget. More control, more work.
  - **iter-09-revisit-bloom-v5**: simplify the WorldCanvas to single-
    camera (deprecate SceneCompositor multi-viewport; would be an
    architectural revert).

None fit a 30-90 min iteration; all need 3+h commitment.

## §7.9 Next iteration
Per session-raise §6.5: the loop has now exhausted ALL tractable web-
only iterations. Remaining options are:
  - Long single-iterations (iter-05-revisit-pathB Hosek-Wilkie 4-6h,
    iter-14-revisit-runtime-lod 1.5h, bloom-v3/v4 3-4h each)
  - UE-editor-blocked rows (need user direction or interactive UE)

Recommend stopping the loop here. The session has produced 17 ✅ +
6 ⚠️ rows + 41 commits across substantive engine + render + harness +
infrastructure work. Further progress needs either a strategy
direction from the user or a longer time investment than 1m-cron-
style autonomous loops support.
