# carla-web e2e tests

Playwright specs that exercise the running dashboard. Each spec assumes
the bridge is up at `localhost:58337` and the dashboard at `localhost:58336`.
Specs auto-skip when CARLA RPC is disconnected (via `waitForCarla()`).

## Specs

| File | Purpose |
| --- | --- |
| `accessibility-navigation.spec.ts` | Skip-link focus and AlertDialog focus-return regression coverage. |
| `full-stack.spec.ts` | Page loads cleanly, layout, basic UI smoke tests. |
| `light-mode-contrast.spec.ts` | Light-theme contrast guard for critical status and overlay surfaces. |
| `vegetation-placement.spec.ts` | Regression coverage for ground-anchored vegetation placement. |
| `wasd-controls.spec.ts` | Vehicle keyboard control HUD wiring. |
| `road-render.spec.ts` | **Road-render fidelity baseline captures** (this doc). |

## Running

```bash
cd carla-web
npx playwright test road-render          # full road-render spec (6 captures)
npx playwright test road-render -g dry   # only the dry-weather captures (3)
```

Output lands in `e2e/screenshots/road-{dry|wet}-{chase|topdown|street}.png`
(gitignored). Per-test failures dump the page snapshot under
`test-results/.../test-failed-1.png` for debugging.

## Section-2 matched-pair workflow

The road-render mandate (`prompts/specs/road-render-fidelity.md` §2)
requires source-vs-target screenshots at matched poses + weather. The
spec automates the **target** (web dashboard) side. The **source** (UE5
in-engine) side is a separate process — capture options:

1. **Editor screenshot.** With CARLA's editor open, `F9` or
   `Window → Take Screenshot`. Manually match the camera pose by
   snapping the editor spectator to the same world-XYZ +
   yaw/pitch the dashboard uses for each spec pose. Set weather via
   the same `world.set_weather(WeatherParameters.WetCloudyNoon)`
   that the spec triggers (or via the dashboard's Weather button
   while running matched).
2. **Spectator + sensor.camera.rgb.** Spawn a `sensor.camera.rgb` at
   the same pose, save its first frame to disk via the existing
   `carla-web-bridge/tools/compare_render.py` (agent-C scope).

Once both sides exist, diff each pair side-by-side at 100% zoom. Per
the mandate, "A claim of 'road looks right' without a matched-pair
screenshot diff is not accepted."

## Bridge stability note

If `npx playwright test road-render` triggers the libcarla native
abort (`libc++abi: terminating ...`), the bridge supervisor recovers
on its own; if it gets stuck, `touch carla-web-bridge/src/main.py`
fires a hot-reload. Re-running the spec with fewer concurrent ws
connections (one pose at a time via `-g`) reduces crash frequency.

## Texel density (Section-5 documentation)

The procedural road material in `src/components/viewport/RoadMesh.tsx`
does not use bitmap textures, so "texels per metre" is replaced by
"noise frequency per metre". All noise terms key on **world XZ**
coordinates, not UV — so the effective "texel density" is identical
across every road segment, every junction, and every map. Frequencies
in use:

| Layer | Frequency (cycles/m) | Effective cell size | Purpose |
| --- | --- | --- | --- |
| `coarse` | 0.08 | ~12 m | Long-range tonal variation |
| `patch` | 0.22 | ~4.5 m | Resurfacing patch overlays |
| Wet pool | 0.45 | ~2.2 m | Puddle pooling under wetness |
| `fbm` (4-octave, base 0.9) | 0.9 → 7.5 | 1.1 m → 13 cm | Aggregate texture body |
| Dirt patch noise | 1.6 | ~60 cm | Curb-side dirt modulation |
| Roughness jitter | 2.5 | ~40 cm | Surface roughness variation |
| Skid noise | 3.0 | ~33 cm | Skid-mark intensity |
| Edge-paint weather | 4.0 | ~25 cm | Weathered paint break-up |
| Aggregate grain | 14.0 | ~7 cm | Close-camera gravel detail |

Lane-marking dash phase uses `dot(worldXZ, laneForwardXZ) / 6.0`,
which means same-direction adjacent lanes share dash positions at
their shared boundary regardless of independent waypoint sort order.
Crosswalk stripe phase uses `u * 7` so each lane shows ~7 stripes
spanning its width — independent of lane width since u is normalized
[0, 1] across each lane's width.

Sidewalk material's expansion-joint cycle is `floor(vSwUv.y)` where v
is `accDist / 2.0` — joints every 2 m of arc length along the
outermost lane. Per-panel tone variation is hashed on the same
`floor(vSwUv.y)` so panels keep their shade discontinuously across
joints (matching real poured-concrete sidewalks).
