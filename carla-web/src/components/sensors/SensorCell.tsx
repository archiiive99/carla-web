import { Suspense, lazy } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Maximize2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SENSOR_REGISTRY } from "@/lib/sensor-registry";
import { useSensorStore } from "@/stores/sensorStore";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import type { CellState } from "./sensor-cell-types";

const SensorCameraView = lazy(() => import("@/components/sensors/SensorCameraView"));

const HOVER_BTN =
  "border border-border/60 bg-overlay-bg/30 hover:bg-overlay-bg/60";

interface SensorCellProps {
  cell: CellState;
  onMaximize: () => void;
  onRemove: () => void;
}

// A single cell in the sensor grid. Renders either a 3D camera preset or a
// real CARLA sensor feed via the SENSOR_REGISTRY. Hover controls (maximize /
// remove) are overlayed in the top-right so the cell chrome stays uniform
// across the two very different rendering paths — that uniformity is the
// whole reason this lives in one component.
export function SensorCell({ cell, onMaximize, onRemove }: SensorCellProps) {
  // Controls were hidden until hover. That broke keyboard-only users (the
  // maximize/remove buttons weren't reachable without a prior hover) and
  // touch devices (no hover state). Keep them persistently visible at
  // reduced opacity and lift to full opacity on hover/focus. Low alpha
  // keeps the cell content primary without hiding the controls.
  const controls = (
    <div className="absolute right-1 top-1 z-10 flex gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      <Button
        variant="ghost"
        size="icon-xs"
        className={HOVER_BTN}
        onClick={onMaximize}
        title={cell.preset3d ? "Maximize (double-click cell)" : "Maximize"}
        aria-label={cell.preset3d ? "Maximize 3D camera" : "Maximize sensor view"}
      >
        <Maximize2 className="size-3 text-overlay-fg" aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        className={HOVER_BTN}
        onClick={onRemove}
        title="Remove from cell"
        aria-label={cell.preset3d ? "Remove 3D camera" : "Remove sensor from cell"}
      >
        <X className="size-3 text-overlay-fg" aria-hidden="true" />
      </Button>
    </div>
  );

  const fallback = (
    <Card className="flex h-full items-center justify-center">
      <Spinner className="size-6" aria-label="Loading sensor view" />
    </Card>
  );

  if (cell.preset3d) {
    return (
      <div className="group relative h-full">
        {controls}
        <ErrorBoundary>
          <Suspense fallback={fallback}>
            <SensorCameraView
              sensorId={cell.sensorId}
              preset={cell.preset3d}
              className="h-full"
            />
          </Suspense>
        </ErrorBoundary>
      </div>
    );
  }

  const entry = SENSOR_REGISTRY[cell.typeId];
  if (!entry) {
    return (
      <Card className="flex h-full items-center justify-center">
        <span className="text-xs text-muted-foreground">Unknown: {cell.typeId}</span>
      </Card>
    );
  }
  const Component = entry.component;

  return (
    <div className="group relative h-full">
      <SubscriptionDot sensorId={cell.sensorId} />
      {controls}
      <ErrorBoundary>
        <Suspense fallback={fallback}>
          <Component sensorId={cell.sensorId} className="h-full" />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

function SubscriptionDot({ sensorId }: { sensorId: number }) {
  const subscribed = useSensorStore((s) => s.subscriptions.has(sensorId));
  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-1.5 left-1.5 z-10 size-2 rounded-full border border-background/80 shadow-sm",
        subscribed ? "bg-success" : "bg-muted-foreground/50",
      )}
      title={subscribed ? "Subscribed to sensor feed" : "Not subscribed"}
      role="status"
      aria-label={subscribed ? "Subscribed to sensor feed" : "Not subscribed to sensor feed"}
    />
  );
}
