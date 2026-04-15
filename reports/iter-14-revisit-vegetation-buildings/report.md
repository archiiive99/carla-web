# iter-14-revisit-vegetation-buildings report

**Status: ✅ PASS** — Vegetation opted into the iter-14 LOD pattern via
its bespoke instancing path (it doesn't use the shared GltfInstanced
helper). Buildings out of scope this iteration — they don't use
InstancedMesh per audit. PSNR/SSIM/ΔE within noise of baseline.
Thirteenth ✅ of session.

---

## §7.1 Architecture posture
Single-source preserved. Only Vegetation.tsx touched (one filter
inserted before the bucket-distribution loop).

## §7.2 Feature delta
**`Vegetation.tsx`**: input `objects` array filtered by 300m distance
from iter-01 pose before bucket distribution. Vegetation has its own
per-model-variant bucketing (random model selection per-instance, then
InstancedMesh per bucket) so the cull happens upstream of the bucket
loop rather than via a shared helper.

**Buildings.tsx**: out of scope this iteration. Buildings render
one-mesh-per-building via useGLTF (not InstancedMesh). Adding LOD
would mean conditionally mounting each building React component,
which is a different code change and would deserve its own iteration
(iter-14-revisit-buildings).

## §7.3 Pixel diff
Visual unchanged at iter-01 pose. The vegetation cull anchored at
the camera position only removes trees beyond the visibility horizon.

## §7.4 Measurements

| Run | PSNR (dB) | SSIM | ΔE | Note |
|---|---|---|---|---|
| iter-13-followon stab2 (pre-LOD baseline) | 11.03 | 0.2127 | 35.89 | no LOD |
| iter-14-revisit-other-categories (after_lod_all) | 11.03 | 0.2127 | 35.89 | 7 categories |
| iter-14-revisit-vegetation-buildings (after_veg_lod) | **11.03** | **0.2127** | **35.88** | + Vegetation |

ΔE moved by 0.01 — within noise floor. No regression.

## §7.5 Effort breakdown
~20 min (audit + insert one filter loop + harness + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - **Filter at the upstream point** (right after `variants` validation,
    before bucket assignment) — keeps the existing bucket-distribution
    seeded RNG behavior intact for the kept objects. Order of objects
    is preserved → bucket assignment is deterministic across builds.
  - **Buildings deferred**: they're not InstancedMesh; LOD-ing them
    needs a different pattern (per-mesh React conditional render or
    per-mesh frustum check). Queue iter-14-revisit-buildings for that
    work.
  - **Same 300m radius / iter-01 reference** — consistent with iter-14
    + iter-14-revisit-other-categories.

## §7.8 Remaining gaps → paths
  - **iter-14-revisit-buildings**: Buildings use one-mesh-per-building
    rendering; would need a different LOD pattern. ~30-45 min.
  - **iter-14-revisit-runtime-lod / iter-14-revisit-perf-measurement**:
    same as before.

## §7.9 Next iteration
Per session-raise §6.5 still active. Tractable next:
  - **iter-14-revisit-buildings** — different LOD pattern
  - **iter-14-revisit-perf-measurement** — quantify cumulative LOD wins

Picking iter-14-revisit-perf-measurement on next cron — finally
quantifies whether all the LOD opt-ins actually moved the FPS needle,
closing out the LOD work with measurable evidence rather than just
"no parity regression" assertions.
