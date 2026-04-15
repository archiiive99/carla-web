import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link as LinkIcon } from "lucide-react";
import type { CarlaActor } from "@/types/carla";
import { BRIDGE_EGO_ROLE } from "@/constants";

interface ActorMetadataBadgesProps {
  actor: CarlaActor;
  hasParentInList: boolean;
  onSelectParent: (id: number) => void;
}

// Parent / role / blueprint metadata badges shown directly under the
// ActorDetails header. Surfaces CARLA blueprint attributes only — no
// disclosure labels for our own rendering state.
export function ActorMetadataBadges({
  actor,
  hasParentInList,
  onSelectParent,
}: ActorMetadataBadgesProps) {
  const visible =
    actor.parent_id != null ||
    (actor.role_name && actor.role_name !== BRIDGE_EGO_ROLE) ||
    actor.vehicle_color ||
    actor.vehicle_wheel_count != null ||
    actor.vehicle_generation;

  if (!visible) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-2xs">
      {actor.parent_id != null &&
        (hasParentInList ? (
          <Button
            variant="outline"
            size="sm"
            className="h-5 gap-1 px-1.5 text-2xs text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
            onClick={() => onSelectParent(actor.parent_id!)}
            title={`Attached to actor #${actor.parent_id}`}
          >
            <LinkIcon className="size-2.5" aria-hidden="true" />
            Parent #{actor.parent_id}
          </Button>
        ) : (
          <Badge
            variant="outline"
            className="h-5 gap-1 px-1.5 text-2xs tabular-nums text-muted-foreground"
            title={`Parent actor #${actor.parent_id} is not in the current actor list (destroyed or outside view)`}
          >
            <LinkIcon className="size-2.5" aria-hidden="true" />
            Parent #{actor.parent_id} (gone)
          </Badge>
        ))}
      {actor.role_name && actor.role_name !== BRIDGE_EGO_ROLE && (
        <Badge variant="outline" className="h-5 px-1.5 text-2xs text-muted-foreground">
          role: {actor.role_name}
        </Badge>
      )}
      {actor.vehicle_color && (
        <Badge
          variant="outline"
          className="h-5 px-1.5 text-2xs text-muted-foreground"
          title="Native CARLA blueprint color attribute"
        >
          color: {actor.vehicle_color}
        </Badge>
      )}
      {actor.vehicle_generation && (
        <Badge
          variant="outline"
          className="h-5 px-1.5 text-2xs text-muted-foreground"
          title="Native CARLA blueprint generation attribute"
        >
          generation: {actor.vehicle_generation}
        </Badge>
      )}
      {actor.vehicle_wheel_count != null && (
        <Badge
          variant="outline"
          className="h-5 px-1.5 text-2xs text-muted-foreground"
          title="Native CARLA blueprint number_of_wheels attribute"
        >
          wheels: {actor.vehicle_wheel_count}
        </Badge>
      )}
    </div>
  );
}
