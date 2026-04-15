import type { CarlaActor } from "@/types/carla";

export interface ActorGroupDef {
  key: string;
  label: string;
  icon: React.ReactNode;
}

/** Human-readable label derived from an actor's `type_id` ("sensor.camera.rgb" →
 *  "Camera Rgb"). Used by the LeftPanel actor-list filter and the row labels in
 *  ActorGroupSection. Kept in its own module so the component file stays
 *  Fast-Refresh-eligible (React Refresh bails out when a component file also
 *  exports non-component helpers). */
export function actorDisplayName(actor: CarlaActor): string {
  const parts = actor.type_id.split(".");
  const name = parts.length > 2 ? parts.slice(2).join(" ") : parts[parts.length - 1];
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
