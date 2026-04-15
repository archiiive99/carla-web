# iter-14-revisit-runtime-lod plan

**Phase tag:** A → G (compressed)
Time budget: 1.5 h hard

## Target
Replace iter-14's static referencePoint cull with per-frame camera-
tracked cull. Fixes the "walls disappear behind user when camera
moves" interactive-use bug while preserving harness fixed-camera
measurement equivalence.

## Approach
GltfInstanced gains optional `runtimeCull: boolean` +
`runtimeCullSensitivity: number` props. When `runtimeCull=true`:
  - Build InstancedMesh at full objects.length (no build-time filter)
  - useFrame each tick checks camera position vs cached
    lastCullPos; if moved ≥ sensitivity meters, re-evaluate per-
    instance visibility against the live camera position
  - Out-of-range instances zero-scaled (invisible); in-range
    instances get their proper transform

Walls opted in as the demonstrator. Other LOD-opted sites stay on
build-time path (no behavior change).

## Acceptance
  - tsc clean
  - Harness PSNR/SSIM/ΔE byte-identical to baseline at fixed-camera
    iter-01 pose (proves runtime cull evaluates same instances as
    static cull when camera matches the static reference point)
