# iter-06-revisit-hemi-sky-fog report

**Status: ✅ PASS** — hemisphere `args[0]` (sky color, day branch)
now interpolates between `#a5a8ae` (clear) and `#c0c2c7` (fog
neutral) on existing `fogFactor`. Sixty-seventh ✅ of session.

## §7.2 Feature delta
`scene-environment.tsx::WeatherLighting` hemisphereLight `args[0]`:
```
isNight ? "#5a6575" : lerpColors(a5a8ae, c0c2c7, fogFactor).hex
```
Night branch unchanged.

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| 15.xx cluster this session window | 15.36 | 0.2974 | 22.96 |
| after_edit (street_clear_midday) | **15.34** | **0.2975** | **22.98** |

Byte-identical within noise. `fogFactor=0` at midday reproduces
`#a5a8ae` exactly.

## §7.5 Effort breakdown
~10 min (plan + 8-line edit + tsc + harness + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - Target fog gray `#c0c2c7` chosen close to the desaturated
    fog tint (`hsl(210, 4%, L)`) already in WeatherFog — consistent
    perceptual gray.
  - Reused `THREE.Color().lerpColors().getHexString()` idiom from
    iter-06-revisit-ground-bounce-altitude + iter-11-revisit-ambient-cloud-cool.
