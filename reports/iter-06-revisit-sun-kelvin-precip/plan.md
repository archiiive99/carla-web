# iter-06-revisit-sun-kelvin-precip plan

Sun kelvin formula gained a `-cloudFactor * 300` term in
iter-06-revisit-sun-kelvin-cloud. Precipitation also filters sun
toward cooler (droplets scatter). Add a precipitation term
`-precipFactor * 200` (smaller than cloud's 300 since cloudiness
is the dominant scatterer and precipitation mostly compounds).

No-op at `precipitation=0`.

Out of scope: mist vs thunderstorm-specific spectra.

Acceptance: tsc clean; midday byte-identical.
