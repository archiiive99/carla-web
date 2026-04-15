
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

const MAP_LAYERS: Array<{ label: string; key: string }> = [
  { label: "Buildings", key: "buildings" },
  { label: "Decals", key: "decals" },
  { label: "Foliage", key: "foliage" },
  { label: "Ground", key: "ground" },
  { label: "Parked Vehicles", key: "parked_vehicles" },
  { label: "Particles", key: "particles" },
  { label: "Props", key: "props" },
  { label: "Street Lights", key: "street_lights" },
  { label: "Walls", key: "walls" },
];

// Keep MapControls backwards-compatible with its existing internal usage;
// delegates to the shared formatter.
import { formatMapName, reportError } from "@/lib/utils";
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
  // Default: assume all layers are loaded (CARLA map default).
  // We don't read current layer state from the bridge because CARLA's Python
  // client exposes load/unload but not a read-back; the UI state is local.
  const [enabledLayers, setEnabledLayers] = useState<Record<string, boolean>>(
    () => Object.fromEntries(MAP_LAYERS.map((l) => [l.key, true])),
  );
  const [layerBusy, setLayerBusy] = useState<string | null>(null);

  const toggleLayer = useCallback(async (key: string) => {
    const current = enabledLayers[key];
    const next = !current;
    setEnabledLayers((prev) => ({ ...prev, [key]: next }));
    setLayerBusy(key);
    try {
      await carlaApi.setMapLayer(key, next ? "load" : "unload");
    } catch (e) {
      // Revert on failure; toast via reportError path.
      setEnabledLayers((prev) => ({ ...prev, [key]: current }));
      reportError("Map layer", e);
    } finally {
      setLayerBusy(null);
    }
  }, [enabledLayers]);

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
                      <Map className="mr-2 size-3" aria-hidden="true" />
                      {display}
                      {isCurrent && (
                        <Check className="ml-auto size-3 text-success" aria-label="Current map" />
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

          {/* Map Layers — wired to POST /api/world/map-layers. CARLA exposes
              load_map_layer / unload_map_layer but no read-back, so the UI
              state is local-only (we don't poll the actual layer state). */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-xs">Map Layers</Label>
              <span className="text-3xs text-muted-foreground">
                toggle world geometry
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {MAP_LAYERS.map((layer) => {
                const checked = enabledLayers[layer.key] ?? true;
                const busy = layerBusy === layer.key;
                return (
                  <div key={layer.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`layer-${layer.key}`}
                      checked={checked}
                      onCheckedChange={() => toggleLayer(layer.key)}
                      disabled={!isConnected || busy}
                    />
                    <Label
                      htmlFor={`layer-${layer.key}`}
                      className="cursor-pointer text-xs"
                    >
                      {layer.label}
                    </Label>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
