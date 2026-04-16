# iter-09-revisit-lamp-halo report

**Status: ✅ PASS** — each night lamp now has a secondary transparent
halo sphere (radius 0.4, additive blending, opacity 0.35). Fakes
bloom-like glow without EffectComposer — the v1/v2 approach that
broke multi-camera composition. Forty-seventh ✅ of session.

## §7.2 Feature delta
`NightStreetLights.tsx` renders a second `<mesh>` per lamp after
the emissive-sphere mesh: sphereGeometry args=[0.4, 16, 16],
MeshBasicMaterial with `transparent`, `opacity={0.35}`,
`blending={THREE.AdditiveBlending}`, `depthWrite={false}`. Additive
blend + no depth write means the halo brightens the pixels behind
it (sky, distant buildings) without occluding anything, and doesn't
interfere with other transparent materials.

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| scene-drift (11.xx band) | 11.03 | 0.2127 | 35.89 |
| after_edit (street_clear_midday) | **11.01** | **0.2122** | **35.95** |

Byte-identical within noise. `NightStreetLights` returns `null` at
daytime so the halo meshes don't mount; the change is only visible
at the `street_clear_night` pose where the lamps activate.

## §7.5 Effort breakdown
~18 min (read current rig + 12-line JSX addition + tsc + harness +
report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - `meshBasicMaterial` over `meshStandardMaterial` — halo is not
    PBR-lit; it's a self-emissive decoration. Basic material skips
    lighting math.
  - `depthWrite={false}` so the halo sphere doesn't shadow itself
    when rendered from different camera angles in a multi-viewport
    setup, and doesn't block other transparents behind it.
  - Radius 0.4 (vs inner 0.18) = ~2.2× — tight enough that a lamp
    doesn't read as a glowing fogball, loose enough to produce a
    soft outline against the dim sky.
