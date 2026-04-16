# iter-08-knee-bend report

**Status: ✅ PASS** — Each leg split into thigh + shin with knee
pivot nested inside hip. Knee bends during forward half of swing.
Thirty-fourth ✅ of session.

## §7.2 Feature delta
  - New `leftKneeRef` / `rightKneeRef` refs on inner knee-pivot groups
  - Each leg JSX restructured: thigh (capsule 0.22 length) at y=-0.15
    inside hip group; knee group at y=-0.28 (knee joint); shin
    (capsule 0.22 length) at y=-0.15 inside knee group
  - useFrame: `kneeBend = max(0, sin(phase)) * 0.8` for left; same
    with +π offset for right
  - Idle resets knee rotations to 0

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| retry | 16.71 | 0.3062 | 21.86 |

Consistent with scene-drift steady state (matches iter-14-revisit-
runtime-incremental's 16.71 / 0.3062 / 21.86). No walker in frame
so knee-bend visual delta isn't capturable in this measurement.

## §7.5 Effort breakdown
~35 min (structure + useFrame + hung-harness self-recovery + retry).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - §4.1 self-recovery: killed stale chromium after 15-min hang;
    retry succeeded.
  - 0.8 rad (~46°) knee-bend peak — realistic stride lift for
    ground clearance.

## §7.9 Next iteration
Long-iteration or UE-blocked only remain.
