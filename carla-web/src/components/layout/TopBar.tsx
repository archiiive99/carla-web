
import { useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Settings,
  Map,
  Sun,
  Moon,
  Camera,
  Bot,
  User,
  PanelLeftClose,
  PanelRightClose,
  PanelBottomClose,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useSimulationStore } from "@/stores/simulationStore";
import { SimulationControls } from "@/components/controls/SimulationControls";
import { WeatherControls } from "@/components/controls/WeatherControls";
import { RecordingControls } from "@/components/scenario/RecordingControls";
import { MapControls } from "@/components/controls/MapControls";
import { TrafficManagerPanel } from "@/components/actors/TrafficManagerPanel";
import { DataExportMenu } from "@/components/shared/DataExportMenu";
import { useUIStore } from "@/stores/uiStore";
import { useSensorStore } from "@/stores/sensorStore";
import { usePerformanceStore } from "@/stores/performanceStore";
import { useActorStore } from "@/stores/actorStore";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatMapName } from "@/lib/utils";
import { ConnectionBadge } from "./ConnectionBadge";
import { ShortcutsDialog } from "./ShortcutsDialog";

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${s.toFixed(3).padStart(6, "0")}`;
}

export function TopBar() {
  const connectionStatus = useSimulationStore((s) => s.connectionStatus);
  const currentMap = useSimulationStore((s) => s.currentMap);
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const leftPanelOpen = useUIStore((s) => s.leftPanelOpen);
  const rightPanelOpen = useUIStore((s) => s.rightPanelOpen);
  const bottomPanelOpen = useUIStore((s) => s.bottomPanelOpen);
  const toggleLeftPanel = useUIStore((s) => s.toggleLeftPanel);
  const toggleRightPanel = useUIStore((s) => s.toggleRightPanel);
  const toggleBottomPanel = useUIStore((s) => s.toggleBottomPanel);
  const showShortcutsDialog = useUIStore((s) => s.showShortcutsDialog);
  const setShowShortcutsDialog = useUIStore((s) => s.setShowShortcutsDialog);
  const sensorCount = useSensorStore((s) => s.subscriptions.size);
  const egoVehicleId = useActorStore((s) => s.egoVehicleId);
  const setAutopilot = useActorStore((s) => s.setAutopilot);
  const autopilotOn = useActorStore((s) => s.egoAutopilot);

  const simTimeRef = useRef<HTMLSpanElement>(null);
  const tickRef = useRef<HTMLSpanElement>(null);
  const fpsRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const unsub = useSimulationStore.subscribe((state) => {
      if (simTimeRef.current)
        simTimeRef.current.textContent = formatTime(state.elapsedTime);
      if (tickRef.current)
        tickRef.current.textContent = `T${state.currentTick}`;
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = usePerformanceStore.subscribe((state) => {
      if (fpsRef.current) {
        fpsRef.current.textContent = `${state.fps} FPS`;
      }
    });
    return unsub;
  }, []);

  return (
    <header className="flex h-12 shrink-0 flex-nowrap items-center justify-between gap-2 overflow-hidden border-b px-3">
      <div className="flex min-w-0 shrink flex-nowrap items-center gap-2.5 overflow-hidden whitespace-nowrap">
        <span className="text-sm font-semibold tracking-tight">CARLA Web</span>
        <Separator orientation="vertical" className="h-4" />
        <ConnectionBadge status={connectionStatus} />
      </div>

      <div className="flex min-w-0 shrink flex-nowrap items-center gap-2 overflow-hidden whitespace-nowrap">
        <span ref={simTimeRef} className="font-mono text-xs tabular-nums text-muted-foreground">
          00:00:00.000
        </span>
        <Separator orientation="vertical" className="h-4" />
        <span ref={tickRef} className="font-mono text-xs tabular-nums text-muted-foreground">
          T0
        </span>
        <Separator orientation="vertical" className="h-4" />
        <Badge variant="secondary" className="max-w-44 gap-1 overflow-hidden text-xs" aria-label={currentMap ? `Current map ${formatMapName(currentMap)}` : "No map loaded"}>
          <Map className="size-3" aria-hidden="true" />
          <span className="truncate">{currentMap ? formatMapName(currentMap) : "No map"}</span>
        </Badge>
        {sensorCount > 0 && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Badge variant="secondary" className="gap-1 text-xs" aria-label={`${sensorCount} subscribed sensor feed${sensorCount === 1 ? "" : "s"}`}>
                  <Camera className="size-3" aria-hidden="true" />{sensorCount}
                </Badge>
              }
            />
            <TooltipContent side="bottom">
              {sensorCount} subscribed sensor feed{sensorCount === 1 ? "" : "s"}
            </TooltipContent>
          </Tooltip>
        )}
        <Separator orientation="vertical" className="h-4" />
        <span ref={fpsRef} className="font-mono text-xs tabular-nums text-muted-foreground">
          0 FPS
        </span>
      </div>

      <div className="flex shrink-0 flex-nowrap items-center gap-2 whitespace-nowrap">
        <SimulationControls />

        {egoVehicleId !== null && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={autopilotOn ? "default" : "outline"}
                  size="icon-sm"
                  disabled={connectionStatus !== "connected"}
                  className={autopilotOn ? "bg-info text-info-foreground hover:bg-info/90" : ""}
                  onClick={() => {
                    const next = !autopilotOn;
                    setAutopilot(egoVehicleId, next).catch(() => {});
                  }}
                  aria-label={autopilotOn ? "Disable autopilot" : "Enable autopilot"}
                >
                  {autopilotOn ? <Bot className="size-3.5" aria-hidden="true" /> : <User className="size-3.5" aria-hidden="true" />}
                </Button>
              }
            />
            <TooltipContent side="bottom">
              {connectionStatus !== "connected"
                ? "Autopilot unavailable while disconnected"
                : autopilotOn
                  ? "Autopilot ON — click to drive manually"
                  : "Manual — click to enable autopilot"}
            </TooltipContent>
          </Tooltip>
        )}

        <Separator orientation="vertical" className="h-4" />

        <WeatherControls />
        <MapControls />
        <TrafficManagerPanel />
        <RecordingControls />
        <DataExportMenu />

        <Separator orientation="vertical" className="h-4" />

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={leftPanelOpen ? "ghost" : "secondary"}
                size="icon-sm"
                aria-label={leftPanelOpen ? "Hide actor panel" : "Show actor panel"}
                onClick={toggleLeftPanel}
              >
                <PanelLeftClose className="size-3.5" aria-hidden="true" />
              </Button>
            }
          />
          <TooltipContent side="bottom">
            {leftPanelOpen ? "Hide Actors panel" : "Show Actors panel"} <span className="ml-1 text-muted-foreground">B</span>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={rightPanelOpen ? "ghost" : "secondary"}
                size="icon-sm"
                aria-label={rightPanelOpen ? "Hide properties panel" : "Show properties panel"}
                onClick={toggleRightPanel}
              >
                <PanelRightClose className="size-3.5" aria-hidden="true" />
              </Button>
            }
          />
          <TooltipContent side="bottom">
            {rightPanelOpen ? "Hide Properties panel" : "Show Properties panel"}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={bottomPanelOpen ? "ghost" : "secondary"}
                size="icon-sm"
                aria-label={bottomPanelOpen ? "Hide bottom panel" : "Show bottom panel"}
                onClick={toggleBottomPanel}
              >
                <PanelBottomClose className="size-3.5" aria-hidden="true" />
              </Button>
            }
          />
          <TooltipContent side="bottom">
            {bottomPanelOpen ? "Hide bottom panel" : "Show bottom panel"}
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-4" />

        <ShortcutsDialog
          open={showShortcutsDialog}
          onOpenChange={setShowShortcutsDialog}
        />

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              >
                {theme === 'dark' ? <Sun className="size-3.5" aria-hidden="true" /> : <Moon className="size-3.5" aria-hidden="true" />}
              </Button>
            }
          />
          <TooltipContent side="bottom">
            {theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Link
                to="/settings"
                aria-label="Open settings"
                className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Settings className="size-3.5" aria-hidden="true" />
              </Link>
            }
          />
          <TooltipContent side="bottom">Settings</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
