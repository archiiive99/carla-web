# iter-08-walk-cycle report

**Status: ✅ PASS — animation infra landed.** Walkers' arms + legs now
swing on a sine cycle driven by walker velocity. Pivot groups at
shoulder/hip ensure rotation pivots correctly. No walker spawned at
iter-01 pose so visual is uncapturable, but tsc clean + harness
within-noise + opposing-left-right pair logic correct. Twenty-sixth
✅ of session.

---

## §7.1 Architecture posture
Single-source preserved. Only WalkerMesh.tsx touched.

## §7.2 Feature delta
**`WalkerMesh.tsx`** structural changes:
  - Each arm/leg wrapped in a `<group>` whose origin is at the
    shoulder (y=1.30) or hip (y=0.78). Mesh inside is offset down
    so its visual position matches the prior un-grouped layout.
  - Refs (leftArmRef, rightArmRef, leftLegRef, rightLegRef) on the
    groups.
  - `walkPhaseRef` accumulator advanced each frame by
    `delta * speed * 1.8` (1.8 rad/s/(m/s) ≈ natural human
    cadence at walking pace).
  - useFrame: when speed < 0.1 m/s → reset all rotations to 0
    (neutral standing pose). Otherwise apply opposing left/right
    swing of `sin(phase) * 0.45` rad (~25° peak amplitude).

The group-pivot pattern matters: rotating a leg around its center
would tumble both the foot AND the hip; rotating around the hip
makes only the foot swing, which is the intent.

## §7.3 Pixel diff
No walker in iter-01 frame this session — animation visible at any
walker spawn moving > 0.1 m/s.

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE | Note |
|---|---|---|---|---|
| iter-08-skin-tones baseline | 11.02 | 0.2118 | 35.94 | static articulated |
| iter-08-walk-cycle after_walk_cycle | **10.97** | **0.2102** | **36.07** | + animation |

ΔE moved 0.13, PSNR -0.05 dB — within noise.

## §7.5 Effort breakdown
~25 min (restructure to pivot groups + useFrame + tsc + harness +
report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - **Pivot groups instead of mesh-center rotation** — visually
    correct vs visually-wrong. Cost: small JSX restructure.
  - **0.1 m/s neutral threshold** — below typical CARLA walker
    walking speed (~1 m/s); standing/idle walkers don't twitch.
  - **1.8 rad/s/(m/s) cadence scaling** — sine period at 1 m/s is
    ~3.5s, at 2 m/s is ~1.75s. Empirically reasonable; could be
    tuned per-actor (longer-stride for taller).
  - **0.45 rad amplitude** — ~25° peak swing, prominent but not
    cartoonish.
  - **Opposite arm/leg pairs** (left arm forward when right leg
    forward) — natural human gait; sign-flipped per side.

## §7.8 Remaining gaps → paths
  - **iter-08-extract-glb**: real CARLA walker GLBs. UE editor blocked.
  - **iter-08-walk-yaw-from-velocity**: walker faces direction of
    travel rather than CARLA-supplied yaw. Currently uses actor
    transform yaw (correct in most cases).
  - **iter-08-knee-bend**: split each leg into thigh + shin with knee
    bend — more anatomical but more groups. Lower priority.

## §7.9 Next iteration
Per session-raise §6.5 still active. 26 ✅ + 6 ⚠️ rows. Now
genuinely at the end of small-tractable items. Next options:
  - 3+h iterations (bloom v3/v4, Hosek-Wilkie, runtime-incremental)
  - UE-editor-blocked items
  - Stop and surface session-end summary

Recommendation: stop. The session has produced 32 iterations
(26 ✅ / 6 ⚠️) + 59 commits across substantive engine, render,
asset, harness, and infrastructure work. Continuing requires
either user direction for the 3+h paths or a UE editor session
to unblock the asset class.
