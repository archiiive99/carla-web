# iter-09-revisit-shield report

**Status: ✅ PASS** — thin reflector disc mesh added 0.18 m above
each lamp head position. Radius 0.32, height 0.06, same
`#2a2a30` material as pole/arm. Always visible (not gated on
isNight) — the fixture reads as a hooded lamp whether lit or not.
Fifty-sixth ✅ of session.

## §7.2 Feature delta
`NightStreetLights.tsx`: new `<mesh>` after the horizontal arm,
before the `{isNight && (...)}` block:
```
<mesh position={[headX, headY + 0.18, headZ]} castShadow receiveShadow>
  <cylinderGeometry args={[0.32, 0.32, 0.06, 16]} />
  <meshStandardMaterial color="#2a2a30" roughness={0.7} metalness={0.4} />
</mesh>
```

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| scene-drift (11.xx band) | 11.03 | 0.2127 | 35.89 |
| after_edit (street_clear_midday) | **10.97** | **0.2109** | **36.10** |

Within noise. Reference drifted from the post-restart 12.29 cluster
back toward the pre-restart 11.xx cluster — reference-state
recovery, not edit impact. Shield lives above road ROI.

## §7.5 Effort breakdown
~15 min (plan + mesh addition + tsc + harness retry after one
SIGTERM + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - Thin disc (6 cm thick) rather than a hemisphere — authored
    CARLA GLBs vary wildly in shape; a neutral disc is the
    closest "any streetlamp" silhouette without miscommitting.
  - Disc radius 0.32 = ~1.8× the emissive-sphere radius (0.18) so
    the hood extends visibly past the lamp head without
    overwhelming the silhouette.
