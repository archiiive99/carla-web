import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Separator } from "@/components/ui/separator";
import { PersonStanding, Shuffle, Check } from "lucide-react";
import { toast } from "sonner";
import { useActorStore } from "@/stores/actorStore";
import { useIsConnected } from "@/stores/simulationStore";
import { carlaApi } from "@/lib/carla-api";
import { reportError } from "@/lib/utils";
import type { Blueprint, CarlaTransform } from "@/types/carla";
import { SPAWN_NO_POINTS_MSG } from "@/constants";
import { TransformInputs } from "./TransformInputs";
import { DEFAULT_TRANSFORM } from "./default-transform";

export
function WalkerSpawnTab() {
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [selectedBp, setSelectedBp] = useState("");
  const [transform, setTransform] = useState<CarlaTransform>(DEFAULT_TRANSFORM);
  const [spawning, setSpawning] = useState(false);
  const spawnWalker = useActorStore((s) => s.spawnWalker);
  const isConnected = useIsConnected();

  // Same connection-gate as VehicleSpawnTab: mount-time fetch races the
  // bridge connect and silently fails with the 2-item hardcoded fallback.
  useEffect(() => {
    if (!isConnected) return;
    carlaApi.getWalkerBlueprints().then(setBlueprints).catch(() => {});
  }, [isConnected]);

  const handleRandomSpawnPoint = useCallback(async () => {
    try {
      const points = await carlaApi.getSpawnPoints();
      if (points.length > 0) {
        // Match VehicleSpawnTab: explicit undefined-guard so a freak
        // empty slot in the returned list can't propagate into setTransform.
        const random = points[Math.floor(Math.random() * points.length)];
        if (random) setTransform(random);
      } else {
        toast.error(SPAWN_NO_POINTS_MSG);
      }
    } catch {
      toast.error("Could not fetch spawn points");
    }
  }, []);

  const handleSpawn = useCallback(async () => {
    if (!selectedBp) return;
    setSpawning(true);
    try {
      // Store emits its own success toast + event; no need to double-toast here
      await spawnWalker({ blueprint: selectedBp, transform });
    } catch (e) {
      reportError("Spawn", e);
    } finally {
      setSpawning(false);
    }
  }, [selectedBp, transform, spawnWalker]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs">Blueprint</Label>
        <Command className="rounded-lg border">
          <CommandInput placeholder="Search walkers..." className="h-8 text-xs" />
          <div className="px-2 py-1 text-2xs tabular-nums text-muted-foreground">{blueprints.length} blueprints</div>
          <CommandList className="max-h-48">
            <CommandEmpty className="text-xs">No walkers found.</CommandEmpty>
            <CommandGroup>
              {blueprints.map((bp) => (
                <CommandItem
                  key={bp.id}
                  value={bp.id}
                  onSelect={setSelectedBp}
                  className="text-xs"
                >
                  {selectedBp === bp.id ? (
                    <Check className="mr-2 size-3 text-primary" />
                  ) : (
                    <PersonStanding className="mr-2 size-3" aria-hidden="true" />
                  )}
                  {bp.id.replace("walker.", "")}
                </CommandItem>
              ))}
              {/* Hardcoded 0.9.x fallbacks removed — walker.pedestrian.0001
                  doesn't exist on CARLA 0.10 (starts at 0014). Empty list
                  falls through to CommandEmpty rather than offering ids
                  that 400 on spawn. */}
            </CommandGroup>
          </CommandList>
        </Command>
        {selectedBp && (
          <p className="font-mono text-xs text-muted-foreground">{selectedBp}</p>
        )}
      </div>

      <Separator />

      <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={handleRandomSpawnPoint}>
        <Shuffle className="size-3" aria-hidden="true" /> Random Spawn Point
      </Button>

      <TransformInputs value={transform} onChange={setTransform} />

      <Button className="w-full" onClick={handleSpawn} disabled={!selectedBp || spawning}>
        {spawning ? "Spawning..." : "Spawn Walker"}
      </Button>
    </div>
  );
}

