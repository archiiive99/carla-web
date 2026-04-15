# iter-03 plan — Vehicle silhouettes (✅-on-arrival)

**Phase tag:** A → G (no-op)
**Time budget:** 30 min

## Discovery
`carla-assets/vehicle-models.ts` has 42 vehicle blueprint→GLB
mappings (e.g. vehicle.audi.tt, vehicle.tesla.cybertruck, etc.).
`VehicleMesh.tsx` resolves a per-actor GLB via
`resolveVehicleModel(typeId)` and renders with `GltfVehicleModel`.
Box fallback for unmapped blueprints.

42 entries cover the major CARLA blueprint classes. Per harness §1
✅-on-arrival.
