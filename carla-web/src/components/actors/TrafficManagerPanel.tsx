
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { TrafficCone } from "lucide-react";
import { useActorStore } from "@/stores/actorStore";
import { useIsConnected } from "@/stores/simulationStore";
import { carlaApi } from "@/lib/carla-api";
import { reportError } from "@/lib/utils";

export function TrafficManagerPanel() {
  const isConnected = useIsConnected();
  const actors = useActorStore((s) => s.actors);
  const vehicleIds = useActorStore((s) => s.actorsByType.vehicles);

  const [globalSpeedPct, setGlobalSpeedPct] = useState(0);
  // Per-vehicle auto-lane-change intent. No read-back from CARLA
  // (tm.auto_lane_change has no getter), so start each vehicle optimistic-true
  // — matches CARLA's default for autopilot-managed vehicles.
  const [autoLaneChange, setAutoLaneChange] = useState<Record<number, boolean>>({});
  const [laneBusy, setLaneBusy] = useState<number | null>(null);

  const toggleAutoLane = useCallback(async (vehicleId: number) => {
    const current = autoLaneChange[vehicleId] ?? true;
    const next = !current;
    setAutoLaneChange((prev) => ({ ...prev, [vehicleId]: next }));
    setLaneBusy(vehicleId);
    try {
      await carlaApi.setVehicleAutoLaneChange(vehicleId, next);
    } catch (e) {
      setAutoLaneChange((prev) => ({ ...prev, [vehicleId]: current }));
      reportError(`Auto lane change #${vehicleId}`, e);
    } finally {
      setLaneBusy(null);
    }
  }, [autoLaneChange]);

  const handleGlobalSpeed = useCallback((value: number | readonly number[]) => {
    const v = Array.isArray(value) ? value[0] : value;
    setGlobalSpeedPct(v);
    // Slider drag produces many value changes per second; silent-swallow is
    // intentional here (matches VehicleDetails slider behavior) so a
    // transient bridge hiccup doesn't spam toasts while the user drags.
    carlaApi.setGlobalSpeed(v).catch(() => {});
  }, []);

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            disabled={!isConnected}
            title={isConnected ? "Traffic Manager settings" : "Connect to CARLA first"}
            aria-label="Open Traffic Manager"
          >
            <TrafficCone className="size-3" aria-hidden="true" /> Traffic
          </Button>
        }
      />
      <SheetContent side="right" className="w-full p-0 sm:max-w-lg">
        <SheetHeader className="p-4 pb-2">
          <SheetTitle className="text-sm">Traffic Manager</SheetTitle>
          <SheetDescription className="text-xs">
            Configure autopilot behavior for all vehicles
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-80px)]">
          <div className="space-y-4 p-4">
            {/* Global Settings */}
            <div className="space-y-3">
              <h4 className="text-xs font-medium">Global Settings</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Speed Difference</Label>
                  <span className="font-mono tabular-nums text-xs text-muted-foreground">
                    {globalSpeedPct > 0 ? "+" : ""}
                    {globalSpeedPct}%
                  </span>
                </div>
                <Slider
                  min={-50}
                  max={50}
                  step={1}
                  value={[globalSpeedPct]}
                  aria-label="Global speed difference (percentage relative to posted speed)"
                  onValueChange={handleGlobalSpeed}
                />
              </div>
              <div className="flex items-center justify-between opacity-60">
                <div className="flex items-center gap-1">
                  <Label className="text-xs">Hybrid Physics</Label>
                  <span className="text-3xs uppercase tracking-wide text-muted-foreground">
                    not wired
                  </span>
                </div>
                <Switch disabled aria-label="Enable hybrid physics for distant vehicles (not yet wired)" />
              </div>
            </div>

            <Separator />

            {/* Per-vehicle table — Auto Lane Change is live (bridge
                /api/traffic/vehicle/:id/lane). Speed % is still read-only:
                CARLA's tm.vehicle_percentage_speed_difference is write-only,
                so we'd need to track edit state separately + we don't today. */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-medium">Per-Vehicle Settings</h4>
                <Badge variant="secondary" className="ml-auto h-5 px-2 text-2xs tabular-nums">
                  {vehicleIds.length} vehicles
                </Badge>
              </div>

              {vehicleIds.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-8 text-sm">ID</TableHead>
                      <TableHead className="h-8 text-sm">Type</TableHead>
                      <TableHead className="h-8 text-sm">Speed %</TableHead>
                      <TableHead className="h-8 text-sm">Auto Lane</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vehicleIds.map((id) => {
                      const actor = actors.get(id);
                      const laneOn = autoLaneChange[id] ?? true;
                      return (
                        <TableRow key={id}>
                          <TableCell className="py-2 font-mono tabular-nums text-xs">#{id}</TableCell>
                          <TableCell className="py-2 text-xs">
                            {actor?.type_id.split(".").pop() ?? "—"}
                          </TableCell>
                          <TableCell className="py-2 text-xs text-muted-foreground">—</TableCell>
                          <TableCell className="py-2">
                            <Switch
                              checked={laneOn}
                              onCheckedChange={() => toggleAutoLane(id)}
                              disabled={!isConnected || laneBusy === id}
                              aria-label={`Auto lane change for actor #${id}`}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <TrafficCone className="size-8 text-muted-foreground" aria-hidden="true" />
                  <p className="text-xs font-medium text-muted-foreground">No vehicles in the simulation</p>
                  <p className="text-2xs text-muted-foreground">Spawn vehicles to manage their autopilot settings.</p>
                </div>
              )}

              <div className="flex gap-2 opacity-60">
                <Button variant="outline" size="xs" disabled className="flex-1 text-2xs">
                  Set All Autopilot
                </Button>
                <Button variant="outline" size="xs" disabled className="flex-1 text-2xs">
                  Reset Defaults
                </Button>
              </div>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
