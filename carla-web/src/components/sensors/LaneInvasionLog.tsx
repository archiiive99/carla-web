
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLaneInvasionData } from "@/hooks/useSensorData";

interface LaneInvasionEntry {
  timestamp: number;
  markingTypes: string[];
}

interface LaneInvasionLogProps {
  sensorId: number;
  className?: string;
}

// CARLA's LaneMarking::Type enum (LibCarla/source/carla/road/element/
// LaneMarking.h). The sensor emits integer codes; render names so the
// log reads as "Solid / Broken" instead of the cryptic "2 / 1".
const LANE_MARKING_NAMES: Record<number, string> = {
  0: "Other",
  1: "Broken",
  2: "Solid",
  3: "SolidSolid",
  4: "SolidBroken",
  5: "BrokenSolid",
  6: "BrokenBroken",
  7: "BottsDots",
  8: "Grass",
  9: "Curb",
  10: "None",
};

function markingTypeName(code: number): string {
  return LANE_MARKING_NAMES[code] ?? String(code);
}

export default function LaneInvasionLog({
  sensorId,
  className,
}: LaneInvasionLogProps) {
  const [events, setEvents] = useState<LaneInvasionEntry[]>([]);
  const { eventsRef } = useLaneInvasionData(sensorId);
  // Track last-seen signature so we only setEvents when the source buffer has
  // actually moved on — see CollisionLog for the same pattern.
  const lastSignatureRef = useRef("");

  useEffect(() => {
    const interval = setInterval(() => {
      const source = eventsRef.current;
      const newest = source[source.length - 1];
      const signature = newest ? `${source.length}:${newest.timestamp}` : "0";
      if (signature === lastSignatureRef.current) return;
      lastSignatureRef.current = signature;
      setEvents(
        source
          .slice()
          .reverse()
          .map((event) => ({
            timestamp: event.timestamp,
            markingTypes: event.markingTypes.map(markingTypeName),
          })),
      );
    }, 100);
    return () => clearInterval(interval);
  }, [eventsRef]);

  return (
    <Card className={cn("flex h-full flex-col overflow-hidden", className)}>
      <CardHeader className="flex-row items-center justify-between space-y-0 pl-3 pr-14 py-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-xs font-medium">Lane Invasion</CardTitle>
          <Badge variant="secondary" className="h-4 px-1 text-2xs">
            #{sensorId}
          </Badge>
        </div>
        <Badge variant="secondary" className="h-4 px-1.5 text-2xs tabular-nums">
          {events.length}
        </Badge>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        <ScrollArea className="h-full">
          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
              <ArrowLeftRight className="size-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-xs text-muted-foreground">
                No lane invasions recorded
              </p>
            </div>
          ) : (
            <div className="space-y-0.5 p-2">
              {events.map((event) => (
                <div
                  key={`${event.timestamp}-${event.markingTypes.join(",")}`}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
                >
                  <div className="flex flex-1 gap-1">
                    {event.markingTypes.map((type, i) => (
                      <Badge
                        key={`${type}-${i}`}
                        variant="secondary"
                        className="h-4 px-1 text-2xs"
                      >
                        {type}
                      </Badge>
                    ))}
                  </div>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {event.timestamp.toFixed(2)}s
                  </span>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
