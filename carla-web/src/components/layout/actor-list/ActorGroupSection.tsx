import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Car,
  PersonStanding,
  Camera,
  CircleDot,
  Box,
  ChevronRight,
  Star,
} from "lucide-react";
import { SENSOR_REGISTRY } from "@/lib/sensor-registry";
import { cn } from "@/lib/utils";
import type { CarlaActor } from "@/types/carla";
import { BRIDGE_EGO_ROLE } from "@/constants";

export interface ActorGroupDef {
  key: string;
  label: string;
  icon: React.ReactNode;
}

export function actorDisplayName(actor: CarlaActor): string {
  const parts = actor.type_id.split(".");
  const name = parts.length > 2 ? parts.slice(2).join(" ") : parts[parts.length - 1];
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function ActorItemIcon({ actor }: { actor: CarlaActor }) {
  const className = "size-3 shrink-0 text-muted-foreground";
  if (actor.type === "vehicle") return <Car className={className} aria-hidden="true" />;
  if (actor.type === "walker") return <PersonStanding className={className} aria-hidden="true" />;
  if (actor.type === "traffic_light") return <CircleDot className={className} aria-hidden="true" />;
  if (actor.type === "sensor") {
    const entry = SENSOR_REGISTRY[actor.type_id];
    if (entry) {
      const Icon = entry.icon;
      return <Icon className={className} aria-hidden="true" />;
    }
    return <Camera className={className} aria-hidden="true" />;
  }
  return <Box className={className} aria-hidden="true" />;
}

interface ActorGroupSectionProps {
  def: ActorGroupDef;
  actors: CarlaActor[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}

// One collapsible section of the actor list (Vehicles / Walkers / Sensors / …).
// Kept here rather than in LeftPanel because its only job is the visual
// presentation of an actor group + selection/deselection click target.
export function ActorGroupSection({
  def,
  actors,
  selectedId,
  onSelect,
}: ActorGroupSectionProps) {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
        <ChevronRight
          className={cn(
            "size-3.5 transition-transform duration-200",
            open && "rotate-90",
          )}
          aria-hidden="true"
        />
        {def.icon}
        <span className="flex-1 text-left">{def.label}</span>
        {actors.length > 0 && (
          <Badge variant="secondary" className="h-4 px-1.5 text-2xs tabular-nums">
            {actors.length}
          </Badge>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        {actors.length > 0 ? (
          <ul className="mt-0.5 space-y-0.5 pl-5">
            {actors.map((actor) => (
              <li key={actor.id}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onSelect(selectedId === actor.id ? null : actor.id)}
                  className={cn(
                    "h-auto w-full justify-start gap-2 px-2 py-1.5 text-sm",
                    selectedId === actor.id && "bg-muted text-foreground",
                  )}
                >
                  <ActorItemIcon actor={actor} />
                  <span className="flex-1 truncate text-left text-xs">
                    {actorDisplayName(actor)}
                  </span>
                  {actor.role_name === BRIDGE_EGO_ROLE && (
                    <Star
                      className="size-2.5 shrink-0 fill-warning text-warning"
                      aria-label="Bridge-managed ego vehicle"
                    />
                  )}
                  <Badge
                    variant="secondary"
                    className="h-4 shrink-0 px-1 text-2xs font-normal tabular-nums"
                  >
                    {actor.id}
                  </Badge>
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-1 px-7 py-3 text-center">
            {def.icon}
            <p className="text-xs text-muted-foreground">No {def.label.toLowerCase()}</p>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
