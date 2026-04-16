# iter-07-revisit-trunk-vary plan

Procedural vegetation: canopy already varies per instance via
`canopyMesh.setColorAt(i, ...)`. Trunks all share the single
TREE_TRUNK uniform — every trunk reads as the same slab of bark
color.

Add `trunkMesh.setColorAt(i, trunkColor)` per instance using a
±15% HSV-V perturbation on TREE_TRUNK. Slight variation so a
cluster of trees has subtly different trunk tones, matching how
real bark weathers differently tree-to-tree.

Out of scope: per-species trunk profiles, bark texture variation.

Acceptance: tsc clean; midday byte-identical (procedural trees
are fallback; GLB path unchanged and is the primary render).
