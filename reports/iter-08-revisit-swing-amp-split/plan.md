# iter-08-revisit-swing-amp-split plan

Walker arms + legs currently share one `swing = sin(walkPhase) * 0.45`.
Real walking: arms swing narrower than legs. Split them:
`armSwing = sin(walkPhase) * 0.35`, `legSwing = sin(walkPhase) * 0.55`.
Knee-bend amplitude unchanged at 0.8.

Out of scope: vertical head/torso bob, counter-rotation of shoulders
against hips.

Acceptance: tsc clean; midday byte-identical (walkers outside road
ROI at iter-01 pose).
