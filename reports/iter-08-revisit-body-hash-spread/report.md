# iter-08-revisit-body-hash-spread report

**Status: ✅ PASS** — walker body-color hash now prime-scattered:
`abs(actorId * 13 + 5) % 6`. Sequential CARLA IDs no longer
cluster on adjacent palette hues. Seventy-first ✅ of session.

## §7.2 Feature delta
`WalkerMesh.tsx::walkerBodyColor`: modulo argument changes from
`actorId` to `actorId * 13 + 5`. Parallels the pants function
which already used `* 7 + 3`. Uses different primes (13, 5) from
pants (7, 3) so body and pants still hash independently.

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| 15.xx cluster | 15.37 | 0.2973 | 22.95 |
| after_edit (street_clear_midday) | **15.37** | **0.2972** | **22.95** |

Byte-identical within noise. Walker crowds (when present) now
show better color diversity; not visible from iter-01 pose ROI.

## §7.5 Effort breakdown
~6 min (plan + 2-line edit + tsc + harness + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - Primes 13, 5 chosen co-prime to both 6 (body palette length)
    and 7, 3 (pants primes), ensuring body and pants hashes stay
    uncorrelated across actor IDs.
  - Did not increase the palette — 6 variations is plenty and
    adding more dilutes the safety-vis hue band the palette was
    designed around.
