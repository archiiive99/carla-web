# iter-03-revisit-windshield-tint report

**Status: ✅ PASS** — glass-named GLB materials are now detected
by a case-insensitive regex (`/glass|window|windscreen|windshield/i`)
and replaced with a tinted transparent MeshStandardMaterial.
Fifty-third ✅ of session.

## §7.2 Feature delta
`VehicleMesh.tsx::GltfVehicleModel` traverse loop gains a third
branch between the `WorldGridMaterial` paint-replacement and the
default-preserve:
  - `color: 0x262c38` (dark blue-grey)
  - `roughness: 0.08` (glossy)
  - `metalness: 0.6` (reflective)
  - `envMapIntensity: 0.8` (elevated sky reflection)
  - `transparent: true, opacity: 0.55`

Vehicles without glass-named materials hit the fall-through branch
unchanged.

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| scene-drift (16.xx band) | 16.70 | 0.3063 | 21.87 |
| after_edit (street_clear_midday) | **16.71** | **0.3064** | **21.87** |

Byte-identical within noise. No vehicle samples into the road-ROI
rectangle at iter-01 pose.

## §7.5 Effort breakdown
~15 min (investigation + name-regex branch + tsc + harness +
report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - Kept `MeshStandardMaterial` over `MeshPhysicalMaterial`.
    Physical's `transmission`/`thickness`/`ior` would be the
    proper path for real glass — but the extra pass cost per
    vehicle is unjustifiable until we have proper IBL cubemaps
    (iter-15) for the reflections to resolve against.
  - Regex `glass|window|windscreen|windshield` is intentionally
    broad — CARLA GLBs don't follow a single naming convention
    (e.g. `M_Car_GlassFront`, `Car_Window_Left`, etc.). False
    positives on a mesh named "WindowFrame" would be a cosmetic
    issue but no performance cost.
