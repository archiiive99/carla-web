# iter-08-revisit-bob plan

Walker body has rotation + limb swing but no vertical bob — the
torso rides a fixed height as the legs swing, reading as a
"gliding" figure. Real walking has the body rise + fall twice per
stride (2× the step rate) as each leg plants.

Add `bobOffset = |sin(2 × walkPhase)| * 0.03` (3 cm peak) and apply
it via `bodyGroupRef.current.position.set(pos.x, pos.y + bob, pos.z)`
each frame. |sin| ensures only-upward bob (leg plants push head
up, not down — plant is always upward motion).

Out of scope: side-to-side hip sway, foot-plant impact deceleration.

Acceptance: tsc clean; midday byte-identical (walkers outside
road ROI at iter-01 pose).
