import { useMemo } from "react";
import { useActorStore } from "@/stores/actorStore";
import { useUIStore } from "@/stores/uiStore";
import type { CarlaActor } from "@/types/carla";
import { resolveEgoId } from "./actor-rendering/shared";
import { VehicleMesh } from "./actor-rendering/VehicleMesh";
import { WalkerMesh } from "./actor-rendering/WalkerMesh";
import { TrafficLightMesh } from "./actor-rendering/TrafficLightMesh";

// Distance cull budget (meters). Actors beyond this from the ego aren't
// rendered in the 3D viewport — keeps the R3F scene graph small when the
// map has hundreds of traffic lights / NPCs. The selected and ego actors
// are always rendered regardless of distance.
const RENDER_DISTANCE_M = 250;

export function ActorRenderer() {
  const actors = useActorStore((s) => s.actors);
  const selectedActorId = useActorStore((s) => s.selectedActorId);
  const selectActor = useActorStore((s) => s.selectActor);
  const storeEgoId = useActorStore((s) => s.egoVehicleId);
  const maximizedSensorId = useUIStore((s) => s.maximizedSensorId);
  const setCameraMode = useUIStore((s) => s.setCameraMode);
  const actorList = useMemo(() => Array.from(actors.values()), [actors]);
  const egoId = resolveEgoId(storeEgoId, actors);
  const ego = egoId !== null ? actors.get(egoId) : undefined;

  const withinRange = (actor: CarlaActor) => {
    if (!ego) return true;
    if (actor.id === egoId || actor.id === selectedActorId) return true;
    const dx = actor.transform.location.x - ego.transform.location.x;
    const dy = actor.transform.location.y - ego.transform.location.y;
    return dx * dx + dy * dy <= RENDER_DISTANCE_M * RENDER_DISTANCE_M;
  };

  return (
    <>
      {actorList.map((actor) => {
        if (actor.id === maximizedSensorId) return null;
        if (!withinRange(actor)) return null;
        if (actor.type === "vehicle") {
          return (
            <VehicleMesh
              key={actor.id}
              actor={actor}
              isEgo={actor.id === egoId}
              isSelected={actor.id === selectedActorId}
              onSelect={selectActor}
              onFocus={(id) => {
                selectActor(id);
                setCameraMode("follow");
              }}
            />
          );
        }
        if (actor.type === "walker") {
          return (
            <WalkerMesh
              key={actor.id}
              actor={actor}
              isSelected={actor.id === selectedActorId}
              onSelect={selectActor}
            />
          );
        }
        if (actor.type === "traffic_light") {
          return <TrafficLightMesh key={actor.id} actor={actor} />;
        }
        return null;
      })}
    </>
  );
}
