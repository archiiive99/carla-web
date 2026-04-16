import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Plus, Video } from "lucide-react";
import { getSensorDisplayName } from "@/lib/sensor-registry";
import {
  CAMERA_PRESETS,
  type CameraPresetKey,
} from "@/components/sensors/sensor-camera-presets";

interface EmptyCellProps {
  sensors: Map<number, { id: number; type: string; parent_id: number }>;
  usedSensorIds: Set<number>;
  subscriptions: Set<number>;
  egoVehicleId: number | null;
  showSubscribedOnly: boolean;
  onSelect: (sensorId: number, typeId: string) => void;
  onSelect3D: (preset: CameraPresetKey) => void;
}

// Empty-cell popover — add a CARLA sensor or a 3D camera preset to this
// grid slot. Sorted so the most useful choice is on top: ego-attached
// sensors first, then subscribed feeds, then cameras, then numeric id.
export function EmptyCell({
  sensors,
  usedSensorIds,
  subscriptions,
  egoVehicleId,
  showSubscribedOnly,
  onSelect,
  onSelect3D,
}: EmptyCellProps) {
  const [query, setQuery] = useState("");
  const sensorList = Array.from(sensors.values())
    .sort((a, b) => {
      // Previously ranked via `[ego, sub, cam, id] as const` and compared
      // with `<`, which JS coerces to string and compares
      // lexicographically — id "100" < "5" in that world, so sensors with
      // id ≥ 10 would jump above smaller ids. Compare field-by-field so
      // the sort is stable and numerically correct.
      const aEgo = egoVehicleId !== null && a.parent_id === egoVehicleId ? 0 : 1;
      const bEgo = egoVehicleId !== null && b.parent_id === egoVehicleId ? 0 : 1;
      if (aEgo !== bEgo) return aEgo - bEgo;
      const aSub = subscriptions.has(a.id) ? 0 : 1;
      const bSub = subscriptions.has(b.id) ? 0 : 1;
      if (aSub !== bSub) return aSub - bSub;
      const aCam = a.type.startsWith("sensor.camera.") ? 0 : 1;
      const bCam = b.type.startsWith("sensor.camera.") ? 0 : 1;
      if (aCam !== bCam) return aCam - bCam;
      return a.id - b.id;
    })
    .filter((sensor) => {
      const haystack = `${sensor.id} ${sensor.type} ${getSensorDisplayName(sensor.type)}`.toLowerCase();
      return (
        haystack.includes(query.trim().toLowerCase()) &&
        (!showSubscribedOnly || subscriptions.has(sensor.id))
      );
    });

  return (
    <Card className="flex h-full items-center justify-center border-dashed bg-muted/20 transition-colors hover:bg-muted/40">
      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="size-10 rounded-full border-2 border-dashed border-muted-foreground/70 hover:border-primary/60 hover:bg-primary/5"
              aria-label="Add sensor to cell"
            >
              <Plus className="size-5 text-muted-foreground" aria-hidden="true" />
            </Button>
          }
        />
        <PopoverContent className="w-56 p-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter sensors"
            className="mb-2 h-8 text-xs"
            aria-label="Filter sensors for this grid cell"
          />
          <div className="mb-2 text-3xs text-muted-foreground">
            {showSubscribedOnly
              ? "Showing subscribed feeds only for faster recovery while driving/debugging."
              : "Showing all sensors. Use the toolbar to narrow to subscribed feeds."}
          </div>
          {sensorList.length > 0 && (
            <>
              <div className="mb-1 text-2xs font-medium text-muted-foreground">CARLA Sensors</div>
              <div className="flex flex-col gap-0.5">
                {sensorList.map((s) => (
                  <Button
                    key={s.id}
                    variant="ghost"
                    size="sm"
                    className="h-auto justify-start px-2 py-1.5 text-left text-2xs hover:bg-accent hover:text-accent-foreground"
                    disabled={usedSensorIds.has(s.id)}
                    onClick={() => onSelect(s.id, s.type)}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {getSensorDisplayName(s.type)}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1 text-3xs text-muted-foreground">
                        <span className="font-mono">#{s.id}</span>
                        {egoVehicleId !== null && s.parent_id === egoVehicleId && (
                          <Badge variant="secondary" className="h-4 px-1 text-3xs">ego</Badge>
                        )}
                        {subscriptions.has(s.id) && (
                          <Badge variant="secondary" className="h-4 px-1 text-3xs">subscribed</Badge>
                        )}
                        {usedSensorIds.has(s.id) && (
                          <Badge variant="outline" className="h-4 px-1 text-3xs">in grid</Badge>
                        )}
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
              <div className="my-1 border-t" />
            </>
          )}
          <div className="mb-1 text-2xs font-medium text-muted-foreground">3D Camera Views</div>
          <div className="flex flex-col gap-0.5">
            {(Object.keys(CAMERA_PRESETS) as CameraPresetKey[]).map((key) => (
              <Button
                key={key}
                variant="ghost"
                size="sm"
                className="justify-start gap-1.5 text-2xs"
                onClick={() => onSelect3D(key)}
              >
                <Video className="size-3" aria-hidden="true" />
                {CAMERA_PRESETS[key].label}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </Card>
  );
}
