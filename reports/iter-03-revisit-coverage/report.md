# iter-03-revisit-coverage report

**Status: ✅ PASS — full coverage of the current CARLA's 17 vehicle
blueprints.** Pre-iter the dict had 42 entries but only 1/17 matched
current-CARLA-version blueprint names (most were for CARLA 0.9.x
namespace). Added 16 aliases pointing at the same GLBs. Thirty-
seventh ✅ of session.

## §7.2 Feature delta
`VEHICLE_MODELS` gains 16 alias entries mapping CARLA 0.10 names
to the same GLBs the canonical entries already use:
  - vehicle.ambulance.ford → Truck_SM_sc_Ambulance.glb
  - vehicle.carlacola.actors → Truck_SM_sc_Carlacola.glb
  - vehicle.dodge.charger / vehicle.dodgecop.charger → DodgeCharger GLBs
  - vehicle.firetruck.actors → Truck_SM_sc_ActrosFiretruck.glb
  - vehicle.fuso.mitsubishi → MitsubishiFusoRosa.glb
  - vehicle.lincoln.mkz → LincolnMKZ.glb
  - vehicle.mini.cooper → MiniCooper.glb
  - vehicle.sprinter.mercedes → MercedesSprinter.glb
  - vehicle.taxi.ford → FordCrown01.glb
  - vehicle.ue4.{audi.tt,bmw.grantourer,chevrolet.impala,ford.crown,
    ford.mustang,mercedes.ccc} → respective canonical GLBs

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| iter-06-revisit-csm baseline | 16.71 | 0.3063 | 21.86 |
| iter-03-revisit-coverage after | **16.70** | **0.3063** | **21.87** |

Within noise (no vehicle spawn change at iter-01 pose; aliases only
affect future-spawn vehicles whose blueprint names match the new
aliases).

## §7.5 Effort breakdown
~20 min (CARLA blueprint enumeration + alias mapping + tsc + harness).

## §7.6 Honesty-badge audit
0 NEW hits.
