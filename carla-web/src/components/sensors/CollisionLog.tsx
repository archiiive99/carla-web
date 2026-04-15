
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCollisionData } from "@/hooks/useSensorData";

interface CollisionEntry {
  id: number;
  timestamp: number;
  otherActorType: string;
  impulse: number;
}

function getSeverity(impulse: number): {
  label: string;
  className: string;
} {
  if (impulse > 1000) return { label: "Heavy", className: "bg-destructive/10 text-destructive" };
  if (impulse > 100) return { label: "Medium", className: "bg-warning/10 text-warning" };
  return { label: "Light", className: "bg-success/10 text-success" };
}

interface CollisionLogProps {
  sensorId: number;
  className?: string;
}

export default function CollisionLog({ sensorId, className }: CollisionLogProps) {
  const [events, setEvents] = useState<CollisionEntry[]>([]);
  const { eventsRef } = useCollisionData(sensorId);

  useEffect(() => {
    const interval = setInterval(() => {
      setEvents(
        eventsRef.current
          .slice()
          .reverse()
          .map((event, index) => ({
            id: index,
            timestamp: event.timestamp,
            otherActorType: event.otherActorId ? `Actor #${event.otherActorId}` : "Unknown",
            impulse: event.magnitude,
          })),
      );
    }, 100);
    return () => clearInterval(interval);
  }, [eventsRef]);

  return (
    <Card className={cn("flex h-full flex-col overflow-hidden", className)}>
      <CardHeader className="flex-row items-center justify-between space-y-0 pl-3 pr-14 py-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-xs font-medium">
            Collision Detector
          </CardTitle>
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
              <AlertTriangle className="size-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-xs text-muted-foreground">
                No collisions recorded
              </p>
            </div>
          ) : (
            <div className="space-y-0.5 p-2">
              {events.map((event) => {
                const severity = getSeverity(event.impulse);
                return (
                  <div
                    key={event.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
                  >
                    <Badge
                      className={cn("h-5 px-1.5 text-2xs", severity.className)}
                    >
                      {severity.label}
                    </Badge>
                    <span className="flex-1 truncate">
                      {event.otherActorType}
                    </span>
                    <span
                      className="font-mono tabular-nums text-muted-foreground"
                      title="Collision normal impulse magnitude"
                    >
                      {event.impulse.toFixed(0)} N·s
                    </span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {event.timestamp.toFixed(2)}s
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
