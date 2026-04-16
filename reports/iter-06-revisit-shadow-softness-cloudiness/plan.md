# iter-06-revisit-shadow-softness-cloudiness plan

directionalLight shadow-radius is fixed at 2.5 regardless of weather.
Overcast scenes have diffuse lighting with soft, indistinct shadows;
clear noon has sharper cast shadows. Ramp shadow-radius by cloudiness:
2.5 at cloudiness=0, 6.0 at cloudiness=100.

No-op at `street_clear_midday` pose (cloudiness=0 → radius=2.5).

Out of scope: multi-cascade CSM with per-cascade radii.

Acceptance: tsc clean; midday byte-identical.
