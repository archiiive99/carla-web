# iter-engine-weather-bp investigation

**Phase tag:** B → D (B is short; most source reading occurred during iter-05)

## Source already cited in iter-05/investigation.md
  - `Weather/Weather.h`, `Weather/Weather.cpp`, `Weather/Sky.h`, `Weather/Sky.cpp`,
    `Weather/WeatherParameters.h`. No new files needed for fix.

## Confirmed defect (carry-over from iter-05/report.md §7.8)

  - `world.set_weather()` correctly populates `AWeather::Weather` (verified via
    `world.get_weather()` round-trip).
  - `AWeather::ApplyWeather` then calls `RefreshWeather(Weather)` —
    BlueprintImplementableEvent — handing off to `BP_CarlaWeather.uasset`.
  - `BP_CarlaWeather` is the only thing that translates Sun(Altitude/Azimuth)
    Angles into actual `DirectionalLightComponentSun` rotation +
    `SkyAtmosphereComponent` updates. Its event graph is broken (or wired to
    the obsolete UE4 sky actor). Result: rendered scene ignores sun-pose
    fields in FWeatherParameters.

## ASkyBase availability

`Sky.h:16` declares `UCLASS(Abstract) class CARLA_API ASkyBase`. Abstract,
so `GetAllActorsOfClass<ASkyBase>` will find any BP-derived subclass spawned
in the level (BP_Sky / BP_DefaultSky / similar — the actual subclass placed
in each map). Pattern matches `Weather.cpp:44` already-used
`GetAllActorsOfClass(GetWorld(), ASceneCaptureCamera::StaticClass(), ...)`.

## Implementation paths (≥ 2 per harness §3 B→C gate)

### Path 1 — Edit BP_CarlaWeather event graph
Open BP in UE editor on GPU 2, repair the RefreshWeather event so it
writes Sun(Altitude/Azimuth)Angle into the SkyAtmosphere actor's
DirectionalLight. Ships as a .uasset diff.

Pros: matches the architectural intent (BP is the "weather→sky glue" layer).
Cons:
  - Cannot be edited from CLI; requires UE editor session on GPU 2.
  - .uasset binary diffs are opaque in code review.
  - Fragile: a future BP edit could re-break it.

### Path 2 — C++ fallback in AWeather::ApplyWeather (CHOSEN)
Add direct C++ propagation to ASkyBase actors' DirectionalLightComponentSun
+ SkyAtmosphereComponent before the BP `RefreshWeather` call. The BP
remains in place (and may continue to do other work like
post-process blendables) but no longer holds exclusive responsibility for
sun-pose propagation.

Pros:
  - Editable from CLI; reviewable in normal C++ diff.
  - Survives any BP edits; deterministic.
  - Aligns with existing pattern (Weather.cpp:44 already does
    GetAllActorsOfClass).
Cons:
  - Requires CarlaUnreal recompile (~10-20 min incremental).
  - Adds ~15 LOC to Weather.cpp.
  - Slightly duplicates logic if BP_CarlaWeather is ever fixed
    (acceptable; idempotent overwrite is fine).

### Decision: Path 2

The C++ fallback unblocks measurement on any checkout of the repo without
requiring a working UE editor session, makes the fix reviewable in this
PR, and is robust against future BP edits. Path 1 can land later as a
cleanup if someone repairs the BP — it would be a no-op overlay on top
of Path 2's deterministic C++ logic.

## Proposed C++ patch shape

```cpp
// In AWeather::ApplyWeather, before RefreshWeather(Weather):
TArray<AActor*> SkyActors;
UGameplayStatics::GetAllActorsOfClass(GetWorld(), ASkyBase::StaticClass(), SkyActors);
const float SunPitch = -Weather.SunAltitudeAngle;  // sun above horizon → light points down
const float SunYaw   = Weather.SunAzimuthAngle;
for (AActor* Actor : SkyActors)
{
  ASkyBase* Sky = Cast<ASkyBase>(Actor);
  if (!Sky) continue;
  if (Sky->DirectionalLightComponentSun)
  {
    Sky->DirectionalLightComponentSun->SetRelativeRotation(FRotator(SunPitch, SunYaw, 0.0f));
    // Daytime: sun on, moon off; nighttime inverse. Smooth crossover
    // around alt=0 with a 5° band so dusk reads correctly.
    const float DayFactor = FMath::Clamp((Weather.SunAltitudeAngle + 5.0f) / 10.0f, 0.0f, 1.0f);
    Sky->DirectionalLightComponentSun->SetIntensity(10.0f * DayFactor);
    if (Sky->DirectionalLightComponentMoon)
    {
      Sky->DirectionalLightComponentMoon->SetIntensity(0.5f * (1.0f - DayFactor));
    }
  }
}
```

`SkyAtmosphereComponent` updates intentionally NOT included this iteration —
they require the SkyAtmosphereComponent's `SetRayleighScattering` /
`SetMieScattering` API which is component-version-dependent. Sun rotation
+ intensity unblocks measurement; atmosphere param wiring can land in a
follow-up if numbers still miss (would queue as iter-engine-weather-atm).

## Phase C: SKIP

No assets needed.

## Phase D scope

Edit `Weather.cpp` only (+include for `ASkyBase`, +include for
`UDirectionalLightComponent`, +include for `Kismet/GameplayStatics.h`
already present).
