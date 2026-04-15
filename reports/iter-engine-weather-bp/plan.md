# iter-engine-weather-bp plan — BP_CarlaWeather → SkyAtmosphere wiring fix

**Phase tag:** A (opened 2026-04-15T08:06:04Z)
**Time budget:** 4 h hard / 6 h watchdog ceiling per harness §5.1
**Why it blocks everything:** without correct sun-pose propagation in the
CARLA reference capture, every render-parity iteration after iter-05 will
measure noise. iter-05 raised §6.1 specifically pointing here.

## Target row

> iter-engine-weather-bp — BP_CarlaWeather → SkyAtmosphere wiring fix
> (newly inserted before iter-06; blocks ALL future render-parity measurement)

## Success looks like

  - `world.set_weather(sun_altitude_angle=60, sun_azimuth_angle=220)` followed
    by 1 s wait → CARLA reference capture renders a daytime scene matching
    those angles (sun visible, no streetlights, sky tracks SkyAtmosphere).
  - `world.set_weather(sun_altitude_angle=-30)` → CARLA reference capture
    renders night.
  - Re-run of `tools/render_parity/compare.py` for iter-05's pose returns
    a reference image visually consistent with the pose's named weather
    (`street_clear_midday`).
  - No regression in any existing CARLA Python API consumer
    (`world.get_weather()` still returns the same struct fields it did
    before this change).

## Implementation path (C++ Path 2 from iter-05/report.md §7.8)

Edit `Carla/Source/Carla/Weather/Weather.cpp` `AWeather::ApplyWeather`:
  1. After `SetWeather(InWeather)`, BEFORE the BP `RefreshWeather` call,
     enumerate all `ASkyBase` actors in the world via
     `UGameplayStatics::GetAllActorsOfClass`.
  2. For each, set `DirectionalLightComponentSun` rotation from
     `(SunAltitudeAngle, SunAzimuthAngle)` — pitch = -SunAltitudeAngle,
     yaw = SunAzimuthAngle.
  3. Also push relevant atmospheric scalars into `SkyAtmosphereComponent`
     properties (RayleighScatteringScale, MieScatteringScale,
     ScatteringIntensity) so the analytic atmosphere shifts with weather.
  4. Toggle `DirectionalLightComponentMoon`/`DirectionalLightComponentSun`
     intensity by altitude sign so night vs day directs from the right
     source.

Why C++ rather than fixing the BP:
  - BP_CarlaWeather.uasset is binary; can't be edited from CLI.
  - Even if BP is broken, the C++ fallback guarantees correctness on
    every fresh checkout regardless of BP state.
  - One-time recompile vs. ongoing BP fragility.

## Files in scope

  - `Unreal/CarlaUnreal/Plugins/Carla/Source/Carla/Weather/Weather.cpp`
    (add C++ propagation in `ApplyWeather`)
  - `Unreal/CarlaUnreal/Plugins/Carla/Source/Carla/Weather/Weather.h`
    (add `#include` + helper-fn forward decl if needed)

## Out of scope

  - Any other UE5 C++ file (the iter-01 sensor-stick fixes already in
    `git status` are someone else's WIP; do NOT stage them).
  - BP_CarlaWeather.uasset itself (cannot edit from CLI; the C++ fallback
    bypasses it).
  - Any post-process / tonemap tuning (iter-11 territory).
  - Any web-side change (iter-05's Path A scene-environment.tsx is shipped).

## Verification plan

  1. `make CarlaUnreal-launch` (or equivalent UnrealBuildTool incremental
    build) on GPU 2 — must succeed.
  2. UE5 must restart cleanly via `tmux send-keys` to its existing pane.
    (Authorized exception per project_streaming_stack.md — measurement work.)
  3. `world.set_weather(sun_alt=60)` → reference capture shows day.
  4. `world.set_weather(sun_alt=-30)` → reference capture shows night.
  5. Re-run `compare.py --pose street_clear_midday --label after_bp_fix`.
    Acceptance: PSNR ≥ 18 dB on road ROI (still not 28 because Path A
    sky tune needs further rounds and lighting parity is multi-iteration).
    The bar here is "the reference is now correct" not "iter-05 closes
    ✅" — that's iter-05-revisit.
