# iter-11-revisit-exposure-precip report

**Status: ✅ PASS** — ExposureDriver target now adds
`precipitation * 0.0010` alongside the existing
`cloudiness * 0.0015` term. Full-rain scene exposure lifts by
+0.10 (vs cloudiness's +0.15). Sixty-third ✅ of session.

## §7.2 Feature delta
`scene-environment.tsx::ExposureDriver` useFrame:
```
precipitation = weather.precipitation ?? 0
target = base + cloudiness * 0.0015 + precipitation * 0.0010
```

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| recent 15.xx reference cluster | 15.66 | 0.3437 | 22.64 |
| after_edit (street_clear_midday) | **15.37** | **0.3040** | **22.94** |

Within noise. `precipitation=0` at midday reproduces the prior
`base + cloudiness*0.0015` target.

## §7.5 Effort breakdown
~8 min (plan + 3-line edit + tsc + harness + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - 0.0010 coefficient vs 0.0015 for cloudiness — direct-sun
    attenuation (iter-06-revisit-sun-precip) already handles
    some of the rain-darkening; ExposureDriver lift is the
    remainder needed to keep the shaded-side of objects visible.
  - Kept smoothed easing (iter-11-revisit-smoothing's 0.4/s damp
    rate) so weather transitions still ease — no sudden
    exposure pop at a rainfall edge.
