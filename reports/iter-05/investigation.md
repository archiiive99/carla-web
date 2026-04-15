# iter-05 investigation — Sky + sun direction parity

**Phase tag:** B (started 2026-04-15T07:50:51Z)

## UE5 source (cited)

  - `Unreal/CarlaUnreal/Plugins/Carla/Source/Carla/Weather/Sky.h:14-50` defines
    `ASkyBase` with `SkyAtmosphereComponent` (Hosek-Wilkie analytic), two
    `DirectionalLightComponent` (sun + moon), `SkyLightComponent` (IBL
    capture), `VolumetricCloudComponent`, `ExponentialHeightFogComponent`.
  - `Unreal/CarlaUnreal/Plugins/Carla/Source/Carla/Weather/WeatherParameters.h:11-57`
    defines `FWeatherParameters` with `SunAzimuthAngle [0..360]`,
    `SunAltitudeAngle [-90..90] default 75`, `Cloudiness`,
    `RayleighScatteringScale default 0.0331`, `MieScatteringScale`,
    `ScatteringIntensity`. The Blueprint `BP_CarlaWeather` translates these
    into SkyAtmosphereComponent properties + sun rotation.
  - The actual sun direction in UE5 is computed by BP_CarlaWeather from
    `(SunAzimuthAngle, SunAltitudeAngle)`. The `SkyAtmosphereComponent` then
    handles all atmospheric scattering analytically, including warm horizon
    glow, sun disc color shifting with altitude, and Mie/Rayleigh balance.

## Bridge data flow (cited)

  - `carla-web-bridge/src/models/schemas.py:61-66` exposes
    `WeatherState.cloudiness`, `sun_azimuth_angle`, `sun_altitude_angle`.
  - `carla-web-bridge/src/utils/serialization.py:146-151` populates from
    `carla.WeatherParameters` directly.
  - `carla-web-bridge/src/realtime_session.py:38-43` defaults the test pose
    to `cloudiness=10, sun_azimuth=220, sun_altitude=60` — same pose iter-01
    measured against.
  - `carla-web/src/types/carla.ts:72-77` mirrors the schema. Web store
    receives via WS `weather` events.

## Existing client implementation (cited)

  - `carla-web/src/components/viewport/scene-environment.tsx:91-210`
    `WeatherLighting` component:
      - Sun XYZ from `(cos·sin, sin, cos·cos)·200` — math correct for
        Y-up, Z-north convention. ✅
      - `<directionalLight>` intensity `daylight·(1−cloud·0.55)·1.7`,
        no color (default white).
      - `<hemisphereLight>` `["#a5a8ae", "#3b3d42", fillBoost]` —
        cool-grey neutral, no warm component.
      - `<ambientLight>` intensity `0.02 + cloud·0.05 + night·0.03`,
        white in daytime.
      - Drei `<Sky>` with `turbidity = 2 + cloud/10`,
        `rayleigh = max(0.15, 0.4 − cloud·0.25)`. At iter-01 pose
        (cloud=10): turbidity=3, rayleigh=0.375.
      - Wrapped in `<Environment>` for PMREM IBL capture.

## Iter-01 evidence on color gap (cited)

`reports/iter01/report.md` ROI mean: UE5 (41, 35, 28), web (22, 31, 40).
UE5 R/B = 1.46 (warm), web R/B = 0.55 (cool). Inversion is ~2.6× per channel
ratio.

Hypothesis confirmed by code reading:
  1. Drei Preetham at turbidity=3, rayleigh=0.375 produces saturated blue
     sky → IBL captures blue-dominant → web materials read cool.
  2. White directional sun (no color tint) at altitude 60° is warmer in
     reality (~5500K, slight yellow); web rendering treats sun as neutral.
  3. Hemisphere ground color `#3b3d42` is cool-neutral, providing no warm
     bounce.

## Implementation paths (per harness §3 B→C gate: ≥2 paths required)

### Path A — Tune Preetham + add sun color temperature + warm floor
Effort: ~30 min implementation. Three small edits in `scene-environment.tsx`:
  1. Add Kelvin-to-RGB sun color, low-altitude → warmer (5000K), high
     altitude → cooler (5800K).
  2. Bump turbidity (3 → 6) at clear-sky to match SkyAtmosphere's less-
     saturated mid-altitude output.
  3. Replace hemisphere ground hex `#3b3d42` with a warmer `#5a4f44`
     so warm bounce hits asphalt + horizontal car panels.

Pros: minimal code, no new assets, fast measure cycle.
Cons: Preetham can't perfectly match Hosek-Wilkie horizon glow at low
sun. Caps fidelity at ~moderate parity.

### Path B — Custom Hosek-Wilkie shader
Effort: 4-6h. Port a Hosek-Wilkie GLSL implementation (e.g. shadertoy or
three.js-community shader) onto a sky dome mesh. Drive uniforms from
weather state.

Pros: matches UE5's analytic model exactly; best fidelity ceiling for an
analytic approach.
Cons: 4-6h alone; this iteration's 4h budget would slip → §5.1 watchdog.
Better as iter-05-revisit if Path A misses.

### Path C — HDR cubemap per (TOD bucket × cloud bucket)
Effort: 5h+. UE5-side: launch headless Editor, CARLA `set_weather()` per
bucket, capture each face, encode to KTX2 cubemap. Web-side: drei
`<Environment>` with cubemap. Buckets: 6 TOD (sunrise/morning/noon/
afternoon/sunset/midnight) × 3 cloud (clear/partial/overcast) = 18 cubes
× 6 MB ≈ 108 MB of assets.

Pros: ground-truth IBL match; would close iter-01's color gap for sure.
Cons: largest effort; needs UE5-side capture commandlet (which doesn't
exist yet — that's iter-extract-N work); 108 MB asset budget.

## Decision: Path A

Rationale:
  - 4h budget. Path B/C don't fit even one iteration.
  - Path A's residual gap (Preetham-vs-Hosek) is bounded; iter-01's gap was
    huge (PSNR 14 vs 28). Path A should close the bulk of the warm/cool
    inversion. Quantifying how much is the whole point of measurement.
  - If Path A measures ≥ 24 dB sky-PSNR (success bar from plan.md), iter-05
    closes ✅/⚠️ and moves on. If it lands in the 18-22 dB band, queue
    iter-05-revisit-Path-B at end of queue per §4.3.
  - Preserves the existing scene architecture — drei `<Sky>` already wired,
    no new asset deps.

Path B / Path C are queued in iter-queue.md notes for revisit if needed.

## Phase C (asset extraction): SKIP

Path A needs no new assets. Advance directly to Phase D.

## Phase D scope

Edit `carla-web/src/components/viewport/scene-environment.tsx` only. Three
specific changes (≤30 LOC delta):
  1. Add `kelvinToRgb(k: number): THREE.Color` helper above `WeatherLighting`.
  2. Drive sun color from `5000 + altDeg·13` Kelvin (5000K horizon → 5800K
     zenith).
  3. Bump `turbidity` formula to `3 + cloud/8` (was `2 + cloud/10`).
  4. Replace hemisphere ground hex `#3b3d42` → `#5a4f44` (warm).

No file outside `scene-environment.tsx` needs changes for Path A. Bridge
schema + types already wire the weather data through.
