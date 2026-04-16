# iter-09-revisit-light-cone plan

SpotLight casts light on the ground but the beam itself is
invisible unless there's volumetric media. Add a transparent
cone mesh from the lamp head extending down toward the target
to suggest the beam volume.

Cone height = lamp y (6 m); top radius = 0 (apex at head); bottom
radius = ~1.5 m (matches SPOTLIGHT_ANGLE = π/4 at 6 m drop:
`tan(π/4) * 6 = 6`… too wide, cap at 1.5 m for visible
footprint). Actually cone geometry with `radiusBottom = 1.5`
makes it more of a flashlight visualization. Keep it modest so
it doesn't overwhelm the scene.

MeshBasicMaterial: STREETLAMP_BEAM color, opacity = haloOpacity * 0.4
(quarter of halo intensity), additive blending, depthWrite false.

Gated on isNight — only appears with the rest of the night rig.

Acceptance: tsc clean; midday byte-identical.
