/**
 * CarlaAssetLoader — maps CARLA type_ids and environment categories
 * to glTF Binary (.glb) files in /public/assets/carla/.
 *
 * Also provides preloading helpers so meshes are ready before they
 * appear in the scene.
 *
 * Covers 462 exported glTF assets from the CARLA UE5 project.
 */

import { useGLTF } from "@react-three/drei"

// ---------- base path ----------

const ASSET_BASE = "/assets/carla"

function assetPath(file: string) {
  return `${ASSET_BASE}/${file}`
}

// ---------- vehicle model map ----------
// Maps CARLA type_id strings to exported CARLA/UE .glb file paths.
// Keep this map source-truthful: do not add lookalike substitutions for
// unrelated models just to avoid missing renders.


import { VEHICLE_MODELS } from "./carla-assets/vehicle-models"
export { VEHICLE_MODELS } from "./carla-assets/vehicle-models"


// ---------- vegetation model pool ----------
// Expanded from 4 to 12 tree models (skip files > 50 MB).

// Only textured variants. Export pipeline produces these on re-export with full RHI.
export const VEGETATION_MODELS = [
  assetPath("Vegetation_SM_Platanus03.glb"),         // textured (3 imgs)
  assetPath("Vegetation_SM_Cypress.glb"),            // textured (2 imgs)
  assetPath("Vegetation_SM_Cypress01_L_A.glb"),      // textured (3 imgs)
  assetPath("Vegetation_SM_Ash01_A.glb"),            // textured (3 imgs, 4.3MB)
]

// ---------- traffic models ----------

export const TRAFFIC_LIGHT_MODELS = [
  assetPath("TrafficLight_Horizontal.glb"),          // 71 KB
  assetPath("TrafficLight_Crosswalk.glb"),           // 91 KB
  assetPath("TrafficLight_SM_Crosswalk.glb"),        // 58 KB
  assetPath("TrafficLight_SM_Signal01_A.glb"),       // 26 KB
  assetPath("TrafficLight_SM_Signal01_C.glb"),       // 26 KB
  assetPath("TrafficLight_SM_Signal02_A.glb"),       // 67 KB
  assetPath("TrafficLight_SM_Pedestrian01_B.glb"),   // 25 KB
  assetPath("TrafficLight_SM_PushButton01.glb"),     // 12 KB
  assetPath("TrafficLight_SM_Holster01.glb"),        // 20 KB
  assetPath("TrafficLight_SM_Pole03.glb"),           // 10 KB
  assetPath("TrafficLight_SM_Pole04.glb"),           // 12 KB
]

// Keep single-model exports for backward compatibility
export const TRAFFIC_LIGHT_MODEL = assetPath("TrafficLight_Horizontal.glb")
export const TRAFFIC_LIGHT_CROSSWALK_MODEL = assetPath("TrafficLight_Crosswalk.glb")

export const TRAFFIC_SIGN_MODELS = [
  assetPath("TrafficSign_NoStopping.glb"),           // 120 KB
  assetPath("TrafficSign_SM_AllTraffic01_A.glb"),    // 13 KB
  assetPath("TrafficSign_SM_BikeSign01.glb"),        // 10 KB
  assetPath("TrafficSign_SM_Crosswalk01.glb"),       // 11 KB
  assetPath("TrafficSign_SM_DoNoEnter01.glb"),       // 6 KB
  assetPath("TrafficSign_SM_Highway01.glb"),         // 3 KB
  assetPath("TrafficSign_SM_Highway02.glb"),         // 7 KB
  assetPath("TrafficSign_SM_NoStopping02_B.glb"),    // 120 KB
  assetPath("TrafficSign_SM_NoTrucks01.glb"),        // 37 KB
  assetPath("TrafficSign_SM_OneWay02_R.glb"),        // 28 KB
  assetPath("TrafficSign_SM_Parking07.glb"),         // 19 KB
  assetPath("TrafficSign_SM_PedestrianStop01.glb"),  // 11 KB
  assetPath("TrafficSign_SM_RoundSign.glb"),         // 20 KB
  assetPath("TrafficSign_SM_School01.glb"),          // 11 KB
  assetPath("TrafficSign_SM_StopSignAhead01.glb"),   // 18 KB
  assetPath("TrafficSign_SM_UabSign_Head_01.glb"),   // 11 KB
]

export const TRAFFIC_SIGN_MODEL = assetPath("TrafficSign_NoStopping.glb")

export const STREETLIGHT_BOLLARD_MODEL = assetPath("StreetLight_Bollard.glb")
export const STREETLIGHT_FREEWAY_MODEL = assetPath("StreetLight_Freeway.glb")

export const POLE_MODELS = [
  assetPath("Pole_Electric.glb"),                    // 130 KB
  assetPath("Pole_SM_DoblePole01.glb"),              // 27 KB
  assetPath("Pole_SM_ElectricPole01_A.glb"),         // 22 KB
  assetPath("Pole_SM_ElectricPole01_B.glb"),         // 22 KB
  assetPath("Pole_SM_Flag_Tall.glb"),                // 19 KB
  assetPath("Pole_SM_Highway06_Pole.glb"),           // 71 KB
  assetPath("Pole_SM_Pole01.glb"),                   // 4 KB
  assetPath("Pole_SM_Pole02.glb"),                   // 21 KB
  assetPath("Pole_SM_Pole03.glb"),                   // 22 KB
  assetPath("Pole_SM_Pole04.glb"),                   // 4 KB
  assetPath("Pole_SM_Pole10.glb"),                   // 13 KB
  assetPath("Pole_SM_ReflectiveBollard01.glb"),      // 23 KB
  assetPath("Pole_SM_TrafficLightBase01.glb"),       // 54 KB
  assetPath("Pole_SM_TrafficLightPole02.glb"),       // 64 KB
]

export const POLE_ELECTRIC_MODEL = assetPath("Pole_Electric.glb")

// ---------- infrastructure models ----------

export const GUARD_RAIL_MODELS = [
  assetPath("GuardRail.glb"),                        // 37 KB
  assetPath("GuardRail_SM_GuardRail_high.glb"),      // 127 KB
  assetPath("GuardRail_SM_Guardrail.glb"),           // 38 KB
  assetPath("GuardRail_SM_Guardrail02.glb"),         // 50 KB
  assetPath("GuardRail_SM_Guardrail_UAB.glb"),       // 38 KB
  assetPath("GuardRail_SM_SecFence01.glb"),          // 8 KB
  assetPath("GuardRail_SM_SecFence02.glb"),          // 10 KB
  assetPath("GuardRail_SM_SecFence03.glb"),          // 41 KB
  assetPath("GuardRail_SM_SecWaterDrums01.glb"),     // 10 KB
]

export const GUARD_RAIL_MODEL = assetPath("GuardRail.glb")

export const FENCE_MODELS = [
  assetPath("Fence_SM_Fence01.glb"),                 // 15 KB
  assetPath("Fence_SM_Fence02_B.glb"),               // 30 KB
  assetPath("Fence_SM_FenceCorner.glb"),             // 30 KB
  assetPath("Fence_SM_FenceMiddle.glb"),             // 28 KB
  assetPath("Fence_SM_FenceWood.glb"),               // 28 KB
  assetPath("Fence_SM_UrbanFence02.glb"),            // 15 KB
  assetPath("Fence_SM_Wall01.glb"),                  // 5 KB
  assetPath("Fence_SM_Wall02.glb"),                  // 33 KB
  assetPath("Fence_SM_WireFence.glb"),               // 17 KB
  assetPath("Fence_SM_fence03_A.glb"),               // 21 KB
  assetPath("Fence_SM_fence04_A.glb"),               // 26 KB
  assetPath("Fence_SM_fence05_A.glb"),               // 9 KB
  assetPath("Fence_SM_fence06_B.glb"),               // 26 KB
  assetPath("Fence_SM_fence07_A.glb"),               // 5 KB
  assetPath("Fence_Wired.glb"),                      // 1.5 MB
  assetPath("Fence_SM_Wired_Fence.glb"),             // 1.5 MB
]

export const FENCE_WIRED_MODEL = assetPath("Fence_Wired.glb")

export const ROCK_MODELS = [
  assetPath("Rock_01F.glb"),                         // 176 KB
  assetPath("Rock_SM_Rock01_A.glb"),                 // 182 KB
  assetPath("Rock_SM_Rock01_D.glb"),                 // 189 KB
  assetPath("Rock_SM_Rock01_E.glb"),                 // 217 KB
  assetPath("Rock_SM_Rock01_H.glb"),                 // 191 KB
  assetPath("Rock_SM_Rock02_A.glb"),                 // 68 KB
  assetPath("Rock_SM_Rock02_C.glb"),                 // 48 KB
  assetPath("Rock_SM_Rock03_A.glb"),                 // 20 KB
  assetPath("Rock_SM_Rock04_A.glb"),                 // 195 KB
]

export const ROCK_MODEL = assetPath("Rock_01F.glb")

export const WALL_MODELS = [
  assetPath("Wall_Town01.glb"),                      // 3.2 MB
  assetPath("Wall_Fountain.glb"),                    // 225 KB
  assetPath("Wall_SM_ParkWallCorner.glb"),           // 47 KB
  assetPath("Wall_SM_Town01_Wall01_Part1.glb"),      // 38 KB
  assetPath("Wall_SM_Town01_Wall02.glb"),            // 234 KB
  assetPath("Wall_SM_Town01_Wall03.glb"),            // 211 KB
  assetPath("Wall_SM_Town01_Wall04.glb"),            // 3.2 MB
  assetPath("Wall_SM_Town01_Wall05.glb"),            // 257 KB
  assetPath("Wall_SM_Wall06.glb"),                   // 8 KB
  assetPath("Wall_SM_WallHighWay_1.glb"),            // 3 KB
  assetPath("Wall_SM_fountainBig_T03.glb"),          // 226 KB
]

export const WALL_TOWN_MODEL = assetPath("Wall_Town01.glb")
export const WALL_FOUNTAIN_MODEL = assetPath("Wall_Fountain.glb")
export const WATER_SEA_MODEL = assetPath("Water_Sea.glb")

// ---------- road models ----------

export const ROAD_PART_MODEL = assetPath("Road_Part3.glb")
export const SIDEWALK_MODEL = assetPath("SideWalk_V2.glb")
export const SIDEWALK_CURB_MODEL = assetPath("SideWalk_CurbWidth.glb")

// ---------- building model lookup ----------
// Maps normalized substrings from CARLA env object names to .glb files.
// Building env objects use names like "Bl_CityBuilding_GasStation_43_SM_0".
// We extract parts like "GasStation", "Apt09", "House01", "Factory01" etc.
// Only models under 50 MB are included.

import { BUILDING_MODELS } from "./carla-assets/building-models"
export { BUILDING_MODELS } from "./carla-assets/building-models"

// Keep backward compat
export const BUILDING_BRIDGE_MODEL = assetPath("Building_BridgeSupport.glb")
export const BUILDING_PIER_MODEL = assetPath("Building_Pier01.glb")

// ---------- bridge models ----------

export const BRIDGE_MODELS = [
  assetPath("Bridge_SM_Beam01.glb"),                 // 3 KB
  assetPath("Bridge_SM_BridgeSupport01.glb"),        // 41 KB
  assetPath("Bridge_SM_BridgeSupport02_A.glb"),      // 14 KB
  assetPath("Bridge_SM_BridgeSupport02_B.glb"),      // 14 KB
  assetPath("Bridge_SM_BridgeSupport02_C.glb"),      // 27 KB
  assetPath("Bridge_SM_Pier01.glb"),                 // 71 KB
  assetPath("Bridge_SM_Pier01_Square.glb"),          // 607 KB
]

// ---------- static / streetlight models ----------

export const STATIC_STREETLIGHT_MODELS = [
  assetPath("Static_SM_HighwayLight01.glb"),         // 35 KB
  assetPath("Static_SM_HighwayLight02.glb"),         // 63 KB
  assetPath("Static_SM_SpotLight01.glb"),            // 11 KB
  assetPath("Static_SM_StreetLight01.glb"),          // 33 KB
  assetPath("Static_SM_StreetLight02.glb"),          // 56 KB
  assetPath("Static_SM_StreetLight03.glb"),          // 55 KB
  assetPath("Static_SM_StreetLight05.glb"),          // 21 KB
  assetPath("Static_SM_StreetLight06.glb"),          // 81 KB
  assetPath("Static_SM_StreetLight07.glb"),          // 33 KB
  // Skipping StreetLight04 at 8.5 MB
  assetPath("StreetLight_Bollard.glb"),              // 18 KB
  assetPath("StreetLight_Freeway.glb"),              // 14 KB
  assetPath("StreetLight_SM_Bollard01.glb"),         // 19 KB
  assetPath("StreetLight_SM_FreewayLights01.glb"),   // 14 KB
]

// ---------- dynamic / street furniture models ----------

export const DYNAMIC_MODELS = [
  assetPath("Dynamic_DirtDebris.glb"),               // 87 KB
  assetPath("Dynamic_SM_Barrel.glb"),                // 9 KB
  assetPath("Dynamic_SM_CreasedBox01.glb"),          // 14 KB
  assetPath("Dynamic_SM_RoadBlocker_03.glb"),        // 122 KB
  assetPath("Dynamic_SM_StreetBarrier.glb"),         // 30 KB
  assetPath("Dynamic_SM_TrafficCones_01.glb"),       // 64 KB
  assetPath("Dynamic_SM_TrafficCones_02.glb"),       // 8 KB
  assetPath("Dynamic_SM_TrafficCones_03.glb"),       // 76 KB
  assetPath("Dynamic_SM_WarningConstruction.glb"),   // 31 KB
]

// ---------- helper: find vehicle model path ----------

export type VehicleModelResolution = {
  path: string | null
  exact: boolean
  note: string
}

export function resolveVehicleModel(typeId: string): VehicleModelResolution {
  // Direct match only. We intentionally avoid partial/category substitutions
  // because they look plausible while being visually wrong relative to CARLA.
  if (VEHICLE_MODELS[typeId]) {
    return {
      path: VEHICLE_MODELS[typeId],
      exact: true,
      note: "direct asset match",
    }
  }

  return {
    path: null,
    exact: false,
    note: "no direct asset mapping",
  }
}

export function getVehicleModelPath(typeId: string): string | null {
  return resolveVehicleModel(typeId).path
}

// ---------- helper: find building model path from env object name ----------

export function getBuildingModelPath(objectName: string): string | null {
  // CARLA env object names look like:
  //   "Bl_CityBuilding_GasStation_43_SM_0"
  //   "BP_ApartmentBlock_Apt09_0"
  //   "SM_House01_12"
  // We try to match known keys from BUILDING_MODELS.

  // Try longest keys first (more specific matches) by sorting descending
  const keys = Object.keys(BUILDING_MODELS).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    if (objectName.includes(key)) return BUILDING_MODELS[key]
  }

  return null
}

// ---------- preload critical models ----------
// Calling useGLTF.preload() starts downloading immediately
// so models are cached before they are first rendered.

// Preload the small sc (simplified collision) vehicle models
const PRELOAD_VEHICLE_MODELS = [
  VEHICLE_MODELS["vehicle.audi.tt"],                // 144 KB
  VEHICLE_MODELS["vehicle.tesla.cybertruck"],       // 2 MB
  VEHICLE_MODELS["vehicle.dodge.charger_2020"],     // 104 KB
  VEHICLE_MODELS["vehicle.toyota.prius"],           // 87 KB
  VEHICLE_MODELS["vehicle.ford.mustang"],           // 79 KB
  VEHICLE_MODELS["vehicle.harley-davidson.low_rider"], // 79 KB
  VEHICLE_MODELS["vehicle.diamondback.century"],    // 87 KB
]

const PRELOAD_ENVIRONMENT_MODELS = [
  ...VEGETATION_MODELS,    // trees (12 variants)
  TRAFFIC_LIGHT_MODEL,     // traffic lights
  TRAFFIC_SIGN_MODEL,      // traffic signs
  POLE_ELECTRIC_MODEL,     // poles
  GUARD_RAIL_MODEL,        // guard rails
  ROCK_MODEL,              // rocks
]

// De-duplicate before preloading
const allPreload = [...new Set([...PRELOAD_VEHICLE_MODELS, ...PRELOAD_ENVIRONMENT_MODELS])]
for (const path of allPreload) {
  useGLTF.preload(path)
}
