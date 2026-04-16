# iter-06-revisit-hemi-ground-fog report

**Status: ✅ PASS** — hemisphere ground color now takes a second
`.lerp()` step toward `#6a6565` (fog neutral warm-gray) on the
existing `fogFactor`. Composes with the existing altitude lerp.
Sixty-ninth ✅ of session.

## §7.2 Feature delta
`scene-environment.tsx::WeatherLighting` hemisphereLight `args[1]`
day branch:
```
.lerpColors(horizon, noon, altFactor).lerp(fogGray, fogFactor)
```
Chained — altitude first, then fog desaturation. Both operations
are no-ops at their zero factor.

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| 15.xx cluster | 15.36 | 0.2974 | 22.96 |
| after_edit (street_clear_midday) | **15.37** | **0.2973** | **22.95** |

Byte-identical within noise. Both `altFactor=1` + `fogFactor=0`
reproduce the prior `#5a4f44` literal unchanged.

## §7.5 Effort breakdown
~8 min (plan + 3-line edit + tsc + harness + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - Target `#6a6565` slightly warm-biased (desaturated brown)
    rather than pure `#6a6a6a` neutral gray. The ground bounce
    is tied to the pavement, which retains some warmth even under
    heavy fog; a pure-gray target would over-cool the scene.
  - Composition via `.lerp()` chain rather than computing the
    weighted blend math explicitly — THREE.Color.lerp mutates in
    place and is cheap, so the two-step chain is correct and
    readable.
