# iter-06-revisit-sun-precip plan

`directIntensity = daylight * (1 - cloudFactor * 0.55)` attenuates
direct sun by cloudiness. Precipitation doesn't factor in. Heavy
rain further dims direct sun (wet air + droplets scatter).

Add `- precipitationFactor * 0.25` term:
```
directIntensity = daylight * (1 - cloudFactor * 0.55 - precipFactor * 0.25)
```
where `precipFactor = clamp(precipitation, 0, 100) / 100`.

No-op at `precipitation=0`. Floor at 0 so heavy rain + heavy cloud
don't go negative.

Out of scope: rain streak particles, wet-surface coupling (already
handled by uWetness path).

Acceptance: tsc clean; midday byte-identical.
