# iter-12-revisit-wetness-active-rain plan

RoadMesh wetness driver sums `wetness + precipitation_deposits`.
Both track accumulated moisture, not active rain — so a "CARLA
rain just started" state (precipitation=100, deposits=0) reads as
dry road while actively raining. Add `+ precipitation * 0.5` so
live rain counts ~50% as much as accumulated deposits.

Full weighted formula:
```
uWetness = min(1, (wetness + precipitation_deposits + precipitation * 0.5) / 200)
```

No-op at `precipitation=0` (iter-01 pose).

Out of scope: puddle formation delay, droplet-on-glass effect.

Acceptance: tsc clean; midday byte-identical.
