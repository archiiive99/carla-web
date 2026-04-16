import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Separator } from "@/components/ui/separator";
import { Car, Shuffle, Check } from "lucide-react";
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
function VehicleSpawnTab() {
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [selectedBp, setSelectedBp] = useState("");
  const [transform, setTransform] = useState<CarlaTransform>(DEFAULT_TRANSFORM);
  const [autopilot, setAutopilot] = useState(false);
  const [spawning, setSpawning] = useState(false);
  const spawnVehicle = useActorStore((s) => s.spawnVehicle);
  const isConnected = useIsConnected();

  // Gate the blueprint fetch on connection state. The tab lives in the left
  // panel and mounts before useConnectionHealth completes its first poll, so
  // an unconditional mount fetch races the connect and fails silently — the
  // user would then be stuck with the 3-item hardcoded fallback list even
  // after the bridge comes up. Re-run on connect so the real list loads.
  useEffect(() => {
    if (!isConnected) return;
    carlaApi.getVehicleBlueprints().then(setBlueprints).catch(() => {});
  }, [isConnected]);

  const handleRandomSpawnPoint = useCallback(async () => {
    try {
      const points = await carlaApi.getSpawnPoints();
      if (points.length > 0) {
        // Math.floor(Math.random() * points.length) is guaranteed in-bounds,
        // but noUncheckedIndexedAccess widens the lookup to
        // CarlaTransform | undefined. Guard explicitly.
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
      await spawnVehicle({ blueprint: selectedBp, transform, autopilot });
    } catch (e) {
      reportError("Spawn", e);
    } finally {
      setSpawning(false);
    }
  }, [selectedBp, transform, autopilot, spawnVehicle]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs">Blueprint</Label>
        <Command className="rounded-lg border">
          <CommandInput placeholder="Search vehicles..." className="h-8 text-xs" />
          <div className="px-2 py-1 text-2xs tabular-nums text-muted-foreground">{blueprints.length} blueprints</div>
          <CommandList className="max-h-48">
            <CommandEmpty className="text-xs">No vehicles found.</CommandEmpty>
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
                    <Car className="mr-2 size-3" aria-hidden="true" />
                  )}
                  {bp.id.replace("vehicle.", "")}
                </CommandItem>
              ))}
              {/* Hardcoded 0.9.x fallbacks removed — they 400 on CARLA 0.10
                  where "vehicle.tesla.model3" etc. don't exist. Empty list
                  falls through to CommandEmpty's "No vehicles found"
                  message, which is honest rather than offering dead ids. */}
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

      <div className="flex items-center gap-2">
        <Checkbox id="autopilot" checked={autopilot} onCheckedChange={(c) => setAutopilot(!!c)} />
        <Label htmlFor="autopilot" className="text-xs">Enable Autopilot</Label>
      </div>

      <Button className="w-full" onClick={handleSpawn} disabled={!selectedBp || spawning}>
        {spawning ? "Spawning..." : "Spawn Vehicle"}
      </Button>

      <Button variant="outline" className="w-full" onClick={async () => {
        if (!selectedBp) return;
        setSpawning(true);
        try {
          const store = useActorStore.getState();
          await store.spawnMultipleVehicles(10, selectedBp);
        } catch { /* ignore */ } finally { setSpawning(false); }
      }} disabled={!selectedBp || spawning}>
        Spawn 10 with Autopilot
      </Button>
    </div>
  );
}

