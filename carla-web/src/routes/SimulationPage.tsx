import { useEffect } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { StatusBar } from "@/components/layout/StatusBar";
import { ResizableLayout } from "@/components/layout/ResizableLayout";
import { WorkerProvider } from "@/contexts/WorkerContext";
import { WorldCanvas } from "@/components/viewport/WorldCanvas";
import { useUIStore } from "@/stores/uiStore";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { usePerformanceMonitor } from "@/hooks/usePerformanceMonitor";
import { useConnectionHealth } from "@/hooks/useConnectionHealth";
import { useSimulationStore } from "@/stores/simulationStore";
import { useActorStore } from "@/stores/actorStore";
import { useSensorStore } from "@/stores/sensorStore";
import { CommandPalette } from "@/components/shared/CommandPalette";
import { ConnectionOverlay } from "@/components/shared/ConnectionOverlay";
import { BRIDGE_URL_DEFAULT, BRIDGE_URL_KEY } from "@/constants";
import { normalizeBridgeUrl } from "@/lib/bridge-url";
import { subscribeVisible } from "@/lib/utils";

export default function SimulationPage() {
  const bridgeUrl = useSimulationStore((s) => s.bridgeUrl);
  const connectionStatus = useSimulationStore((s) => s.connectionStatus);
  const connect = useSimulationStore((s) => s.connect);
  const refreshActors = useActorStore((s) => s.refreshActors);
  const refreshSensors = useSensorStore((s) => s.refreshSensors);

  useKeyboardShortcuts();
  usePerformanceMonitor();
  useConnectionHealth();

  useEffect(() => {
    // Always use same-origin URL so Vite proxy handles bridge routing.
    // This avoids port-forwarding issues (VS Code SSH, tunnels, etc.)
    localStorage.removeItem(BRIDGE_URL_KEY);
    connect(BRIDGE_URL_DEFAULT);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (connectionStatus === "connected") {
      refreshActors();
      refreshSensors();
    }
  }, [connectionStatus, refreshActors, refreshSensors]);

  useEffect(() => {
    const map = useSimulationStore.getState().currentMap;
    const mapName = map ? map.split('/').pop() : '';
    document.title = connectionStatus === 'connected'
      ? `CARLA Web — ${mapName || 'Connected'}`
      : 'CARLA Web — Disconnected';
  }, [connectionStatus]);

  useEffect(() => {
    if (connectionStatus !== "connected") return;
    const tick = () => {
      if (document.visibilityState === "hidden") return;
      useActorStore.getState().refreshActors();
      useSensorStore.getState().refreshSensors();
    };
    const interval = setInterval(tick, 2000);
    const unsubscribeVisibility = subscribeVisible(tick);
    return () => {
      clearInterval(interval);
      unsubscribeVisibility();
    };
  }, [connectionStatus]);

  const focusMainContent = () => {
    const mainContent = document.getElementById("main-content");
    if (!mainContent) return;
    window.location.hash = "main-content";
    mainContent.focus();
  };

  return (
    <WorkerProvider>
      {/* Single source of 3D truth. Sits behind the DOM layout (z-0) and
          renders the shared world scene into every registered viewport
          rect (main 3D pane + every sensor-cell RGB/preset camera) via
          the compositor. Layout below is relative+z-10 so the fixed-
          position canvas paints underneath panels and toolbars. */}
      <WorldCanvasMount />
      <div className="relative z-10 flex h-screen flex-col overflow-hidden">
        <a
          href="#main-content"
          onClick={(event) => {
            event.preventDefault();
            focusMainContent();
          }}
          className="sr-only absolute left-3 top-3 z-50 rounded-md bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm ring-1 ring-border focus:not-sr-only focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Skip to main content
        </a>
        <TopBar />
        <div className="flex-1 overflow-hidden p-2">
          <ResizableLayout />
        </div>
        <StatusBar />
        <ConnectionOverlay />
        <CommandPalette />
      </div>
    </WorkerProvider>
  );
}

function WorldCanvasMount() {
  const showCityEnvironment = useUIStore((s) => s.showCityEnvironment);
  return <WorldCanvas showCityEnvironment={showCityEnvironment} />;
}
