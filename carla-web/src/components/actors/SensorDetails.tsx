
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Eye, EyeOff, ExternalLink, Link as LinkIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSensorStore } from "@/stores/sensorStore";
import { useActorStore } from "@/stores/actorStore";
import { useUIStore } from "@/stores/uiStore";
import { getSensorDisplayName } from "@/lib/sensor-registry";

interface SensorDetailsProps {
  actorId: number;
  typeId: string;
}

export function SensorDetails({ actorId, typeId }: SensorDetailsProps) {
  const subscriptions = useSensorStore((s) => s.subscriptions);
  const pendingSubscriptions = useSensorStore((s) => s.pendingSubscriptions);
  const subscribe = useSensorStore((s) => s.subscribe);
  const unsubscribe = useSensorStore((s) => s.unsubscribe);
  const actors = useActorStore((s) => s.actors);
  const selectActor = useActorStore((s) => s.selectActor);
  const sensor = actors.get(actorId);
  const parentId = sensor?.parent_id ?? null;
  const parent = parentId != null ? actors.get(parentId) : undefined;

  const isSubscribed = subscriptions.has(actorId);
  const isPending = pendingSubscriptions.has(actorId);

  const toggleSubscription = useCallback(() => {
    if (isSubscribed) {
      unsubscribe(actorId);
    } else {
      subscribe(actorId);
    }
  }, [actorId, isSubscribed, subscribe, unsubscribe]);

  const openInSensorPanel = useCallback(() => {
    // Make the panel visible first so the user can actually see what their
    // click did. BottomPanel might be collapsed (⚠ hidden from view) or
    // parked on a different tab (Map / Roads / Telemetry / Events) —
    // force-open + switch to Sensors tab, then dispatch the grid-add event.
    const ui = useUIStore.getState();
    if (!ui.bottomPanelOpen) ui.setBottomPanelOpen(true);
    if (ui.bottomPanelTab !== "sensors") ui.setBottomTab("sensors");
    window.dispatchEvent(
      new CustomEvent("sensor-panel:open", {
        detail: { sensorId: actorId, typeId },
      }),
    );
    toast.success(`${getSensorDisplayName(typeId)} #${actorId} added to sensor grid`);
  }, [actorId, typeId]);

  const loc = sensor?.transform.location;
  const rot = sensor?.transform.rotation;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Type</Label>
        <Badge variant="secondary" className="h-4 px-1.5 text-2xs">
          {getSensorDisplayName(typeId)}
        </Badge>
      </div>

      {parentId != null && (
        <div className="flex items-center justify-between">
          <Label className="text-xs">Parent</Label>
          {parent ? (
            <Button
              variant="outline"
              size="sm"
              className="h-5 gap-1 px-1.5 text-2xs text-muted-foreground hover:text-foreground"
              onClick={() => selectActor(parentId)}
              title={`Go to actor #${parentId}`}
              aria-label={`Select parent actor #${parentId}`}
            >
              <LinkIcon className="size-2.5" aria-hidden="true" />
              #{parentId} {parent.type_id.split(".").slice(-2).join(" ")}
            </Button>
          ) : (
            <Badge variant="outline" className="h-5 px-1.5 text-2xs tabular-nums text-muted-foreground">
              #{parentId} (unknown)
            </Badge>
          )}
        </div>
      )}

      {loc && rot && (
        <div className="space-y-1 text-2xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Local position</span>
            <span className="font-mono tabular-nums text-foreground">
              {loc.x.toFixed(1)}, {loc.y.toFixed(1)}, {loc.z.toFixed(1)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Rotation (°)</span>
            <span className="font-mono tabular-nums text-foreground">
              {rot.pitch.toFixed(0)}, {rot.yaw.toFixed(0)}, {rot.roll.toFixed(0)}
            </span>
          </div>
        </div>
      )}

      <Separator />

      <div className="space-y-2">
        <Button
          variant={isSubscribed ? "default" : "outline"}
          size="sm"
          className="w-full gap-1.5 text-xs"
          onClick={toggleSubscription}
          disabled={isPending}
          aria-busy={isPending}
        >
          {isPending ? (
            <>
              <Loader2 className="size-3 animate-spin" aria-hidden="true" /> Subscribing…
            </>
          ) : isSubscribed ? (
            <>
              <EyeOff className="size-3" aria-hidden="true" /> Unsubscribe
            </>
          ) : (
            <>
              <Eye className="size-3" aria-hidden="true" /> Subscribe
            </>
          )}
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5 text-xs"
          onClick={openInSensorPanel}
          title="Add this sensor to the bottom panel grid"
        >
          <ExternalLink className="size-3" aria-hidden="true" /> Open in Sensor Panel
        </Button>
      </div>
    </div>
  );
}
