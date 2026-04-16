// Vehicle model registry: CARLA type_id → exported UE glTF. Kept separate
// from CarlaAssetLoader so the loader stays compact and this table can grow
// without drowning out the lookup/preload logic.

const ASSET_BASE = "/assets/carla"
function assetPath(file: string) {
  return `${ASSET_BASE}/${file}`
}

export const VEHICLE_MODELS: Record<string, string> = {
  // ---- Cars ----
  "vehicle.audi.tt":                    assetPath("Car_SM_AudiTT_Parked.glb"),    // textured
  "vehicle.audi.a2":                    assetPath("Car_SM_sc_AudiA2.glb"),        // 105 KB
  "vehicle.audi.etron":                 assetPath("Car_SM_sc_Etron.glb"),         // 78 KB
  "vehicle.bmw.grandtourer":            assetPath("Car_SM_sc_BMWGranTourer.glb"), // 116 KB
  "vehicle.bmw.isetta":                 assetPath("Car_SM_BMWIsetta_Parked.glb"),     // textured
  "vehicle.chevrolet.impala":           assetPath("Car_SM_ChevroletImpala_Parked.glb"), // textured
  "vehicle.citroen.c3":                 assetPath("Car_SM_CitroenC3_Parked.glb"),     // textured
  "vehicle.tesla.cybertruck":           assetPath("Car_SM_Cybertruck_Parked.glb"),    // textured
  "vehicle.dodge.charger_2020":         assetPath("Car_SM_DodgeCharger_Parked.glb"),  // textured
  "vehicle.dodge.charger_police":       assetPath("Car_SM_DodgeChargerCop_Parked.glb"), // textured
  "vehicle.dodge.charger_police_2020":  assetPath("Car_SM_DodgeChargerCop_Parked.glb"), // textured
  "vehicle.ford.crown":                 assetPath("Car_SM_FordCrown01_Parked.glb"),   // textured
  "vehicle.ford.crown_2":               assetPath("Car_SM_FordCrown02_Parked.glb"), // textured
  "vehicle.ford.mustang":               assetPath("Car_SM_Mustang_Parked.glb"),   // textured
  "vehicle.jeep.wrangler_rubicon":      assetPath("Car_SM_JeepWranglerRubicon_Parked.glb"), // textured
  "vehicle.lincoln.mkz_2017":           assetPath("Car_SM_LincolnMKZ_Parked.glb"), // textured
  "vehicle.lincoln.mkz_2020":           assetPath("Car_SM_LincolnMKZ_Parked.glb"), // textured
  "vehicle.mercedes.coupe":             assetPath("Car_SM_MercedesCCC_Parked.glb"), // textured
  "vehicle.mercedes.coupe_2020":        assetPath("Car_SM_MercedesCCC_Parked.glb"), // textured
  "vehicle.mini.cooper_s":              assetPath("Car_SM_MiniCooper_Parked.glb"), // textured
  "vehicle.mini.cooper_s_2021":         assetPath("Car_SM_MiniCooper_Parked.glb"), // textured
  "vehicle.nissan.micra":               assetPath("Car_SM_sc_NissanMicra.glb"),     // direct compact-car asset
  "vehicle.nissan.patrol":              assetPath("Car_SM_NissanPatrol_Parked.glb"), // textured
  "vehicle.nissan.patrol_2021":         assetPath("Car_SM_NissanPatrol_Parked.glb"), // textured
  "vehicle.seat.leon":                  assetPath("Car_SM_SeatLeon_Parked.glb"),  // textured
  "vehicle.tesla.model3":               assetPath("Car_SM_sc_TeslaM3.glb"),         // direct simplified Model 3 asset
  "vehicle.toyota.prius":               assetPath("Car_SM_ToyotaPrius_Parked.glb"), // textured
  "vehicle.mini.cooper_s_old":          assetPath("Car_SM_MiniCooper_Old_Parked.glb"), // textured

  // ---- Trucks / Vans ----
  "vehicle.carlamotors.carlacola":      assetPath("Truck_SM_sc_Carlacola.glb"),   // 65 KB
  "vehicle.carlamotors.european_hgv":   assetPath("Truck_SM_sc_EuropeanHGV.glb"), // 50 KB
  "vehicle.carlamotors.firetruck":      assetPath("Truck_SM_sc_ActrosFiretruck.glb"), // 43 KB
  "vehicle.ford.ambulance":             assetPath("Truck_SM_sc_Ambulance.glb"),   // 53 KB
  "vehicle.mercedes.sprinter":          assetPath("Truck_SM_sc_MercedesSprinter.glb"), // 92 KB
  "vehicle.volkswagen.t2":              assetPath("Truck_SM_sc_VolkswagenT2.glb"), // 30 KB
  "vehicle.volkswagen.t2_2021":         assetPath("Truck_SM_sc_VolkswagenT2.glb"), // 30 KB

  // ---- Buses ----
  "vehicle.mitsubishi.fusorosa":        assetPath("Bus_SM_SC_MitsubishiFusoRosa.glb"), // 29 KB

  // ---- Motorcycles (textured) ----
  "vehicle.harley-davidson.low_rider":  assetPath("Motorcycle_SM_Harley.glb"),         // textured (14 imgs)
  "vehicle.kawasaki.ninja":             assetPath("Motorcycle_SM_KawasakiNinja.glb"),  // textured (14 imgs)
  "vehicle.yamaha.yzf":                 assetPath("Motorcycle_SM_Yamaha.glb"),         // textured (5 imgs)
  "vehicle.vespa.zx125":                assetPath("Motorcycle_SM_Vespa.glb"),          // textured (18 imgs)

  // ---- Bicycles ----
  "vehicle.diamondback.century":        assetPath("Bicycle_SM_RoadBike.glb"),       // textured (4 imgs)

  // ---- Tazzari (micro EV) ----
  "vehicle.micro.tazzari":              assetPath("Car_SM_Tazzari.glb"),          // 3.4 MB

  // iter-03-revisit-coverage: aliases for CARLA 0.10's re-shaped
  // blueprint namespace (vehicle.<make>.<model> reorganized into
  // vehicle.<role>.<make> and vehicle.ue4.<make>.<model>). Each entry
  // points at the same underlying GLB the canonical name maps to —
  // the silhouette is correct, only the blueprint identifier changed.
  "vehicle.ambulance.ford":             assetPath("Truck_SM_sc_Ambulance.glb"),
  "vehicle.carlacola.actors":           assetPath("Truck_SM_sc_Carlacola.glb"),
  "vehicle.dodge.charger":              assetPath("Car_SM_DodgeCharger_Parked.glb"),
  "vehicle.dodgecop.charger":           assetPath("Car_SM_DodgeChargerCop_Parked.glb"),
  "vehicle.firetruck.actors":           assetPath("Truck_SM_sc_ActrosFiretruck.glb"),
  "vehicle.fuso.mitsubishi":            assetPath("Bus_SM_SC_MitsubishiFusoRosa.glb"),
  "vehicle.lincoln.mkz":                assetPath("Car_SM_LincolnMKZ_Parked.glb"),
  "vehicle.mini.cooper":                assetPath("Car_SM_MiniCooper_Parked.glb"),
  "vehicle.sprinter.mercedes":          assetPath("Truck_SM_sc_MercedesSprinter.glb"),
  "vehicle.taxi.ford":                  assetPath("Car_SM_FordCrown01_Parked.glb"),
  "vehicle.ue4.audi.tt":                assetPath("Car_SM_AudiTT_Parked.glb"),
  "vehicle.ue4.bmw.grantourer":         assetPath("Car_SM_sc_BMWGranTourer.glb"),
  "vehicle.ue4.chevrolet.impala":       assetPath("Car_SM_ChevroletImpala_Parked.glb"),
  "vehicle.ue4.ford.crown":             assetPath("Car_SM_FordCrown01_Parked.glb"),
  "vehicle.ue4.ford.mustang":           assetPath("Car_SM_Mustang_Parked.glb"),
  "vehicle.ue4.mercedes.ccc":           assetPath("Car_SM_MercedesCCC_Parked.glb"),
}
