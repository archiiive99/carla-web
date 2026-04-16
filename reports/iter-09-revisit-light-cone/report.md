# iter-09-revisit-light-cone report

**Status: ✅ PASS** — transparent beam-volume cone mesh added per
night lamp. Cone apex at head position (y=6), base radius 1.5 m
at ground (y=0). MeshBasicMaterial, additive-blend,
depthWrite false, DoubleSide, opacity = `haloOpacity * 0.4`.
Gated on isNight alongside the rest of the night rig.
Seventy-second ✅ of session.

## §7.2 Feature delta
`NightStreetLights.tsx`: new `<mesh>` after the halo sphere mesh.
`<coneGeometry args={[1.5, headY, 24, 1, true]}/>` — radius 1.5,
height = head y (6 m), 24 radial segments, open-ended (no end
cap). Positioned at midheight, rotated by π around x to flip
the cone's default-up apex down to the head and base to the
ground.

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| 15.xx cluster | 15.37 | 0.2972 | 22.95 |
| after_edit (street_clear_midday) | **15.36** | **0.2973** | **22.96** |

Byte-identical within noise. Cone is gated on `isNight`; at
daytime pose the cone mesh doesn't mount.

## §7.5 Effort breakdown
~12 min (plan + 14-line mesh addition + tsc + harness + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - Open-ended cone (`openEnded=true`) so the bottom disc isn't
    rendered as a solid disk. With additive blending a solid
    bottom disk would double-up at the floor and read as an
    opaque puddle of light.
  - 1.5 m bottom radius rather than the `tan(π/4) * 6 = 6` m
    that matches the SpotLight's projected cone on the ground.
    Full-width would overlap adjacent lamps at the 10 m spacing.
    Narrower visible cone suggests the "close to beam axis"
    volumetric density only.
  - 0.4× halo opacity multiplier so the cone is more subtle than
    the lamp-head glow. Matches perceptual ordering (bright
    source, dimmer extended beam).
