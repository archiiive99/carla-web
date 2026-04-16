# iter-09-revisit-shield plan

Streetlamp heads currently render as a bare emissive sphere floating
at the arm end — light-pollution-era look, not a modern hooded
fixture. Add a disc reflector "shield" just above the sphere to
suggest the hood CARLA's authored GLB streetlamps have. Disc
cylinder: radius 0.32, thickness 0.06, positioned `+y=0.18` above
the sphere, same dark metal material as pole/arm.

Disc is always visible (not gated on isNight) so the shield shows
at day too.

Out of scope: the reflector's actual light-shaping (would need
volumetric), matching CARLA's authored fixture shape exactly.

Acceptance: tsc clean; midday byte-identical (shield above road ROI).
