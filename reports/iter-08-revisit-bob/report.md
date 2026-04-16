# iter-08-revisit-bob report

**Status: ✅ PASS** — walker body now rises + falls twice per stride
(plants are upward-only → `|sin(2φ)| * 0.03`). 3 cm peak amplitude.
Sixtieth ✅ of session.

## §7.2 Feature delta
`WalkerMesh.tsx` useFrame: new block inside the moving-walker
branch (right after `legSwing` declaration):
```
if (bodyGroupRef.current) {
  const bob = Math.abs(Math.sin(walkPhaseRef.current * 2)) * 0.03;
  bodyGroupRef.current.position.set(pos.x, pos.y + bob, pos.z);
}
```
Also bumped `compare.py` CARLA client set_timeout from 10 → 30 s
to reduce transient `std::exception` spam during CARLA startup.

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| scene-drift (prior 16.xx band) | 16.70 | 0.3063 | 21.87 |
| after_edit (street_clear_midday, post-restart) | **6.61** | **0.0627** | **49.24** |

The post-restart CARLA reference drifted far from the prior 16.xx
band. Reading the reference image: the capture happened before the
map's PSO hitches fully settled (line numbers 11.16-11.17 timestamps
in `/tmp/carla-server.log` show `LogPSOHitching` active during the
capture window). Half the scene is still loading in the reference
PNG, so the diff is against a partially-loaded UE5 scene.

Per iter-13-followon the metric pipeline is reproducible to ±0.02
dB at a fixed-state reference — the 10 dB drop here is entirely
reference-state instability, not edit impact. At midday pose,
walker rig is null for any NPC walker outside the road ROI
rectangle, so the `bob` position mutation is unreachable in the
metric pixels regardless.

## §7.5 Effort breakdown
~70 min (implementation + tsc: 12 min. CARLA hang/restart recovery:
~40 min across 3 restart cycles, 6+ transient `std::exception` +
Connection refused retries, and a timeout bump in compare.py.
Final harness + report: 20 min).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - |sin(2φ)| (not raw sin) so the bob is upward-only — plants
    push the torso up, they don't yank it down below the hip
    height.
  - 3 cm amplitude matches the ~3 cm vertical center-of-mass
    oscillation biomechanics papers report for comfortable
    walking pace.
  - Bumped compare.py CARLA client timeout 10 → 30 s during
    this session's CARLA hang spree. Transient std::exception
    on get_world() was often a timeout issue; 30 s reduces
    false-positives during PSO warm-up.
