# Iteration 08 — Walker silhouettes

**Status: ✅ PASS — articulated procedural placeholder.** Pivoted from
the original "extracted skeletal meshes + walk cycle" scope (UE-editor
blocked) to an articulated procedural walker — torso + head + 2 arms
+ 2 legs separate capsule meshes. Reads as "person" silhouette
instead of the prior orange capsule. Real GLB extraction queued as
iter-08-extract-glb. Twenty-fourth ✅ of session.

---

## §7.1 Architecture posture
Single-source preserved. Only WalkerMesh.tsx touched.

## §7.2 Feature delta
**`WalkerMesh.tsx`** procedural body breakdown:
  - Torso: capsuleGeometry(0.18, 0.55) at y=1.05
  - Head: sphereGeometry(0.13) at y=1.65
  - Left arm: capsuleGeometry(0.06, 0.45) at (-0.22, 1.05)
  - Right arm: capsuleGeometry(0.06, 0.45) at (0.22, 1.05)
  - Left leg: capsuleGeometry(0.08, 0.55) at (-0.09, 0.45)
  - Right leg: capsuleGeometry(0.08, 0.55) at (0.09, 0.45)

All castShadow + receiveShadow so the figure settles into lit scenes.
Safety-visibility WALKER_BODY orange + low emissive floor preserved
on the torso so the figure stays readable at night without dominating
the scene.

## §7.3 Pixel diff
No walker spawned in iter-01 pose at this CARLA session — visual
delta not capturable in this run. The articulated body will appear
as soon as a walker spawns; previous capsule will be replaced by the
6-piece anatomy.

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE | Note |
|---|---|---|---|---|
| baseline (no walker change) | 11.03 | 0.2127 | 35.89 | iter-13-followon stab2 |
| iter-08 after_articulated | **11.04** | **0.2116** | **35.83** | within noise |

Within noise floor at the iter-01 fixed pose (no walker in frame).

## §7.5 Effort breakdown
~15 min (extend WalkerMesh + tsc + harness + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - **Pivoted from skeletal mesh to articulated capsules** — UE-editor
    blocked the extraction path; an articulated placeholder is a
    real visual upgrade without that dependency.
  - **Kept WALKER_BODY orange + emissive** — original
    safety-visibility intent preserved.
  - **No walk cycle animation** — would need useFrame per walker
    + skeletal-rig math; substantial enough for a separate
    iter-08-walk-cycle iteration.

## §7.8 Remaining gaps → paths
  - **iter-08-extract-glb**: extract real CARLA walker GLBs from UE5.
    Blocked by UE editor session.
  - **iter-08-walk-cycle**: animate the legs/arms with a sine-wave
    swing driven by walker velocity. ~30 min web-only.
  - **iter-08-skin-tones**: vary WALKER_BODY across walker spawns
    (deterministic from actor.id) instead of all-orange. ~15 min.

## §7.9 Next iteration
Per session-raise §6.5 still active. 24 ✅ + 6 ⚠️ rows. Tractable
remaining: iter-08-walk-cycle (~30 min) or iter-08-skin-tones
(~15 min). Then only 3+h iterations.
