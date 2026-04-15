
import { useCallback, useRef, useEffect, useState } from "react";
import { type EventType, type LogEvent } from "@/stores/eventStore";

// Re-export types only — value/function re-exports from this file break Vite
// Fast Refresh (mixing component + non-component exports invalidates HMR).
// Callers that need `useEventLog` or `useEventStore` should import from
// `@/stores/eventStore` directly.
export type { EventType, LogEvent };
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Toggle } from "@/components/ui/toggle";
import {
  AlertTriangle,
  ArrowLeftRight,
  Wifi,
  Cloud,
  Car,
  Map as MapIcon,
  List,
  Trash2,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";

const EVENT_ICONS: Record<EventType, React.ReactNode> = {
  collision: <AlertTriangle className="size-3 text-chart-1" aria-hidden="true" />,
  lane_invasion: <ArrowLeftRight className="size-3 text-chart-2" aria-hidden="true" />,
  spawn: <Car className="size-3 text-chart-3" aria-hidden="true" />,
  destroy: <Trash2 className="size-3 text-chart-7" aria-hidden="true" />,
  connection: <Wifi className="size-3 text-chart-4" aria-hidden="true" />,
  weather: <Cloud className="size-3 text-chart-5" aria-hidden="true" />,
  map: <MapIcon className="size-3 text-chart-6" aria-hidden="true" />,
};

const EVENT_COLORS: Record<EventType, string> = {
  collision: "bg-chart-1/10 text-chart-1",
  lane_invasion: "bg-chart-2/10 text-chart-2",
  spawn: "bg-chart-3/10 text-chart-3",
  destroy: "bg-chart-7/10 text-chart-7",
  connection: "bg-chart-4/10 text-chart-4",
  weather: "bg-chart-5/10 text-chart-5",
  map: "bg-chart-6/10 text-chart-6",
};

interface EventLogProps {
  events: LogEvent[];
  onClear: () => void;
  className?: string;
}

export function EventLog({ events, onClear, className }: EventLogProps) {
  const [autoScroll, setAutoScroll] = useState(true);
  const [filters, setFilters] = useState<Set<EventType>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const toggleFilter = useCallback((type: EventType) => {
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const filteredEvents =
    filters.size === 0
      ? events
      : events.filter((e) => filters.has(e.type));

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredEvents.length, autoScroll]);

  const exportEvents = useCallback(() => {
    const csv = [
      "timestamp,type,message",
      ...events.map(
        (e) => `${e.timestamp.toFixed(3)},${e.type},"${e.message.replace(/"/g, '""')}"`,
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "events.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [events]);

  return (
    <div className={cn("flex h-full flex-col", className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <div
          className="flex flex-1 flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Filter events by type"
        >
          {(
            ["collision", "lane_invasion", "spawn", "destroy", "connection", "weather", "map"] as const
          ).map((type) => {
            const pressed = filters.has(type);
            const prettyType = type.replace(/_/g, " ");
            return (
              <Toggle
                key={type}
                size="xs"
                pressed={pressed}
                onPressedChange={() => toggleFilter(type)}
                title={`${pressed ? "Hide" : "Show only"}: ${prettyType} events`}
                aria-label={`${pressed ? "Stop showing only" : "Show only"} ${prettyType} events`}
                aria-pressed={pressed}
              >
                {EVENT_ICONS[type]}
              </Toggle>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Switch
              id="auto-scroll"
              checked={autoScroll}
              onCheckedChange={setAutoScroll}
              className="peer"
              aria-label="Auto-scroll event log to latest"
            />
            <Label htmlFor="auto-scroll" className="cursor-pointer text-xs text-muted-foreground peer-disabled:opacity-50">
              Follow latest
            </Label>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={exportEvents}
            title="Export events as CSV"
            aria-label="Export events as CSV"
          >
            <Download className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClear}
            title="Clear event log"
            aria-label="Clear event log"
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>

      {/* Events */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        {filteredEvents.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <List className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-xs font-medium text-muted-foreground">No events yet</p>
            <p className="text-2xs text-muted-foreground">Events from collisions, spawns, and weather changes will appear here.</p>
          </div>
        ) : (
          <div className="space-y-0.5 p-2">
            {filteredEvents.map((event) => (
              <div
                key={event.id}
                className="flex items-center gap-3 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
              >
                <span className="font-mono tabular-nums text-2xs text-muted-foreground">
                  {new Date(event.timestamp * 1000).toLocaleTimeString()}
                </span>
                <Badge
                  className={cn(
                    "h-4 px-1 text-2xs",
                    EVENT_COLORS[event.type],
                  )}
                >
                  {event.type}
                </Badge>
                <span className="flex-1 truncate">{event.message}</span>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
