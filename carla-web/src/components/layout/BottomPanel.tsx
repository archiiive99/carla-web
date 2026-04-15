
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Activity, BarChart3, List, Map, Route } from "lucide-react";
import { SensorPanel } from "@/components/sensors/SensorPanel";
import { MiniMap } from "@/components/map/MiniMap";
import { OpenDriveViewer } from "@/components/map/OpenDriveViewer";
import { EventLog } from "@/components/shared/EventLog";
import { useEventLog } from "@/stores/eventStore";
import { TelemetryPanel } from "@/components/shared/TelemetryPanel";
import { useActorStore } from "@/stores/actorStore";
import { useUIStore } from "@/stores/uiStore";

const TAB_IDS = {
  sensors: "bottom-tab-sensors",
  map: "bottom-tab-map",
  roads: "bottom-tab-roads",
  telemetry: "bottom-tab-telemetry",
  events: "bottom-tab-events",
} as const;

const PANEL_IDS = {
  sensors: "bottom-panel-sensors",
  map: "bottom-panel-map",
  roads: "bottom-panel-roads",
  telemetry: "bottom-panel-telemetry",
  events: "bottom-panel-events",
} as const;

export function BottomPanel() {
  const { events, clearEvents } = useEventLog();
  const sensorCount = useActorStore((s) => s.actorsByType.sensors.length);
  const bottomPanelTab = useUIStore((s) => s.bottomPanelTab);
  const setBottomTab = useUIStore((s) => s.setBottomTab);

  return (
    <section
      aria-label="Sensor and telemetry panels"
      className="flex h-full flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm"
    >
      <Tabs value={bottomPanelTab} onValueChange={(value) => setBottomTab(value as typeof bottomPanelTab)} className="flex h-full flex-col gap-0">
        <div className="flex shrink-0 items-center overflow-x-auto border-b px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsList
            variant="line"
            aria-label="Bottom panel views"
            className="h-9"
          >
            <TabsTrigger
              id={TAB_IDS.sensors}
              aria-controls={PANEL_IDS.sensors}
              value="sensors"
              className="gap-1.5 text-xs"
            >
              <Activity className="size-3.5" />
              Sensors
              {sensorCount > 0 && (
                <Badge
                  variant="secondary"
                  aria-hidden="true"
                  className="ml-1 h-5 px-1.5 text-2xs tabular-nums"
                >
                  {sensorCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              id={TAB_IDS.map}
              aria-controls={PANEL_IDS.map}
              value="map"
              className="gap-1.5 text-xs"
            >
              <Map className="size-3.5" />
              Map
            </TabsTrigger>
            <TabsTrigger
              id={TAB_IDS.roads}
              aria-controls={PANEL_IDS.roads}
              value="roads"
              className="gap-1.5 text-xs"
            >
              <Route className="size-3.5" />
              Roads
            </TabsTrigger>
            <TabsTrigger
              id={TAB_IDS.telemetry}
              aria-controls={PANEL_IDS.telemetry}
              value="telemetry"
              className="gap-1.5 text-xs"
            >
              <BarChart3 className="size-3.5" />
              Telemetry
            </TabsTrigger>
            <TabsTrigger
              id={TAB_IDS.events}
              aria-controls={PANEL_IDS.events}
              value="events"
              className="gap-1.5 text-xs"
            >
              <List className="size-3.5" />
              Events
              {events.length > 0 && (
                <Badge
                  variant="secondary"
                  aria-hidden="true"
                  className="ml-1 h-5 px-1.5 text-2xs tabular-nums"
                >
                  {events.length > 99 ? "99+" : events.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          id={PANEL_IDS.sensors}
          aria-labelledby={TAB_IDS.sensors}
          value="sensors"
          className="flex-1 overflow-hidden"
        >
          <SensorPanel />
        </TabsContent>

        <TabsContent
          id={PANEL_IDS.map}
          aria-labelledby={TAB_IDS.map}
          value="map"
          className="flex-1 overflow-hidden"
        >
          <MiniMap />
        </TabsContent>

        <TabsContent
          id={PANEL_IDS.roads}
          aria-labelledby={TAB_IDS.roads}
          value="roads"
          className="flex-1 overflow-hidden"
        >
          <OpenDriveViewer />
        </TabsContent>

        <TabsContent
          id={PANEL_IDS.telemetry}
          aria-labelledby={TAB_IDS.telemetry}
          value="telemetry"
          className="flex-1 overflow-hidden"
        >
          <TelemetryPanel />
        </TabsContent>

        <TabsContent
          id={PANEL_IDS.events}
          aria-labelledby={TAB_IDS.events}
          value="events"
          className="flex-1 overflow-hidden"
        >
          <EventLog events={events} onClear={clearEvents} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
