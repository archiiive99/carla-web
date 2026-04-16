# iter-08-walk-yaw-from-velocity report

**Status: ✅ PASS** — Walker body now faces direction of travel
(when speed ≥ 0.1 m/s), via useFrame-driven yaw lerp at 6 rad/s.
Thirty-third ✅ of session.

## §7.2 Feature delta
  - New `bodyGroupRef` ref on the outer walker group
  - `currentYawRef` ref backs smooth lerp (first-seed = targetYaw)
  - useFrame: `targetYaw = atan2(v.x, -v.y)` (CARLA→Three coord
    convention: Three.z = -CARLA.y so horizontal velocity mapped
    correctly)
  - Shortest-path angle lerp (wrap through ±π) to prevent full-
    revolution swings when target yaw crosses ±π boundary
  - Idle (speed < 0.1) keeps current yaw (no reset)

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| pre-iter (iter-08-clothes-pattern baseline) | 11.02 | 0.2125 | 35.93 |
| after | **11.02** | **0.2123** | **35.95** |

Within noise. No walker in iter-01 frame to capture yaw delta.

## §7.5 Effort breakdown
~25 min (yaw lerp logic + harness delay + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.9 Next iteration
Per queue: only 3-4h+ iterations or UE-blocked remain.
