# iter-08 plan — Walker silhouettes

**Phase tag:** A → G (compressed)

## Pivot
Original scope: extracted skeletal meshes + walk cycle. Blocked
without UE editor session. Pivot: anatomically-articulated
procedural walker — torso + head + 2 arms + 2 legs as separate
capsule meshes. Real GLB extraction queued as iter-08-extract-glb.

## Files in scope
  - `carla-web/src/components/viewport/actor-rendering/WalkerMesh.tsx`

## Acceptance
  - tsc clean
  - Walker reads as "person" silhouette from a glance (was: orange capsule)
  - No parity regression at iter-01 fixed pose (walkers not present
    in current spawn anyway)
