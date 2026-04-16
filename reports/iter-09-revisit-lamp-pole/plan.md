# iter-09-revisit-lamp-pole plan

Night street lamps currently render as floating emissive spheres at
6m — no pole supports them. Add a thin cylinder mesh per lamp from
y=0 to y=6 (ground to lamp head), dark metal color, so the lamp
reads as a real streetlight rather than a point-light hovering in
air.

Dimensions: cylinder radius 0.06 (5cm), height 5.8 (from ground up
to just below the 6m head sphere). MeshStandardMaterial with
`color: #2a2a30`, `roughness: 0.7`, `metalness: 0.4`. receiveShadow
on so the cast sun-shadow lands on the pole at day.

Out of scope: per-pose pole-cap, lamp-arm geometry, authored GLB.

Acceptance: tsc clean; day pose shows poles (no longer null branch);
measure impact on road ROI — if poles fall outside ROI stays within
noise, if a pole projects into ROI could shift a few pixels.
