
import { reportError } from "@/lib/utils";
import { useState, useEffect, useCallback } from "react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Play,
  Pause,
  SkipForward,
  Cloud,
  Moon,
  Car,
  Settings,
  RotateCcw,
  Trash2,
  PersonStanding,
  Eye,
  Gauge,
  Users,
  Zap,
  PanelLeftClose,
  PanelRightClose,
  PanelBottomClose,
  Activity,
  Map as MapIcon,
  Route,
  BarChart3,
  List,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSimulationStore, useIsConnected } from "@/stores/simulationStore";
import { useActorStore } from "@/stores/actorStore";
import { useSensorStore } from "@/stores/sensorStore";
import { useUIStore } from "@/stores/uiStore";
import { carlaApi } from "@/lib/carla-api";
import { invalidateTopologyCache } from "@/lib/topology-cache";
import { toast } from "sonner";
import { WEATHER_QUICK_PRESETS } from "@/components/controls/weather-quick-presets";

// Icons mirror BottomPanel tab triggers so the same visual language carries
// from tab row → command palette. Previously every Open: * item reused
// PanelBottomClose which made the 5 entries visually indistinguishable.
const BOTTOM_TAB_ITEMS = [
  { tab: "sensors", label: "Sensors", icon: Activity },
  { tab: "map", label: "Mini Map", icon: MapIcon },
  { tab: "roads", label: "Roads", icon: Route },
  { tab: "telemetry", label: "Telemetry", icon: BarChart3 },
  { tab: "events", label: "Event Log", icon: List },
] as const;

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const play = useSimulationStore((s) => s.play);
  const pause = useSimulationStore((s) => s.pause);
  const step = useSimulationStore((s) => s.step);
  const setWeatherPreset = useSimulationStore((s) => s.setWeatherPreset);
  const spawnMultipleVehicles = useActorStore((s) => s.spawnMultipleVehicles);
  const destroyAll = useActorStore((s) => s.destroyAll);
  const setCameraMode = useUIStore((s) => s.setCameraMode);
  const setBottomTab = useUIStore((s) => s.setBottomTab);
  const toggleLeftPanel = useUIStore((s) => s.toggleLeftPanel);
  const toggleRightPanel = useUIStore((s) => s.toggleRightPanel);
  const toggleBottomPanel = useUIStore((s) => s.toggleBottomPanel);
  const togglePerformanceOverlay = useUIStore((s) => s.togglePerformanceOverlay);
  const isConnected = useIsConnected();
  const navigate = useNavigate();

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("open-command-palette", handler);
    return () => window.removeEventListener("open-command-palette", handler);
  }, []);

  const run = useCallback(
    (action: () => Promise<void>, label: string, opts?: { silent?: boolean }) => {
      setOpen(false);
      action()
        .then(() => {
          if (!opts?.silent) toast.success(label);
        })
        .catch((e) => reportError(label, e));
    },
    [],
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <Command className="rounded-lg border shadow-md">
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          <CommandGroup heading="Simulation">
            {/* Simulation-control stores (play/pause/step) catch their own
                errors and fire a reportError toast on failure, so a second
                `Play` success toast on .then would show even when the
                underlying API call failed. UI state (play/pause indicator,
                tick counter) is the primary confirmation here. */}
            <CommandItem onSelect={() => run(() => play(), "Play", { silent: true })} disabled={!isConnected}>
              <Play className="mr-2 size-4" aria-hidden="true" /> Play
            </CommandItem>
            <CommandItem onSelect={() => run(() => pause(), "Pause", { silent: true })} disabled={!isConnected}>
              <Pause className="mr-2 size-4" aria-hidden="true" /> Pause
            </CommandItem>
            <CommandItem onSelect={() => run(() => step(), "Step", { silent: true })} disabled={!isConnected}>
              <SkipForward className="mr-2 size-4" aria-hidden="true" /> Step Forward
            </CommandItem>
            <CommandItem
              onSelect={() =>
                run(async () => {
                  await carlaApi.reload();
                  // Bridge resets the world → existing actor/sensor IDs are
                  // stale. Refresh proactively to avoid ghost rows.
                  // Sensors are derived from actorStore, so chain the calls.
                  // Also drop the cached topology — the world rebuild may
                  // regenerate the OpenDRIVE graph even if the map name
                  // stays the same.
                  invalidateTopologyCache();
                  await useActorStore.getState().refreshActors();
                  useSensorStore.getState().refreshSensors();
                }, "Reload Map")
              }
              disabled={!isConnected}
            >
              <RotateCcw className="mr-2 size-4" aria-hidden="true" /> Reload Map
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Weather">
            {WEATHER_QUICK_PRESETS.map(({ preset, label, icon: Icon }) => (
              <CommandItem
                key={preset}
                onSelect={() =>
                  run(() => setWeatherPreset(preset), label, { silent: true })
                }
                disabled={!isConnected}
              >
                <Icon className="mr-2 size-4" aria-hidden="true" /> {label}
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Scenarios">
            <CommandItem
              onSelect={() =>
                run(async () => {
                  await setWeatherPreset("HardRainNoon");
                }, "Rainy Day scenario", { silent: true })
              }
              disabled={!isConnected}
            >
              <Cloud className="mr-2 size-4" aria-hidden="true" /> Rainy Day
            </CommandItem>
            <CommandItem
              onSelect={() =>
                run(async () => {
                  await setWeatherPreset("HardRainNight");
                }, "Rainy Night scenario", { silent: true })
              }
              disabled={!isConnected}
            >
              <Moon className="mr-2 size-4" aria-hidden="true" /> Rainy Night
            </CommandItem>
            <CommandItem
              onSelect={() =>
                run(async () => {
                  await setWeatherPreset("ClearNoon");
                  await spawnMultipleVehicles(10, "vehicle.tesla.model3");
                }, "Traffic Burst — 10 vehicles", { silent: true })
              }
              disabled={!isConnected}
            >
              <Car className="mr-2 size-4" aria-hidden="true" /> Traffic Burst (10 vehicles)
            </CommandItem>
            <CommandItem
              onSelect={() =>
                run(async () => {
                  await spawnMultipleVehicles(20);
                }, "Spawn 20 NPCs", { silent: true })
              }
              disabled={!isConnected}
            >
              <Users className="mr-2 size-4" aria-hidden="true" /> Spawn 20 NPCs
            </CommandItem>
            <CommandItem
              onSelect={() =>
                run(async () => {
                  const points = await carlaApi.getSpawnPoints();
                  const store = useActorStore.getState();
                  for (let i = 0; i < Math.min(10, points.length); i++) {
                    const transform = points[i];
                    if (!transform) continue;
                    try {
                      await store.spawnWalker({
                        blueprint: "walker.pedestrian.0001",
                        transform,
                      });
                    } catch { break; }
                  }
                }, "Spawn 10 Walkers", { silent: true })
              }
              disabled={!isConnected}
            >
              <PersonStanding className="mr-2 size-4" aria-hidden="true" /> Spawn 10 Walkers
            </CommandItem>
            <CommandItem
              onSelect={() =>
                run(async () => {
                  await setWeatherPreset("HardRainNight");
                  await spawnMultipleVehicles(10, "vehicle.tesla.model3");
                }, "Rainy Night Traffic", { silent: true })
              }
              disabled={!isConnected}
            >
              <Zap className="mr-2 size-4" aria-hidden="true" /> Rainy Night + Traffic
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Actions">
            <CommandItem
              onSelect={() =>
                run(async () => {
                  // Command palette bypasses UI chrome, so no AlertDialog wraps
                  // this item — use native confirm as a lightweight safety gate
                  // against accidental Enter on a fuzzy search hit.
                  if (!window.confirm("Destroy all spawned actors? This cannot be undone.")) return;
                  await destroyAll();
                }, "Destroyed all actors", { silent: true })
              }
              disabled={!isConnected}
            >
              <Trash2 className="mr-2 size-4" aria-hidden="true" /> Destroy All Actors
            </CommandItem>
            <CommandItem onSelect={() => { setCameraMode("follow"); setOpen(false); toast.success("Camera reset to follow mode"); }}>
              <Eye className="mr-2 size-4" aria-hidden="true" /> Reset Camera (Follow)
            </CommandItem>
            <CommandItem onSelect={() => { setCameraMode("birdseye"); setOpen(false); toast.success("Bird's eye view"); }}>
              <Eye className="mr-2 size-4" aria-hidden="true" /> Bird's Eye View
            </CommandItem>
            <CommandItem onSelect={() => { togglePerformanceOverlay(); setOpen(false); }}>
              <Gauge className="mr-2 size-4" aria-hidden="true" /> Toggle Performance Overlay
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Panels">
            <CommandItem onSelect={() => { toggleLeftPanel(); setOpen(false); }}>
              <PanelLeftClose className="mr-2 size-4" aria-hidden="true" /> Toggle Actors Panel
            </CommandItem>
            <CommandItem onSelect={() => { toggleRightPanel(); setOpen(false); }}>
              <PanelRightClose className="mr-2 size-4" aria-hidden="true" /> Toggle Properties Panel
            </CommandItem>
            <CommandItem onSelect={() => { toggleBottomPanel(); setOpen(false); }}>
              <PanelBottomClose className="mr-2 size-4" aria-hidden="true" /> Toggle Bottom Panel
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Bottom panel">
            {BOTTOM_TAB_ITEMS.map(({ tab, label, icon: Icon }) => (
              <CommandItem
                key={tab}
                onSelect={() => { setBottomTab(tab); setOpen(false); }}
              >
                <Icon className="mr-2 size-4" aria-hidden="true" /> Open: {label}
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Navigation">
            <CommandItem onSelect={() => { setOpen(false); navigate("/settings"); }}>
              <Settings className="mr-2 size-4" aria-hidden="true" /> Settings
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
