import { Badge } from "@/components/ui/badge";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CarlaActor } from "@/types/carla";
import { BRIDGE_EGO_ROLE } from "@/constants";
import { ActorIcon } from "./actor-transform-display";

interface ActorHeaderProps {
  actor: CarlaActor;
}

// One-line header for the ActorDetails pane: type icon + truncated
// blueprint id + Ego/TrafficLight-state/#id badges. Pulled out so the main
// ActorDetails JSX shows just (header / metadata-badges / accordion /
// actions) rather than re-inlining 30+ lines of badge construction.
export function ActorHeader({ actor }: ActorHeaderProps) {
  return (
    <div className="flex items-center gap-2">
      <ActorIcon type={actor.type} />
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium">{actor.type_id}</p>
      </div>
      {actor.role_name === BRIDGE_EGO_ROLE && (
        <Badge
          className="h-4 shrink-0 gap-1 bg-warning/10 px-1.5 text-2xs text-warning"
          title="Bridge-managed ego vehicle"
          aria-label="Bridge-managed ego vehicle"
        >
          <Star className="size-2.5 fill-current" aria-hidden="true" /> Ego
        </Badge>
      )}
      {actor.type === "traffic_light" && actor.traffic_light_state && (
        <Badge
          className={cn(
            "h-4 shrink-0 gap-1 px-1.5 text-2xs",
            actor.traffic_light_state === "Red" && "bg-destructive/10 text-destructive",
            actor.traffic_light_state === "Yellow" && "bg-warning/10 text-warning",
            actor.traffic_light_state === "Green" && "bg-success/10 text-success",
            !["Red", "Yellow", "Green"].includes(actor.traffic_light_state) &&
              "bg-muted text-muted-foreground",
          )}
          title="Traffic light state"
          aria-label={`Traffic light ${actor.traffic_light_state}`}
        >
          {actor.traffic_light_state}
        </Badge>
      )}
      <Badge variant="secondary" className="h-4 shrink-0 px-1.5 text-2xs tabular-nums">
        #{actor.id}
      </Badge>
    </div>
  );
}
