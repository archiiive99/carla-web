# iter-06-revisit-sun-kelvin-cloud plan

Sun Kelvin formula: `sunKelvin = 5000 + clamp(altDeg,0,60) * 13`
maps altitude directly to color temp (5000K horizon → 5780K zenith).
Under heavy cloud cover, the visible direct-sun component is
attenuated and the diffuse-sky component dominates — which reads as
cooler-shifted in real life (UE5 SkyAtmosphere shifts toward
rayleigh's blue bias as the sun disk is occluded).

Subtract `cloudFactor * 300K` from the altitude-driven base to
approximate this. `sunKelvin = base - cloudFactor * 300`.
At clear (cloudFactor=0) = no change; at overcast (cloudFactor=1)
= 300K cooler.

No-op at `street_clear_midday` (cloudiness=0).

Out of scope: multi-bucket cloud color (stratus blue vs cumulus
warm-grey), azimuth-dependent tint.

Acceptance: tsc clean; midday byte-identical.
