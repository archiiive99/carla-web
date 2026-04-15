#pragma once

#include <util/ue-header-guard-begin.h>
#include "GameFramework/Actor.h"
#include <util/ue-header-guard-end.h>

#include "Sky.generated.h"

class UPostProcessComponent;
class UExponentialHeightFogComponent;
class UDirectionalLightComponent;
class USkyLightComponent;
class UVolumetricCloudComponent;
class USkyAtmosphereComponent;

UCLASS(Abstract)
class CARLA_API ASkyBase :
	public AActor
{
	GENERATED_BODY()

public:

	ASkyBase(const FObjectInitializer& ObjectInitializer);

	// Public accessors for the protected component pointers. Allows AWeather
	// (and other engine code) to drive the sun/moon directional lights
	// directly from FWeatherParameters when the BP_CarlaWeather event chain
	// is broken or absent. See Weather.cpp AWeather::ApplyWeather.
	UDirectionalLightComponent* GetDirectionalLightSun() const { return DirectionalLightComponentSun; }
	UDirectionalLightComponent* GetDirectionalLightMoon() const { return DirectionalLightComponentMoon; }

protected:

	UPROPERTY(VisibleAnywhere, BlueprintReadWrite, Category = "Components")
	UPostProcessComponent* PostProcessComponent;

	UPROPERTY(VisibleAnywhere, BlueprintReadWrite, Category = "Components")
	UExponentialHeightFogComponent* ExponentialHeightFogComponent;

	UPROPERTY(VisibleAnywhere, BlueprintReadWrite, Category = "Components")
	UDirectionalLightComponent* DirectionalLightComponentSun;

	UPROPERTY(VisibleAnywhere, BlueprintReadWrite, Category = "Components")
	UDirectionalLightComponent* DirectionalLightComponentMoon;

	UPROPERTY(VisibleAnywhere, BlueprintReadWrite, Category = "Components")
	USkyLightComponent* SkyLightComponent;

	UPROPERTY(VisibleAnywhere, BlueprintReadWrite, Category = "Components")
	UVolumetricCloudComponent* VolumetricCloudComponent;

	UPROPERTY(VisibleAnywhere, BlueprintReadWrite, Category = "Components")
	USkyAtmosphereComponent* SkyAtmosphereComponent;


};
