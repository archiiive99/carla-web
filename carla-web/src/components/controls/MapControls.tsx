
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Map, Check } from "lucide-react";
import { useSimulationStore, useIsConnected } from "@/stores/simulationStore";
import { carlaApi } from "@/lib/carla-api";

const MAP_LAYERS = [
  "Buildings", "Decals", "Foliage", "Ground",
  "ParkedVehicles", "Particles", "Props", "StreetLights", "Walls",
];

// Keep MapControls backwards-compatible with its existing internal usage;
// delegates to the shared formatter.
import { formatMapName , errorMessage , reportError } from "@/lib/utils";
function displayMapName(m: string): string {
  return formatMapName(m) || m;
}

export function MapControls() {
  const isConnected = useIsConnected();
  const loadMap = useSimulationStore((s) => s.loadMap);
  const currentMap = useSimulationStore((s) => s.currentMap);
  const [maps, setMaps] = useState<string[]>([]);
  const [selectedMap, setSelectedMap] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isConnected) {
      carlaApi.getMaps().then(setMaps).catch(() => {});
    }
  }, [isConnected]);

  const handleLoad = useCallback(async () => {
    if (!selectedMap) return;
    setLoading(true);
    try {
      // Store's loadMap already toasts on success with the cleaned name
      // and logs a map event — don't double-toast the raw path here.
      await loadMap(selectedMap);
      setOpen(false);
    } catch (e) {
      reportError("Load map", e);
    } finally {
      setLoading(false);
    }
  }, [selectedMap, loadMap]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            disabled={!isConnected}
            title={isConnected ? "Load map + layer controls" : "Connect to CARLA first"}
            aria-label="Open map controls"
          >
            <Map className="size-3" /> Maps
          </Button>
        }
      />
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">Map</DialogTitle>
          <DialogDescription className="text-xs">
            Current: <span className="font-mono">{currentMap ? displayMapName(currentMap) : "None"}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Command className="rounded-lg border">
            <CommandInput placeholder="Search maps..." className="h-8 text-xs" />
            <CommandList className="max-h-40">
              <CommandEmpty className="text-xs">No maps found.</CommandEmpty>
              <CommandGroup>
                {(maps.length > 0
                  ? maps
                  : ["Town01", "Town02", "Town03", "Town04", "Town05", "Town10HD"]
                ).map((m) => {
                  const display = displayMapName(m);
                  const isCurrent = currentMap === m || displayMapName(currentMap) === display;
                  return (
                    <CommandItem
                      key={m}
                      value={display}
                      onSelect={() => setSelectedMap(m)}
                      className="text-xs"
                    >
                      {isCurrent ? (
                        <Check className="mr-2 size-3 text-success" aria-hidden="true" />
                      ) : (
                        <Map className="mr-2 size-3" aria-hidden="true" />
                      )}
                      {display}
                      {isCurrent && (
                        <span className="ml-auto text-2xs text-muted-foreground">(current)</span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>

          <Button
            className="w-full"
            onClick={handleLoad}
            disabled={!selectedMap || loading}
          >
            {loading ? (
              <>
                <Spinner className="mr-2 size-3" aria-hidden="true" /> Loading Map...
              </>
            ) : (
              "Load Map"
            )}
          </Button>

          <Separator />

          {/* Map Layers — CARLA supports per-layer load/unload via
              world.load_map_layer, but the bridge doesn't expose it yet, so
              the checkboxes are labeled "not wired" and disabled to avoid
              pretending a toggle takes effect (mandate: honest stubs). */}
          <div className="space-y-2 opacity-60">
            <div className="flex items-center gap-2">
              <Label className="text-xs">Map Layers</Label>
              <span className="text-3xs uppercase tracking-wide text-muted-foreground">
                not wired
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {MAP_LAYERS.map((layer) => (
                <div key={layer} className="flex items-center gap-2">
                  <Checkbox id={`layer-${layer}`} defaultChecked disabled />
                  <Label htmlFor={`layer-${layer}`} className="cursor-not-allowed text-xs">
                    {layer}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
