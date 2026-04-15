
import { useState, useMemo, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Car,
  PersonStanding,
  Camera,
  CircleDot,
  Box,
  Search,
} from "lucide-react";
import { useActorStore } from "@/stores/actorStore";
import { useIsConnected } from "@/stores/simulationStore";
import type { CarlaActor } from "@/types/carla";
import { ActorGroupSection } from "./actor-list/ActorGroupSection";
import {
  actorDisplayName,
  type ActorGroupDef,
} from "./actor-list/actor-group-defs";
import { ActorLifecycleFooter } from "./actor-list/ActorLifecycleFooter";

const GROUP_DEFS: ActorGroupDef[] = [
  { key: "vehicles", label: "Vehicles", icon: <Car className="size-4" /> },
  { key: "walkers", label: "Walkers", icon: <PersonStanding className="size-4" /> },
  { key: "sensors", label: "Sensors", icon: <Camera className="size-4" /> },
  { key: "trafficLights", label: "Traffic Lights", icon: <CircleDot className="size-4" /> },
  { key: "other", label: "Other", icon: <Box className="size-4" /> },
];

const TYPE_FILTER_MAP: Record<string, string[]> = {
  vehicle: ["vehicles"],
  walker: ["walkers"],
  sensor: ["sensors"],
};

export function LeftPanel() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isConnected = useIsConnected();
  const storeActors = useActorStore((s) => s.actors);
  const selectedActorId = useActorStore((s) => s.selectedActorId);
  const selectActor = useActorStore((s) => s.selectActor);

  // "/" keyboard shortcut to focus search. Bail out if the user is typing
  // in an input, textarea, select, or contentEditable element so the key
  // reaches the underlying field normally.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== '/') return;
      const t = e.target;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement ||
        (t instanceof HTMLElement && t.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const allActors = useMemo(() => {
    if (!isConnected) return [];
    return Array.from(storeActors.values());
  }, [isConnected, storeActors]);

  const grouped = useMemo(() => {
    const map: Record<string, CarlaActor[]> = {
      vehicles: [],
      walkers: [],
      sensors: [],
      trafficLights: [],
      other: [],
    };
    for (const actor of allActors) {
      const name = actorDisplayName(actor).toLowerCase();
      if (search && !name.includes(search.toLowerCase()) && !String(actor.id).includes(search)) {
        continue;
      }
      const key =
        actor.type === "vehicle" ? "vehicles" :
        actor.type === "walker" ? "walkers" :
        actor.type === "sensor" ? "sensors" :
        actor.type === "traffic_light" ? "trafficLights" : "other";
      // `map` is initialized with all 5 keys above; the lookup is
      // always defined. Guard with an explicit array or create
      // empty to satisfy noUncheckedIndexedAccess.
      (map[key] ??= []).push(actor);
    }
    return map;
  }, [allActors, search]);

  const totalCount = allActors.length;
  // Mirror the group-visibility rule used in the render below so the badge
  // matches what the user actually sees (search + type filter both applied).
  const visibleCount = (Object.entries(grouped) as [string, CarlaActor[]][]).reduce(
    (n, [key, list]) => {
      if (typeFilter) {
        const allowed = TYPE_FILTER_MAP[typeFilter];
        if (allowed && !allowed.includes(key)) return n;
      }
      return n + list.length;
    },
    0,
  );
  const filtered = visibleCount !== totalCount;

  return (
    <aside aria-label="Actors list" className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-sidebar text-sidebar-foreground shadow-sm">
      <div className="flex h-10 items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Actors</h2>
          <Badge
            variant="secondary"
            className="h-4 px-1.5 text-2xs tabular-nums"
            title={filtered ? `${visibleCount} shown · ${totalCount} total` : `${totalCount} total`}
            aria-label={filtered ? `${visibleCount} actors shown out of ${totalCount} total` : `${totalCount} actors`}
          >
            {filtered ? `${visibleCount}/${totalCount}` : totalCount}
          </Badge>
        </div>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            ref={searchInputRef}
            type="search"
            placeholder="Search actors... (/)"
            aria-label="Search actors"
            className="h-8 bg-background pl-8 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Separator />

      <div
        className="flex gap-1.5 px-3 py-2"
        role="group"
        aria-label="Filter actors by type"
      >
        {(["vehicle", "walker", "sensor"] as const).map((t) => {
          const Icon = t === "vehicle" ? Car : t === "walker" ? PersonStanding : Camera;
          const pressed = typeFilter === t;
          return (
            <Button
              key={t}
              size="icon-sm"
              variant={pressed ? "default" : "ghost"}
              aria-label={`Filter to ${t}s${pressed ? " (active, click to clear)" : ""}`}
              aria-pressed={pressed}
              onClick={() => setTypeFilter(pressed ? null : t)}
              className={cn(pressed && "ring-1 ring-primary/30")}
            >
              <Icon className="size-3.5" aria-hidden="true" />
            </Button>
          );
        })}
      </div>

      <ScrollArea className="min-h-0 flex-1 overflow-hidden">
        {!isConnected ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <Box className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-xs font-medium text-muted-foreground">Not connected</p>
            <p className="text-2xs text-muted-foreground">
              Actors will appear here once the bridge reaches CARLA.
            </p>
          </div>
        ) : allActors.length === 0 ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-1 p-3">
            {GROUP_DEFS.filter((def) => {
              if (!typeFilter) return true;
              const allowed = TYPE_FILTER_MAP[typeFilter];
              return allowed ? allowed.includes(def.key) : true;
            }).map((def) => (
              <ActorGroupSection
                key={def.key}
                def={def}
                actors={grouped[def.key] || []}
                selectedId={selectedActorId}
                onSelect={selectActor}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      <Separator />

      <ActorLifecycleFooter />
    </aside>
  );
}
