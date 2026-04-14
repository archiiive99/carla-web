import type { CarlaActor } from "@/types/carla";

/** Rough size class inferred from CARLA blueprint metadata. Used only to
 *  scale the unmapped-vehicle placeholder marker — not to drive a faithful
 *  render. When the glTF lookup succeeds, the real asset overrides this. */
export type VehicleSizeClass = "bike" | "motorcycle" | "car" | "truck" | "bus";

export interface VehicleFootprint {
  /** Radius of the ground disc (metres). */
  ringRadius: number;
  /** Approximate roof height of the placeholder tick (metres). */
  tickHeight: number;
  /** Wireframe bounding-box dimensions in metres: length × height × width
   *  (local X = forward, Y = up, Z = lateral). Used for the silhouette
   *  outline that replaces the old single-tick placeholder. */
  box: { length: number; height: number; width: number };
  /** Preferred placeholder primitive. Cars/trucks/buses are rectilinear so
   *  `box` reads as "vehicle chassis". Two-wheelers have a fundamentally
   *  slimmer, capsule-shaped profile; rendering them as an axis-aligned box
   *  the same way as a car hides that they're two-wheelers. `capsule-x`
   *  renders a horizontal capsule oriented along the forward axis, which
   *  reads as a motorbike silhouette even at placeholder fidelity. */
  shape: "box" | "capsule-x";
}

const CLASS_FOOTPRINT: Record<VehicleSizeClass, VehicleFootprint> = {
  bike:       { ringRadius: 1.1, tickHeight: 1.05, box: { length: 1.8, height: 1.10, width: 0.55 }, shape: "capsule-x" },
  motorcycle: { ringRadius: 1.3, tickHeight: 1.2,  box: { length: 2.2, height: 1.20, width: 0.85 }, shape: "capsule-x" },
  car:        { ringRadius: 2.3, tickHeight: 1.6,  box: { length: 4.5, height: 1.55, width: 1.85 }, shape: "box" },
  truck:      { ringRadius: 3.4, tickHeight: 2.6,  box: { length: 6.5, height: 2.60, width: 2.40 }, shape: "box" },
  bus:        { ringRadius: 4.2, tickHeight: 3.0,  box: { length: 9.0, height: 3.05, width: 2.55 }, shape: "box" },
};

/** Classify a CARLA vehicle using wheel count as primary signal and the
 *  blueprint substring as a backup. `vehicle_wheel_count` is authoritative
 *  when the bridge populates it (2 = bike/motorcycle, 4 = car, 6+ = truck
 *  or bus). For 2-wheelers we disambiguate via the make prefix since
 *  bicycles and motorcycles both have 2 wheels. */
export function classifyVehicle(actor: CarlaActor): VehicleSizeClass {
  const id = actor.type_id.toLowerCase();
  const wheels = actor.vehicle_wheel_count ?? null;

  // Explicit bicycle/motorcycle disambiguation by make — wheel_count alone
  // can't tell the two apart, and a bicycle placeholder shouldn't be the
  // size of a motorcycle.
  if (id.includes("diamondback") || id.includes("bh") || id.includes("bicycle")) {
    return "bike";
  }
  if (
    id.includes("motorcycle") ||
    id.includes("harley") ||
    id.includes("kawasaki") ||
    id.includes("yamaha") ||
    id.includes("vespa")
  ) {
    return "motorcycle";
  }

  if (wheels !== null) {
    if (wheels <= 2) return "motorcycle";
    if (wheels >= 6) {
      if (id.includes("bus") || id.includes("fusorosa")) return "bus";
      return "truck";
    }
  }

  if (
    id.includes("sprinter") ||
    id.includes("ambulance") ||
    id.includes("firetruck") ||
    id.includes("hgv") ||
    id.includes("carlacola") ||
    id.includes("t2")
  ) {
    return "truck";
  }
  if (id.includes("bus") || id.includes("fusorosa")) return "bus";

  return "car";
}

export function vehiclePlaceholderFootprint(actor: CarlaActor): VehicleFootprint {
  return CLASS_FOOTPRINT[classifyVehicle(actor)];
}
