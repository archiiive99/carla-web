// Copyright (c) 2026 Computer Vision Center (CVC) at the Universitat Autonoma
// de Barcelona (UAB).
//
// This work is licensed under the terms of the MIT license.
// For a copy, see <https://opensource.org/licenses/MIT>.

#include "Carla/Weather/Weather.h"
#include "Carla.h"
#include "Carla/Sensor/SceneCaptureCamera.h"
#include "Carla/Weather/Sky.h"

#include <util/ue-header-guard-begin.h>
#include "Components/SceneCaptureComponent2D.h"
#include "Components/SkyLightComponent.h"
#include "Components/DirectionalLightComponent.h"
#include "Engine/DirectionalLight.h"
#include "Kismet/GameplayStatics.h"
#include "UObject/ConstructorHelpers.h"
#include <util/ue-header-guard-end.h>

AWeather::AWeather(const FObjectInitializer& ObjectInitializer)
    : Super(ObjectInitializer)
{
    PrecipitationPostProcessMaterial = ConstructorHelpers::FObjectFinder<UMaterial>(
        TEXT("Material'/Game/Carla/Static/GenericMaterials/FX/ScreenDust/M_screenDrops.M_screenDrops'")).Object;

    DustStormPostProcessMaterial = ConstructorHelpers::FObjectFinder<UMaterial>(
        TEXT("Material'/Game/Carla/Static/GenericMaterials/FX/ScreenDust/M_screenDust_wind.M_screenDust_wind'")).Object;

    PrimaryActorTick.bCanEverTick = false;
    RootComponent = ObjectInitializer.CreateDefaultSubobject<USceneComponent>(this, TEXT("RootComponent"));
}

void AWeather::CheckWeatherPostProcessEffects()
{
    if (Weather.Precipitation > 0.0f)
        ActiveBlendables.Add(MakeTuple(PrecipitationPostProcessMaterial, Weather.Precipitation / 100.0f));
    else
        ActiveBlendables.Remove(PrecipitationPostProcessMaterial);

    if (Weather.DustStorm > 0.0f)
        ActiveBlendables.Add(MakeTuple(DustStormPostProcessMaterial, Weather.DustStorm / 100.0f));
    else
        ActiveBlendables.Remove(DustStormPostProcessMaterial);

    TArray<AActor*> SensorActors;
    UGameplayStatics::GetAllActorsOfClass(GetWorld(), ASceneCaptureCamera::StaticClass(), SensorActors);
    for (AActor* SensorActor : SensorActors)
    {
        ASceneCaptureCamera* Sensor = Cast<ASceneCaptureCamera>(SensorActor);
        for (auto& ActiveBlendable : ActiveBlendables)
            Sensor->GetCaptureComponent2D()->PostProcessSettings.AddBlendable(ActiveBlendable.Key, ActiveBlendable.Value);
    }
}

void AWeather::ApplyWeather(const FWeatherParameters& InWeather)
{
    SetWeather(InWeather);
    CheckWeatherPostProcessEffects();

#ifdef CARLA_WEATHER_EXTRA_LOG
    UE_LOG(LogCarla, Log, TEXT("Changing weather:"));
    UE_LOG(LogCarla, Log, TEXT("  - Cloudiness = %.2f"), Weather.Cloudiness);
    UE_LOG(LogCarla, Log, TEXT("  - Precipitation = %.2f"), Weather.Precipitation);
    UE_LOG(LogCarla, Log, TEXT("  - PrecipitationDeposits = %.2f"), Weather.PrecipitationDeposits);
    UE_LOG(LogCarla, Log, TEXT("  - WindIntensity = %.2f"), Weather.WindIntensity);
    UE_LOG(LogCarla, Log, TEXT("  - SunAzimuthAngle = %.2f"), Weather.SunAzimuthAngle);
    UE_LOG(LogCarla, Log, TEXT("  - SunAltitudeAngle = %.2f"), Weather.SunAltitudeAngle);
    UE_LOG(LogCarla, Log, TEXT("  - FogDensity = %.2f"), Weather.FogDensity);
    UE_LOG(LogCarla, Log, TEXT("  - FogDistance = %.2f"), Weather.FogDistance);
    UE_LOG(LogCarla, Log, TEXT("  - FogFalloff = %.2f"), Weather.FogFalloff);
    UE_LOG(LogCarla, Log, TEXT("  - Wetness = %.2f"), Weather.Wetness);
    UE_LOG(LogCarla, Log, TEXT("  - ScatteringIntensity = %.2f"), Weather.ScatteringIntensity);
    UE_LOG(LogCarla, Log, TEXT("  - MieScatteringScale = %.2f"), Weather.MieScatteringScale);
    UE_LOG(LogCarla, Log, TEXT("  - RayleighScatteringScale = %.2f"), Weather.RayleighScatteringScale);
    UE_LOG(LogCarla, Log, TEXT("  - DustStorm = %.2f"), Weather.DustStorm);
#endif // CARLA_WEATHER_EXTRA_LOG

    // Call the blueprint that actually changes the weather.
    RefreshWeather(Weather);

    // C++ fallback: drive sun direction directly from FWeatherParameters.
    // Runs AFTER RefreshWeather so the C++ override has the last word.
    // Tries ASkyBase actors first (Carla custom sky framework); falls back
    // to engine-standard ADirectionalLight actors for maps like Town01_Opt
    // that don't use ASkyBase. iter-05 confirmed set_weather() succeeds in
    // libcarla but the rendered scene ignored sun-pose fields — this fix
    // makes propagation deterministic regardless of BP state. See
    // reports/iter-engine-weather-bp/investigation.md.
    {
        const float SunPitch = -Weather.SunAltitudeAngle;
        const float SunYaw = Weather.SunAzimuthAngle;
        const float DayFactor = FMath::Clamp((Weather.SunAltitudeAngle + 5.0f) / 10.0f, 0.0f, 1.0f);

        TArray<AActor*> SkyActors;
        UGameplayStatics::GetAllActorsOfClass(GetWorld(), ASkyBase::StaticClass(), SkyActors);
        int32 SkyHits = 0;
        for (AActor* Actor : SkyActors)
        {
            ASkyBase* Sky = Cast<ASkyBase>(Actor);
            if (!Sky) continue;
            if (UDirectionalLightComponent* SunLight = Sky->GetDirectionalLightSun())
            {
                SunLight->SetRelativeRotation(FRotator(SunPitch, SunYaw, 0.0f));
                SunLight->SetIntensity(10.0f * DayFactor);
                ++SkyHits;
            }
            if (UDirectionalLightComponent* MoonLight = Sky->GetDirectionalLightMoon())
            {
                MoonLight->SetIntensity(0.5f * (1.0f - DayFactor));
            }
        }

        // Fallback: drive any plain ADirectionalLight actors. Maps like
        // Town01_Opt place a stock ADirectionalLight as the sun without an
        // ASkyBase wrapper.
        TArray<AActor*> DirLights;
        UGameplayStatics::GetAllActorsOfClass(GetWorld(), ADirectionalLight::StaticClass(), DirLights);
        int32 DirHits = 0;
        for (AActor* Actor : DirLights)
        {
            ADirectionalLight* Light = Cast<ADirectionalLight>(Actor);
            if (!Light || !Light->GetLightComponent()) continue;
            // Only drive lights that look sun-shaped: not too dim, top-level
            // (no parent attachment). Skip any artist-placed accent lights.
            if (Light->GetAttachParentActor() != nullptr) continue;
            Light->SetActorRotation(FRotator(SunPitch, SunYaw, 0.0f));
            // Cast to UDirectionalLightComponent for SetIntensity (LightComponent base lacks it).
            if (UDirectionalLightComponent* DLC = Cast<UDirectionalLightComponent>(Light->GetLightComponent()))
            {
                DLC->SetIntensity(10.0f * DayFactor);
            }
            ++DirHits;
        }

        UE_LOG(LogCarla, Log, TEXT("AWeather::ApplyWeather C++ propagation: ASkyBase=%d DirLight=%d  SunPitch=%.1f SunYaw=%.1f DayFactor=%.2f"),
               SkyHits, DirHits, SunPitch, SunYaw, DayFactor);
    }
}

void AWeather::NotifyWeather(ASensor* Sensor)
{
    CheckWeatherPostProcessEffects();

    // Call the blueprint that actually changes the weather.
    RefreshWeather(Weather);
}

void AWeather::SetWeather(const FWeatherParameters& InWeather)
{
    Weather = InWeather;
}

void AWeather::SetDayNightCycle(const bool& active)
{
    DayNightCycle = active;
}

#if WITH_EDITOR
void AWeather::PostEditChangeProperty(FPropertyChangedEvent& PropertyChangedEvent)
{
    Super::PostEditChangeProperty(PropertyChangedEvent);
    ApplyWeather(Weather);
}
#endif
