// Building model registry: fragment of the CARLA env-object name →
// exported UE glTF. Matched substring-wise by getBuildingModelPath().
// Kept separate so the lookup logic (~20 lines) isn't buried under a
// ~100-entry table.

const ASSET_BASE = "/assets/carla"
function assetPath(file: string) {
  return `${ASSET_BASE}/${file}`
}

export const BUILDING_MODELS: Record<string, string> = {
  // Apartments
  "Apt01":        assetPath("Building_SM_Apt01_C.glb"),        // 565 KB
  "Apt04":        assetPath("Building_SM_Apt04_A.glb"),        // 203 KB
  "Apt05":        assetPath("Building_SM_Apt05_A.glb"),        // 200 KB
  "Apt07":        assetPath("Building_SM_Apt07_A.glb"),        // 240 KB
  "Apt08":        assetPath("Building_SM_Apt08_A.glb"),        // 188 KB
  "Apt09":        assetPath("Building_SM_Apt09.glb"),          // 1.8 MB
  "Apt10":        assetPath("Building_SM_Apt10.glb"),          // 2.6 MB
  "Apt11":        assetPath("Building_SM_Apt11.glb"),          // 5.1 MB
  "Apt12":        assetPath("Building_SM_Apt12_A.glb"),        // 578 KB
  "Apt13":        assetPath("Building_SM_Apt13.glb"),          // 856 KB
  "Apt14":        assetPath("Building_SM_Apt14.glb"),          // 1.3 MB
  "Apt15":        assetPath("Building_SM_Apt15_A.glb"),        // 8 KB
  "Apt18":        assetPath("Building_SM_Apt18_A.glb"),        // 2.1 MB
  "Apt19":        assetPath("Building_SM_Apt19_A.glb"),        // 492 KB
  "Apt20":        assetPath("Building_SM_Apt20_A.glb"),        // 381 KB
  "Apt21":        assetPath("Building_SM_Apt21_A.glb"),        // 2.7 MB
  "Apt22":        assetPath("Building_SM_Apt22.glb"),          // 3.7 MB
  "Apt23":        assetPath("Building_SM_Apt23.glb"),          // 1.5 MB
  "Apt24":        assetPath("Building_SM_Apt24_A.glb"),        // 5.2 MB
  "Apt25":        assetPath("Building_SM_Apt25_E.glb"),        // 1.6 MB
  "Apt26":        assetPath("Building_SM_Apt26_A.glb"),        // 7 MB
  "Apt27":        assetPath("Building_SM_Apt27_A.glb"),        // 8.8 MB
  "Apt28":        assetPath("Building_SM_Apt28_A.glb"),        // 8.5 MB
  "Apt29":        assetPath("Building_SM_Apt29_E.glb"),        // 6.9 MB
  "Apt30":        assetPath("Building_SM_Apt30_E_Corner.glb"), // 9.8 MB
  "Apt31":        assetPath("Building_SM_Apt31_C.glb"),        // 9.6 MB
  "Apt32":        assetPath("Building_SM_Apt32_B.glb"),        // 3.1 MB
  "Apt33":        assetPath("Building_SM_Apt33_A.glb"),        // 46.8 MB
  "Apt34":        assetPath("Building_SM_Apt34_A.glb"),        // 17 MB
  "Apt35":        assetPath("Building_SM_Apt35_A.glb"),        // 36.5 MB

  // Houses
  "House01":      assetPath("Building_SM_House01.glb"),        // 133 KB
  "House02":      assetPath("Building_SM_House02.glb"),        // 163 KB
  "House03":      assetPath("Building_SM_House03.glb"),        // 108 KB
  "House04":      assetPath("Building_SM_House04.glb"),        // 189 KB
  "House05":      assetPath("Building_SM_House05_B.glb"),      // 249 KB
  "House06":      assetPath("Building_SM_House06.glb"),        // 176 KB
  "House07":      assetPath("Building_SM_House07_A.glb"),      // 75 KB
  "House08":      assetPath("Building_SM_House08.glb"),        // 593 KB
  "House09":      assetPath("Building_SM_House09.glb"),        // 375 KB
  "House10":      assetPath("Building_SM_House10.glb"),        // 155 KB
  "House11":      assetPath("Building_SM_House11.glb"),        // 230 KB
  "House12":      assetPath("Building_SM_House12_A.glb"),      // 110 KB
  "House13":      assetPath("Building_SM_House_13.glb"),       // 246 KB
  "House_13":     assetPath("Building_SM_House_13.glb"),       // 246 KB
  "House14":      assetPath("Building_SM_House14_C.glb"),      // 58 KB
  "House15":      assetPath("Building_SM_House15_A.glb"),      // 143 KB
  "House16":      assetPath("Building_SM_House16.glb"),        // 977 KB
  "House17":      assetPath("Building_SM_House17_A.glb"),      // 1.3 MB
  "House18":      assetPath("Building_SM_House18_A.glb"),      // 1.5 MB

  // Skyscrapers
  "Skysc01":      assetPath("Building_SM_Skysc01.glb"),        // 6 KB
  "Skysc02":      assetPath("Building_SM_Skysc02.glb"),        // 9 KB
  "Skysc03":      assetPath("Building_SM_Skysc03.glb"),        // 13 KB
  "Skysc04":      assetPath("Building_SM_Skysc04_A.glb"),      // 18 KB
  "Skysc05":      assetPath("Building_SM_Skysc05.glb"),        // 17 KB
  "Skysc06":      assetPath("Building_SM_Skysc06.glb"),        // 8 KB
  "Skysc07":      assetPath("Building_SM_Skysc07.glb"),        // 4.5 MB
  "Skysc08":      assetPath("Building_SM_Skysc08.glb"),        // 1.6 MB
  "Skysc09":      assetPath("Building_SM_Skysc09.glb"),        // 2.5 MB
  "Skysc10":      assetPath("Building_SM_Skysc10.glb"),        // 1.5 MB
  "Skysc11":      assetPath("Building_SM_Skysc11.glb"),        // 1.3 MB
  "Skysc12":      assetPath("Building_SM_Skysc12.glb"),        // 4.6 MB
  "Skysc13":      assetPath("Building_SM_Skysc13_A.glb"),      // 7.3 MB
  "Skysc14":      assetPath("Building_SM_Skysc14_A.glb"),      // 5.7 MB
  "Skysc15":      assetPath("Building_SM_Skysc15_B.glb"),      // 5 MB
  "Skysc16":      assetPath("Building_SM_Skysc16_C.glb"),      // 6.6 MB
  "Skysc17":      assetPath("Building_SM_Skysc17_B.glb"),      // 7.5 MB

  // Commercial / civic
  "GasStation":   assetPath("Building_SM_GasStation.glb"),     // 426 KB
  "Church":       assetPath("Building_SM_Church.glb"),         // 235 KB
  "Construction": assetPath("Building_SM_Construction.glb"),   // 343 KB
  "Factory01":    assetPath("Building_SM_Factory01.glb"),      // 323 KB
  "Factory02":    assetPath("Building_SM_Factory02.glb"),      // 268 KB
  "Factory03":    assetPath("Building_SM_Factory03.glb"),      // 593 KB
  "Farm01":       assetPath("Building_SM_farm01.glb"),         // 209 KB
  "Farm02":       assetPath("Building_SM_farm02.glb"),         // 100 KB
  "Farm03":       assetPath("Building_SM_Farm03.glb"),         // 223 KB
  "Farm04":       assetPath("Building_SM_Farm04.glb"),         // 102 KB
  "farm_windmill":assetPath("Building_SM_farm_windmill.glb"),  // 196 KB
  "Garage":       assetPath("Building_SM_Garage.glb"),         // 24 KB
  "GuardShelter": assetPath("Building_SM_GuardShelter.glb"),   // 86 KB
  "HotelHall":    assetPath("Building_SM_HotelHall_Opt.glb"), // 19 KB
  "HumanHall":    assetPath("Building_SM_HumanHall.glb"),      // 3.7 MB
  "Kiosk01":      assetPath("Building_SM_Kiosk01.glb"),        // 50 KB
  "Kiosk02":      assetPath("Building_SM_Kiosk02.glb"),        // 55 KB
  "Kiosk03":      assetPath("Building_SM_Kiosk03_A.glb"),      // 30 KB
  "Mansion01":    assetPath("Building_SM_Mansion01.glb"),      // 221 KB
  "Mansion02":    assetPath("Building_SM_Mansion02.glb"),      // 275 KB
  "Mansion03":    assetPath("Building_SM_Mansion03.glb"),      // 230 KB
  "Mansion04":    assetPath("Building_SM_Mansion04.glb"),      // 323 KB
  "Museum01":     assetPath("Building_SM_Museum01.glb"),       // 717 KB
  "Museum02":     assetPath("Building_SM_Museum02.glb"),       // 785 KB
  "Parking":      assetPath("Building_SM_Parking.glb"),        // 386 KB
  "ParkingRamp":  assetPath("Building_SM_ParkingRamp.glb"),    // 648 KB
  "VillaLarge":   assetPath("Building_SM_VillaLarge.glb"),     // 1.5 MB
  "VillaSmall":   assetPath("Building_SM_VillaSmall.glb"),     // 669 KB
  "Crag":         assetPath("Building_SM_Crag.glb"),           // 2.6 MB
  "CvC":          assetPath("Building_SM_CvC.glb"),            // 2.2 MB
  "Block05":      assetPath("Building_SM_Block05_A.glb"),      // 200 KB
  "BridgeSupport":assetPath("Building_BridgeSupport.glb"),     // 41 KB
  "Pier01":       assetPath("Building_Pier01.glb"),            // 71 KB
  "medicineBuilding01": assetPath("Building_SM_medicineBuilding01.glb"), // 2.3 MB
  "medicineBuilding02": assetPath("Building_SM_medicineBuilding02.glb"), // 2.3 MB
  "medicineBuilding03": assetPath("Building_SM_medicineBuilding03.glb"), // 2.1 MB
}

