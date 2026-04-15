import type { CarlaTransform } from "@/types/carla";

/** Shared default for the SpawnPanel tabs. Lives in its own module so
 *  TransformInputs.tsx stays Fast-Refresh-eligible (React Refresh bails
 *  out when a component file also exports non-components). */
export const DEFAULT_TRANSFORM: CarlaTransform = {
  location: { x: 0, y: 0, z: 2 },
  rotation: { pitch: 0, yaw: 0, roll: 0 },
};
