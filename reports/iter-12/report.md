# Iteration 12 — Wet-surface response (driven by CARLA wetness param)

**Status: ✅ PASS — ✅-on-arrival per harness §1.** The wet-surface
binding was already implemented in iter-01's road-PBR work as a
stretch goal: `RoadMesh.tsx:32-44` reads weather.wetness +
precipitation_deposits, normalizes to 0..1, writes to a shared shader
uniform `uWetness`. `road-materials.ts:323-328` consumes it: roughness
drops from ~0.9 (dry) to 0.22 (wet) and 0.08 inside pooled noise
regions. iter-12's job was to *verify* the binding fires end-to-end +
provide measurement evidence — done.

Third ✅ of session.

---

## §7.1 Architecture posture
No new files. iter-01's web-side road shader + uWetness uniform binding
verified intact. Only the harness gained a new flag (`--weather-wetness
N`) so future weather-driven iterations can override the default 0.0.

## §7.2 Feature delta
  - **Verified existing binding chain**:
      - CARLA `WeatherParameters.wetness` → bridge
        `WeatherState.wetness` → WS broadcast → web
        `useSimulationStore.weather.wetness` → `RoadMesh.tsx:35-43`
        useEffect → shared `ROAD_UNIFORMS.uWetness.value` → shader.
  - **Added `compare.py --weather-wetness N` flag** (default 0.0)
    so weather-driven iterations can vary that parameter independently
    of the other harness defaults. The pose object gets a dynamic
    `wetness` attribute; `capture_carla_reference` reads it via
    `getattr(pose, "wetness", 0.0)`.

## §7.3 Pixel diff
- `web_render_dry.png` (wetness=0): matte asphalt, uniform mid-grey
  on the road surface.
- `web_render_wet.png` (wetness=80): visibly different — subtle
  specular sheen on mid-road areas; building silhouettes slightly more
  reflective on the wet patches; road darkens slightly where the wet
  noise samples high (matching the shader's roughness 0.9 → 0.22 step).
- Side-by-side at iter-01 pose confirms the binding fires.

## §7.4 Measurements

| Run | wetness | PSNR (dB) | SSIM | ΔE | Note |
|---|---|---|---|---|---|
| dry | 0 | 11.03 | 0.213 | 35.89 | matches iter-13-followon stab2 byte-identically (no regression) |
| wet | 80 | 11.54 | 0.228 | 35.20 | wet binding fires; ROI metrics shift |

Delta dry→wet: PSNR +0.51 dB, SSIM +0.015, ΔE -0.69. This is
**25×-larger** than the iter-13-followon reproducibility floor (0.02
dB), confirming the binding modulates the rendered scene.

Note: the wet ROI scored *better* against the (unfixed-night-state)
CARLA reference because that reference has visible streetlight specular
highlights on the road, which the wet web render reproduces (lower
roughness → mirror-like specular). When the BP weather chain is
fixed (iter-engine-weather-bp-revisit) and the reference becomes a
true midday-clear capture, the wet-vs-reference gap will widen
(midday-clear UE5 has dry roads). Both cases are useful as
parameter-axis tests.

## §7.5 Effort breakdown
  - Investigation (grep RoadMesh + road-materials for existing
    wetness wiring): ~5 min — DISCOVERED ALREADY-IMPLEMENTED
  - Implementation (compare.py --weather-wetness flag, ~15 LOC): ~10 min
  - Two harness runs (dry / wet): ~6 min
  - Report: ~10 min
  - **Total: ~30 min, well under 1.5 h budget.**
  - Pixel-vs-pipeline-vs-harness ratio: 0% pixel (already shipped) /
    0% asset / 100% harness-infrastructure + verification.

## §7.6 Honesty-badge audit
```
$ git diff carla-web-bridge/tools/render_parity/compare.py reports/iter-12 \
      | grep -ciE 'placeholder|approximate|mock|draft|disclosure|honesty.*badge|remaining.{0,30}limitation'
```
0 NEW hits — verified before commit.

## §7.7 Autonomy decisions
  - **Closed ✅-on-arrival** per harness §1 ("no-op rows close
    ✅-on-arrival with measurement evidence") rather than opening a
    new pixel iteration to re-implement a feature that was already
    shipped.
  - **`setattr(pose, "wetness", N)`** instead of plumbing a new
    parameter through `capture_carla_reference`'s signature — the Pose
    dataclass isn't frozen, and this keeps the CLI flag local to
    `main()` without changing every call-site.
  - **No tightening of acceptance bars** for this iteration: the
    purpose was binding-verification, not parity; the §0.3 bars
    (PSNR≥30, etc.) don't apply to a feature-presence test.

## §7.8 Remaining gaps → paths
  - **Wet-surface PARITY tuning** — the shader maps wetness 0→1 to
    roughness 0.9→0.22 today; the actual UE5 wet-asphalt response
    might land at a different roughness sweet spot. Queueable as
    iter-12-revisit-parity once the BP weather chain is fixed and a
    true wet-CARLA-reference can be captured.
  - **Specular reflection environment** — wet asphalt on the web side
    only reflects the IBL Environment cubemap (currently captured from
    drei `<Sky>`). When iter-engine-weather-bp-revisit lands and the
    sky correctly reflects time-of-day, wet-road specular will
    automatically match better.

## §7.9 Next iteration
Per the queue, next is iter-02 (Building façades) — but that needs
UE editor mode for asset extraction (not available headlessly).
Better next:
  - **iter-04 Lane markings** — RoadMesh shader already has lane
    logic; iteration would tune marking geometry/sharpness. Web-only,
    measurable in the road ROI.
  - **iter-10 Traffic lights** — TrafficLightMesh already wired with
    palette colors; iteration would improve emissive bulb response or
    glass refractive look. Web-only.

Recommendation: iter-04 for next cron fire — closest to road ROI
which has the most stable measurement baseline.
