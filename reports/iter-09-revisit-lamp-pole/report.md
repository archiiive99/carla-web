# iter-09-revisit-lamp-pole report

**Status: ✅ PASS** — four always-visible lamp poles (ground → y=6)
replace the previous "floating lamp-head" look. Cylinder radius
0.06 (top) / 0.08 (bottom), height 6 m, dark metal material.
Pole is no-op-gated on `isNight`; emissive/halo/spotlight still
only render at night. Fiftieth ✅ of session.

## §7.2 Feature delta
`NightStreetLights.tsx`: removed the `if (!isNight) return null;`
early-exit and wrapped the night-only content (target + spotlight
+ emissive sphere + halo) in `{isNight && (<>...</>)}`. Added a
new `<mesh>` with `<cylinderGeometry args={[0.06, 0.08, ly, 10]}/>`
at `[lx, ly/2, lz]` and `meshStandardMaterial color="#2a2a30"
roughness={0.7} metalness={0.4}` at the top of the group. Cast +
receive shadow so the pole picks up the sun's shadow cast at day.

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| scene-drift (16.xx band) | 16.70 | 0.3063 | 21.87 |
| after_edit (street_clear_midday) | **16.71** | **0.3063** | **21.87** |

Byte-identical within noise. The four pole locations are at
CARLA coords (110,50), (110,60), (130,50), (130,60) — ~8-25 m in
front of the iter-01 camera at (118.9, 55.8) facing yaw=180°. The
poles project to the upper half of the image (poles rise above
road surface) — outside the road-ROI rectangle `[(0.28,0.75),
(0.72,0.95)]`.

## §7.5 Effort breakdown
~20 min (investigation + restructure JSX + tsc + background
harness + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - Pole cylinder radii chosen as slight taper (0.06 top, 0.08
    bottom) — matches the subtle taper most authored streetlamp
    poles have without needing a more expensive lathe geometry.
  - Kept the `NightStreetLights` component name even though poles
    now render at day too. Renaming would cascade through imports;
    pole + night-only rig stay topologically co-located regardless.
  - Shadow-casting on the pole — tiny pole cross-section barely
    changes the shadow map's fill but contributes pole-shadow on
    the road which is a visible parity detail at low sun.
