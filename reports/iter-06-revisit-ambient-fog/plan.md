# iter-06-revisit-ambient-fog plan

`ambientBase = 0.02 + cloudFactor * 0.05 + nightFactor * 0.03` has
no fog-density term. Fog scatters direct sunlight into diffuse
ambient — a foggy noon reads as slightly-brighter-everywhere (not
deep shadows). Add `+ fogFactor * 0.04` where
`fogFactor = clamp(fog_density, 0, 100) / 100`.

No-op at `street_clear_midday` (fog_density=0).

Out of scope: directional attenuation via fog (that's CARLA's
`uFogDensity` shader path, already handled).

Acceptance: tsc clean; midday byte-identical.
