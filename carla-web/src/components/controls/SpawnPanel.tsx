import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Car, PersonStanding, Camera, Plus } from "lucide-react";
import { useIsConnected } from "@/stores/simulationStore";
import { VehicleSpawnTab } from "./spawn/VehicleSpawnTab";
import { WalkerSpawnTab } from "./spawn/WalkerSpawnTab";
import { SensorSpawnTab } from "./spawn/SensorSpawnTab";

/**
 * SpawnPanel — dialog gate for adding actors to the simulation. Tab bodies
 * live under `./spawn/` so this file stays focused on the dialog shell and
 * tab wiring. Each tab is self-contained (blueprint/transform/config state
 * + its own submit handler) — the tabs share nothing beyond TransformInputs.
 */
export function SpawnPanel() {
  const isConnected = useIsConnected();

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            className="w-full gap-1.5"
            size="sm"
            disabled={!isConnected}
            title={
              isConnected
                ? "Open spawn dialog (vehicles / walkers / sensors)"
                : "Connect to CARLA first"
            }
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Spawn Actor
          </Button>
        }
      />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Spawn Actor</DialogTitle>
          <DialogDescription className="text-xs">
            Add vehicles, walkers, or sensors to the simulation
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="vehicles">
          <TabsList className="w-full">
            <TabsTrigger value="vehicles" className="flex-1 gap-1 text-xs">
              <Car className="size-3" aria-hidden="true" /> Vehicles
            </TabsTrigger>
            <TabsTrigger value="walkers" className="flex-1 gap-1 text-xs">
              <PersonStanding className="size-3" aria-hidden="true" /> Walkers
            </TabsTrigger>
            <TabsTrigger value="sensors" className="flex-1 gap-1 text-xs">
              <Camera className="size-3" aria-hidden="true" /> Sensors
            </TabsTrigger>
          </TabsList>
          <ScrollArea className="mt-4 max-h-[60vh]">
            <TabsContent value="vehicles">
              <VehicleSpawnTab />
            </TabsContent>
            <TabsContent value="walkers">
              <WalkerSpawnTab />
            </TabsContent>
            <TabsContent value="sensors">
              <SensorSpawnTab />
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
