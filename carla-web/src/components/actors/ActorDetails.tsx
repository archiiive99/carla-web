
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import { Trash2, Crosshair } from "lucide-react";
import { useActorStore } from "@/stores/actorStore";
import { useIsConnected } from "@/stores/simulationStore";
import { ApiError, carlaApi } from "@/lib/carla-api";
import { reportError } from "@/lib/utils";
import { toast } from "sonner";
import { VehicleDetails } from "./VehicleDetails";
import { SensorDetails } from "./SensorDetails";
import { ActorMetadataBadges } from "./ActorMetadataBadges";
import { ActorHeader } from "./ActorHeader";

import {
  TransformDisplay,
  VelocityDisplay,
} from "./actor-transform-display";

export function ActorDetails() {
  const selectedActorId = useActorStore((s) => s.selectedActorId);
  const actors = useActorStore((s) => s.actors);
  const destroyActor = useActorStore((s) => s.destroyActor);
  const selectActor = useActorStore((s) => s.selectActor);
  const isConnected = useIsConnected();
  const [spectatorAvailable, setSpectatorAvailable] = useState<boolean | null>(null);

  const actor = selectedActorId !== null ? actors.get(selectedActorId) : undefined;

  useEffect(() => {
    // Only probe once the bridge is reachable. Previously the empty-deps
    // mount probe fired immediately, so if ActorDetails mounted before
    // useConnectionHealth's first poll completed, getSpectator hit a 503
    // from _require_connection. The 503 isn't a 501, so the catch's
    // default branch set spectatorAvailable=true — a false positive that
    // enabled the Teleport button, which then failed on click. Gate on
    // isConnected so the probe only runs when the endpoint can actually
    // report its support state.
    if (!isConnected) return;
    let cancelled = false;

    carlaApi
      .getSpectator()
      .then(() => {
        if (!cancelled) setSpectatorAvailable(true);
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 501) {
          setSpectatorAvailable(false);
          return;
        }
        setSpectatorAvailable(true);
      });

    return () => {
      cancelled = true;
    };
  }, [isConnected]);

  const handleDestroy = useCallback(async () => {
    if (!actor) return;
    try {
      // Store handles success toast + event log entry
      await destroyActor(actor.id);
      selectActor(null);
    } catch (e) {
      reportError("Destroy", e);
    }
  }, [actor, destroyActor, selectActor]);

  if (!actor) {
    // Distinguish "nothing selected" from "selected actor disappeared"
    // so the user knows why the detail view went blank.
    const wasSelected = selectedActorId !== null;
    return (
      <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 p-8 text-center">
        <Crosshair className="size-10 text-muted-foreground" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">
            {wasSelected ? `Actor #${selectedActorId} is gone` : "No actor selected"}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {wasSelected
              ? "It was destroyed or the simulation reset. Pick another from the left panel."
              : "Click an actor in the left panel or click on an object in the 3D viewport to inspect its properties, transform, and controls."}
          </p>
          {wasSelected && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 text-xs"
              onClick={() => selectActor(null)}
            >
              Clear selection
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-3">
        <ActorHeader actor={actor} />

        <ActorMetadataBadges
          actor={actor}
          hasParentInList={
            actor.parent_id != null && actors.has(actor.parent_id)
          }
          onSelectParent={selectActor}
        />

        <Separator />

        {/* Accordion sections */}
        <Accordion multiple defaultValue={["transform", "velocity"]}>
          <AccordionItem value="transform">
            <AccordionTrigger className="py-2 text-sm font-medium">Transform</AccordionTrigger>
            <AccordionContent>
              <TransformDisplay actor={actor} />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="velocity">
            <AccordionTrigger className="py-2 text-sm font-medium">Velocity</AccordionTrigger>
            <AccordionContent>
              <VelocityDisplay actor={actor} />
            </AccordionContent>
          </AccordionItem>

          {/* Type-specific sections */}
          {actor.type === "vehicle" && (
            <AccordionItem value="vehicle">
              <AccordionTrigger className="py-2 text-sm font-medium">Vehicle Controls</AccordionTrigger>
              <AccordionContent>
                <VehicleDetails actorId={actor.id} />
              </AccordionContent>
            </AccordionItem>
          )}

          {actor.type === "sensor" && (
            <AccordionItem value="sensor">
              <AccordionTrigger className="py-2 text-sm font-medium">Sensor Config</AccordionTrigger>
              <AccordionContent>
                <SensorDetails actorId={actor.id} typeId={actor.type_id} />
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>

        <Separator />

        {/* Actions — utility (Teleport) separated from destructive (Destroy)
            by a divider so they don't read as equally weighted, matching
            LeftPanel's lifecycle cluster convention. */}
        <div className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            disabled={spectatorAvailable !== true}
            title={
              spectatorAvailable === false
                ? "Spectator camera control is unavailable in the current CARLA runtime"
                : spectatorAvailable === null
                  ? "Checking spectator camera availability..."
                  : "Move the CARLA spectator camera here (affects the native UE5 editor view; the browser 3D viewport is independent)"
            }
            onClick={async () => {
              try {
                await carlaApi.setSpectator(actor.transform);
                toast.success("Spectator teleported");
              } catch (e) {
                reportError("Teleport", e);
              }
            }}
          >
            <Crosshair className="mr-1.5 size-3" aria-hidden="true" />
            {spectatorAvailable === false
              ? "Spectator Control Unavailable"
              : "Teleport Spectator Here"}
          </Button>

          {/* Traffic lights / signs and the spectator can't be destroyed via
              the python client — hiding the button avoids a noisy failure
              toast. The spectator is a single CARLA-managed actor (id=1,
              type_id="spectator") that represents the native viewport
              camera, not a lifecycle-managed entity. */}
          {actor.type !== "traffic_light" &&
            actor.type !== "traffic_sign" &&
            actor.type_id !== "spectator" && (
          <>
          <Separator className="my-0.5" />
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="destructive" size="sm" className="w-full text-xs" aria-label={`Destroy actor #${actor.id}`}>
                  <Trash2 className="mr-1.5 size-3" aria-hidden="true" /> Destroy Actor
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Destroy Actor #{actor.id}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove {actor.type_id} from the simulation.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={handleDestroy}>
                  Destroy
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          </>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
