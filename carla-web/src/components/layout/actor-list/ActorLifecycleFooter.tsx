import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Car, PersonStanding, Users, Trash2 } from "lucide-react";
import { SpawnPanel } from "@/components/controls/SpawnPanel";
import { useActorStore } from "@/stores/actorStore";
import { useIsConnected } from "@/stores/simulationStore";
import { carlaApi } from "@/lib/carla-api";
import { reportError } from "@/lib/utils";
import { toast } from "sonner";
import { SPAWN_NO_POINTS_MSG } from "@/constants";

// Bottom cluster of the actor list: three one-click quick-spawn actions
// (Vehicle / Walker / +10) followed by the full SpawnPanel dialog and a
// Destroy All gate. Separated from LeftPanel because this is the lifecycle
// cluster — it has its own cohesion and its own destructive confirmation.
export function ActorLifecycleFooter() {
  const isConnected = useIsConnected();

  const quickSpawnVehicle = useCallback(async () => {
    try {
      const points = await carlaApi.getSpawnPoints();
      // Math.floor(Math.random() * n) is in-bounds when n>0 but
      // `arr[i]` under noUncheckedIndexedAccess is T|undefined — guard
      // with a combined length + presence check so spawnVehicle never
      // gets fed a phantom `undefined` transform.
      const pt = points[Math.floor(Math.random() * points.length)];
      if (!pt) {
        toast.error(SPAWN_NO_POINTS_MSG);
        return;
      }
      await useActorStore.getState().spawnVehicle({
        blueprint: "vehicle.tesla.model3",
        transform: pt,
        autopilot: true,
      });
    } catch (e) {
      reportError("Spawn", e);
    }
  }, []);

  const quickSpawnWalker = useCallback(async () => {
    try {
      const points = await carlaApi.getSpawnPoints();
      const pt = points[Math.floor(Math.random() * points.length)];
      if (!pt) {
        toast.error(SPAWN_NO_POINTS_MSG);
        return;
      }
      await useActorStore.getState().spawnWalker({
        blueprint: "walker.pedestrian.0001",
        transform: pt,
      });
    } catch (e) {
      reportError("Spawn", e);
    }
  }, []);

  const quickSpawnTenVehicles = useCallback(async () => {
    try {
      await useActorStore.getState().spawnMultipleVehicles(10, "vehicle.tesla.model3");
    } catch (e) {
      reportError("Spawn", e);
    }
  }, []);

  return (
    <div className="space-y-2 p-3">
      <div className="flex gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 gap-1 text-xs hover:border-success/40 hover:bg-success/5 hover:text-foreground"
          disabled={!isConnected}
          title={isConnected ? "Spawn a Tesla Model 3 at a random spawn point" : "Connect to CARLA first"}
          onClick={quickSpawnVehicle}
        >
          <Car className="size-3" aria-hidden="true" /> +Vehicle
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 gap-1 text-xs hover:border-success/40 hover:bg-success/5 hover:text-foreground"
          disabled={!isConnected}
          title={isConnected ? "Spawn a pedestrian at a random spawn point" : "Connect to CARLA first"}
          onClick={quickSpawnWalker}
        >
          <PersonStanding className="size-3" aria-hidden="true" /> +Walker
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 gap-1 text-xs hover:border-success/40 hover:bg-success/5 hover:text-foreground"
          disabled={!isConnected}
          title={isConnected ? "Spawn 10 autopilot vehicles" : "Connect to CARLA first"}
          onClick={quickSpawnTenVehicles}
        >
          <Users className="size-3" aria-hidden="true" /> +10
        </Button>
      </div>

      {/* Lifecycle cluster: spawn (primary) is separated from destroy
          (destructive) by a divider so they don't read as equally weighted. */}
      <SpawnPanel />
      <Separator className="my-0.5" />
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              variant="destructive"
              size="sm"
              className="w-full gap-1.5"
              aria-label="Destroy all spawned actors"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Destroy All
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Destroy all spawned actors?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove every actor the bridge has spawned — vehicles, walkers, and sensors (built-in traffic lights are kept). This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => useActorStore.getState().destroyAll()}
            >
              Destroy All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
