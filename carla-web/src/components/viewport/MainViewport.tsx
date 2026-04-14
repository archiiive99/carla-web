import { useEffect } from "react";
import { Bird, Eye, Move3d, User, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore, type CameraMode } from "@/stores/uiStore";
import { PerformanceOverlay } from "@/components/shared/PerformanceOverlay";
import { useActorStore } from "@/stores/actorStore";
import { VehicleControls } from "@/components/controls/VehicleControls";
import { BRIDGE_EGO_ROLE } from "@/constants";
import { useEgoVehicleResolution } from "@/hooks/useEgoVehicleResolution";
import { FullscreenToggle } from "./FullscreenToggle";
import { ViewportBody } from "./ViewportBody";

interface MainViewportProps {
  className?: string;
}

// Main viewport chrome. The 3D scene itself is rendered by the single root
// WorldCanvas (mounted at the SimulationPage root). This component's
// <main> is pointer-events-none in empty areas so clicks in the 3D area
// reach the shared canvas; every interactive overlay below re-enables
// pointer events explicitly.
export function MainViewport({ className }: MainViewportProps) {
  const cameraMode = useUIStore((s) => s.cameraMode);
  const setCameraMode = useUIStore((s) => s.setCameraMode);
  const showPerformanceOverlay = useUIStore((s) => s.showPerformanceOverlay);
  const selectedActorId = useActorStore((s) => s.selectedActorId);
  const egoVehicleId = useActorStore((s) => s.egoVehicleId);
  const actors = useActorStore((s) => s.actors);
  useEgoVehicleResolution();

  const wasdTargetId = egoVehicleId;

  useEffect(() => {
    if (selectedActorId !== null) return;
    if (egoVehicleId !== null && actors.has(egoVehicleId)) {
      useActorStore.getState().selectActor(egoVehicleId);
      return;
    }
    const managed = Array.from(actors.values()).find(
      (actor) => actor.type === "vehicle" && actor.role_name === BRIDGE_EGO_ROLE,
    );
    if (managed) {
      useActorStore.getState().selectActor(managed.id);
    }
  }, [actors, selectedActorId, egoVehicleId]);

  const cameraModes: Array<{ mode: CameraMode; icon: typeof Video; label: string }> = [
    { mode: "camera-match", icon: Video, label: "Match Ego RGB" },
    { mode: "follow", icon: Eye, label: "Third Person" },
    { mode: "fpv", icon: User, label: "First Person" },
    { mode: "orbit", icon: Move3d, label: "Free Orbit" },
    { mode: "birdseye", icon: Bird, label: "Bird's Eye" },
  ];

  return (
    <main
      id="main-content"
      aria-label="Simulation viewport"
      tabIndex={-1}
      className={cn("pointer-events-none relative h-full w-full bg-transparent", className)}
    >
      <div className="pointer-events-auto absolute left-2 top-2 z-30 flex items-start gap-2">
        <FullscreenToggle />
      </div>

      <div className="pointer-events-auto absolute right-2 top-2 z-30 flex items-center gap-1 rounded-md border border-border/60 bg-background/80 p-1 shadow-sm backdrop-blur-sm">
        {cameraModes.map(({ mode, icon: Icon, label }) => {
          const active = cameraMode === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setCameraMode(mode)}
              title={label}
              aria-label={label}
              aria-pressed={active}
              className={cn(
                "flex size-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                active && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
            </button>
          );
        })}
      </div>

      <ViewportBody />

      {showPerformanceOverlay && <PerformanceOverlay />}

      {wasdTargetId != null && (
        <VehicleControls actorId={wasdTargetId} enabled />
      )}
    </main>
  );
}
