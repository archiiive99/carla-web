# Iteration 10 — Traffic lights

**Status: ✅ PASS — ✅-on-arrival per harness §1** for the row's literal
text ("emissive bulb + correct hue"). Refinement gap (recolor the
GLTF's authored bulb mesh instead of using a separate indicator
sphere above) queued as iter-10-revisit-glb-bulb.

Fifth ✅ of session.

---

## §7.1 Architecture posture
No new files. `TrafficLightMesh.tsx` already covers the row's
"emissive bulb + correct hue" criterion via the indicator-sphere
approach.

## §7.2 Feature delta
**Already shipped** in `carla-web/src/components/viewport/actor-rendering/TrafficLightMesh.tsx`:
  - **Correct hue per state** (L23-34): switch on
    `actor.traffic_light_state` returns `TRAFFIC_RED` / `TRAFFIC_YELLOW`
    / `TRAFFIC_GREEN` / `TRAFFIC_OFF` from `scene-palette.ts`.
  - **Emissive bulb** (L67-72): sphere at [0, 4.0, 0] above the GLTF
    model with `emissive={bulbColor}`, `emissiveIntensity={1.5}`.
  - **Dynamic update** via `useActorStore.weather` + traffic-light WS
    broadcasts — bulb color updates each tick.
  - **Box fallback** (L36-50): when the GLTF model fails to load,
    a procedural box traffic-light renders with state-correct
    emissive bulb at [0, 3.15, 0].

## §7.3 Pixel diff
Distant traffic light visible at end of road in iter-13-followon stab2
web render (green dot ~mid-frame). Carries correct state color.

## §7.4 Measurements
Re-cite iter-13-followon stab2 (most recent stable measurement
exercising scene including traffic lights):

| Run | mode | PSNR (dB) | SSIM | ΔE | Note |
|---|---|---|---|---|---|
| iter-13-followon stab2 (re-cited) | road | 11.03 | 0.213 | 35.89 | distant traffic light visible in road ROI corner |

## §7.5 Effort breakdown
  - Investigation: ~5 min
  - Report: ~10 min
  - **Total: ~15 min, well under 1 h budget.**

## §7.6 Honesty-badge audit
0 NEW hits — verified before commit.

## §7.7 Autonomy decisions
  - **Closed ✅-on-arrival** for the literal row text
    ("emissive bulb + correct hue") — both criteria are met.
  - **Surfaced + queued the partial gap** (GLTF-mesh recolor) as
    iter-10-revisit-glb-bulb instead of expanding scope.

## §7.8 Remaining gaps → paths
  - **iter-10-revisit-glb-bulb**: traverse the cloned GLTF scene tree
    in `GltfTrafficLight`, find the bulb mesh by name (likely
    "BulbRed" / "BulbYellow" / "BulbGreen" or material-name based),
    set the active state's bulb material's emissive to match
    `bulbColor`. Requires inspecting the GLTF metadata first to
    discover mesh/material names — ~30 min discovery + ~20 min
    implementation.

## §7.9 Next iteration
Diminishing returns trigger met (5 consecutive non-pixel iterations:
iter-13 / iter-13-followon / iter-05-revisit-roi-sky / iter-12 /
iter-04 / iter-10). Per harness §5.2 + §6.5, raising for strategy
review. See raise dashboard at `reports/dashboard.md` Summary line +
`reports/SESSION-RAISE.md`.
