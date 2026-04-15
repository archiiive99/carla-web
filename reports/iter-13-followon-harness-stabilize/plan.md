# iter-13-followon-harness-stabilize plan

**Phase tag:** A (opened 2026-04-15T09:00:56Z)
**Time budget:** 1 h hard / 6 h watchdog

## Target row
> iter-13-followon-harness-stabilize — Add NPC-clear-before-capture to
> compare.py (~30 min, unblocks measurement of subsequent iters)

## Why now
iter-13's measurement returned PSNR=7 because CARLA spawned an NPC
vehicle at the camera world-coords, putting a yellow hood across the
road ROI. Same artifact also degraded iter-engine-weather-bp's numbers.
Without this fix, every subsequent iteration's harness numbers will be
similarly contaminated.

## Success looks like
  - `compare.py` removes any actor of type `vehicle.*` whose location is
    within R meters of the camera pose BEFORE spawning the sensor camera.
  - Default R = 8 m (covers typical car length + buffer).
  - Two consecutive runs of `compare.py --pose street_clear_midday`
    produce PSNR within ±2 dB of each other (i.e. reproducible).
  - The captured `ue5_reference_*.png` shows clear road in the ROI (no
    vehicle hood blocking).

## Files in scope
  - `carla-web-bridge/tools/render_parity/compare.py` — add helper +
    invocation in `capture_carla_reference`

## Out of scope
  - Any web-side code (no UI, no scene, no actor rendering)
  - Any UE5 C++ work (the BP weather chain is a separate revisit)
  - The reference scene's macro day/night appearance (still owned by
    the unfixed BP chain — iter-engine-weather-bp-revisit)

## Phase B paths
  1. **Destroy actors via Python carla.Actor.destroy()**: enumerate
     `world.get_actors().filter('vehicle.*')`, for each compute
     distance to pose, call `.destroy()` if within R.
  2. **Use traffic-manager to despawn**: less reliable, and may not
     actually remove existing actors.

Path 1 chosen — direct, deterministic, matches CARLA Python API
norms.

## Phase E acceptance
  - Two consecutive `compare.py` runs with `--label stab1` and `--label stab2`.
  - PSNR delta between them ≤ 2 dB.
  - At least one of them produces PSNR > 11 dB (i.e. better than the
    NPC-blocked iter-13 number; doesn't have to hit the iter-05/after2
    15.21 because the lighting still has the BP wiring issue).
  - Visual verification: ROI overlay shows asphalt, not car hood.
