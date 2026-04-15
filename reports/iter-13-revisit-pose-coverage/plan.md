# iter-13-revisit-pose-coverage plan

**Phase tag:** A (opened 2026-04-15T09:31:33Z)
**Time budget:** 1 h hard

## Target
Add additional pinned poses to compare.py POSES registry so future
parity iterations have multi-angle measurement coverage.

## Poses to add
  - **birdseye_clear_midday**: top-down at the same intersection,
    z=80 m, pitch=-89° (looking straight down). Tests sky+road at
    different scale.
  - **chase_clear_midday**: behind + above street_clear_midday, z=4 m,
    pitch=-15°, same yaw. Tests vehicle/road from a typical follow-cam.
  - **intersection_corner_midday**: same x/y as street pose, yaw +90°
    (looking sideways at intersection corner). Tests buildings + signs
    + traffic lights inside ROI.

## Files in scope
  - `carla-web-bridge/tools/render_parity/compare.py` POSES dict only.

## Phase E
For each new pose: one harness run with --label probe to capture
baseline numbers + verify the camera lands somewhere sensible (not
underground, not inside a wall).

## Phase F
PASS if all three new poses produce numeric output (no harness crash)
and visual inspection shows reasonable scene framing.

## Out of scope
  - Tuning ROIs per-pose (would be iter-13-revisit-roi-per-pose).
  - Adding poses for OTHER maps (Town01_Opt only this iteration).
