# iter-11-revisit-exposure-deep-night plan

ExposureDriver base when `sunAlt <= 0` clamps at `EXPOSURE_DUSK_NIGHT`
(1.6). Under very deep night (sun_alt ≤ -20), the scene could use a
bit more exposure headroom — the stars-ish / moonlight floor is
dimmer than late dusk. Ramp base from 1.6 at sun_alt=0 to 2.0 at
sun_alt=-20, clamped.

```
deepNightFactor = clamp(-sunAlt, 0, 20) / 20   (only active below horizon)
base = EXPOSURE_DUSK_NIGHT + deepNightFactor * 0.4
```

At `sun_alt <= 0 && sun_alt >= -20` keeps the ramp smooth; below
-20 saturates.

Acceptance: tsc clean; midday byte-identical (sun_alt=60 > 0, so
deepNightFactor=0).
