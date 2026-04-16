# iter-03-revisit-paint-gloss plan

Vehicle paint PBR currently roughness=0.45 / metalness=0.5 — halfway
between matte plastic and chrome. Real automotive paint reads closer
to roughness≈0.3 / metalness≈0.35 with a brighter envMap contribution
(clearcoat surrogate). Tune all three.

Out of scope: true MeshPhysicalMaterial clearcoat layer (adds cost
and needs per-vehicle ior/thickness).

Acceptance: tsc clean; harness byte-identical at street_clear_midday
(no vehicle in ROI). Commit + push.
