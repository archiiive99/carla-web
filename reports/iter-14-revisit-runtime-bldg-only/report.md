# iter-14-revisit-runtime-bldg-only report

**Status: ✅ PASS** — per-GltfBuilding useFrame toggles primitive
visibility based on live-camera distance, layered on top of the
existing entry-filter (kept for bounded memory). Two-layer LOD:
entry-filter limits React-mounted set; per-building runtime cull
handles dynamic visibility within that set. Twenty-first ✅ of
session.

---

## §7.1 Architecture posture
Single-source preserved. Only Buildings.tsx GltfBuilding component
extended.

## §7.2 Feature delta
**`Buildings.tsx GltfBuilding`** gains:
  - `primRef` ref to the mounted `<primitive>`
  - `lastCullPos` ref for camera-move throttling
  - useFrame: every camera-move-≥5m, computes distance to building
    pos and toggles `primRef.current.visible` based on
    `RUNTIME_CULL_RADIUS_SQ`

The Buildings entry-filter (added in iter-14-revisit-buildings) is
KEPT. It still caps the React-mounted set at iter-01-anchored 300m,
so memory + initial-mount cost stay bounded for ~130 buildings.

Two-layer LOD:
  - Layer 1 (entry filter): buildings outside iter-01 ±300m never
    mount (no useGLTF, no useFrame, no React reconciliation cost)
  - Layer 2 (per-building runtime): buildings INSIDE the entry filter
    can still be hidden by the live-camera cull when the camera
    moves to a position where they're no longer in the 300m radius
    of the camera

Limitation: a user moving FAR outside the iter-01 anchor (>300m
away) will see no buildings at all because layer 1 never mounted
them. iter-14-revisit-runtime-no-entry-filter could remove layer 1
once memory costs are characterized.

## §7.3 Pixel diff
Visual unchanged at iter-01 fixed pose.

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE | Note |
|---|---|---|---|---|
| baseline (iter-13-followon stab2) | 11.03 | 0.2127 | 35.89 | no LOD |
| iter-14-revisit-buildings (static cull) | 11.03 | 0.2127 | 35.89 | static |
| iter-14-revisit-runtime-bldg-only after_bldg_runtime | **11.04** | **0.2129** | **35.87** | + runtime layer |

Within noise floor (~0.01 movement). At fixed iter-01 camera, all
in-entry-filter buildings are within 300m of camera too, so runtime
visibility = all-visible = same as static. The interactive moving-
camera benefit doesn't show in the harness fixed-pose measurement.

## §7.5 Effort breakdown
~30 min (per-building useFrame implementation + tsc + harness +
report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - **Two-layer LOD** — keeps entry-filter for memory safety, adds
    per-building runtime for camera-move correctness. Lower-risk
    than removing the entry filter entirely.
  - **Per-building useFrame** (~130 closures) — each does one
    distance-and-toggle on camera-move-eval. Cumulative cost at
    settle is ~0 (all stationary). Acceptable.
  - **`primRef.current.visible = bool`** — simpler than zero-scale
    matrix manipulation since each building is a separate primitive
    (not an InstancedMesh entry).

## §7.8 Remaining gaps → paths
  - **iter-14-revisit-runtime-no-entry-filter**: lift the entry
    filter once memory costs are characterized (~30 min if no
    surprises).
  - **Procedural Buildings runtime cull**: the proceduralBuildings
    path renders via buildProceduralBuildingGroup which builds
    InstancedMesh internally. Not yet runtime-culled. Would need
    refs into that internal InstancedMesh + useFrame setMatrixAt
    pattern (~45 min).
  - **iter-14-revisit-runtime-incremental**: amortize per-frame
    rebuild cost for huge instance counts.

## §7.9 Next iteration
Per session-raise §6.5 still active. 21 ✅ + 6 ⚠️ rows. Cumulative
LOD work is now structurally complete:
  - GltfInstanced sites (8): static + runtime ✅
  - Vegetation: static + runtime ✅
  - Buildings (gltf): static + runtime (per-building) ✅
  - Buildings (procedural): static only — queued

Remaining tractable: iter-14-revisit-runtime-no-entry-filter (~30 min)
or procedural-buildings runtime (~45 min). After that,
infrastructure is exhausted; only 3+h iterations remain.
