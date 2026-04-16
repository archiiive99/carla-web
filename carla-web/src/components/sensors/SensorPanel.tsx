import { Suspense, lazy, useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SENSOR_REGISTRY, getSensorDisplayName } from "@/lib/sensor-registry";
import { SensorType } from "@/types/carla";
import { useSensorStore } from "@/stores/sensorStore";
import { useUIStore } from "@/stores/uiStore";
import { useActorStore } from "@/stores/actorStore";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { CAMERA_PRESETS, type CameraPresetKey } from "@/components/sensors/sensor-camera-presets";
import { SensorCell } from "./SensorCell";
import { EmptyCell } from "./EmptyCell";
import type { CellState } from "./sensor-cell-types";
import {
  SensorPanelToolbar,
  type SensorPanelGridSize as GridSize,
} from "./SensorPanelToolbar";

const GRID_CONFIGS: Record<GridSize, { cols: number; rows: number }> = {
  "1x1": { cols: 1, rows: 1 },
  "2x1": { cols: 2, rows: 1 },
  "2x2": { cols: 2, rows: 2 },
  "3x2": { cols: 3, rows: 2 },
  "3x3": { cols: 3, rows: 3 },
};

export function SensorPanel({ className }: { className?: string }) {
  // Default to a 2x1 compare layout (Browser 3D approximation | Managed
  // RGB camera) rather than a 2x2 with two empty placeholders. Side-by-side
  // compare is the primary workflow, and starting with empty cells was
  // visual noise that tempted the user to think something was missing.
  const [gridSize, setGridSize] = useState<GridSize>("2x1");
  const [cells, setCells] = useState<(CellState | null)[]>(Array(2).fill(null));
  const [showSubscribedOnly, setShowSubscribedOnly] = useState(false);
  const maximizedSensorId = useUIStore((s) => s.maximizedSensorId);
  const setMaximizedSensor = useUIStore((s) => s.setMaximizedSensor);
  const sensors = useSensorStore((s) => s.sensors);
  const subscribe = useSensorStore((s) => s.subscribe);
  const unsubscribe = useSensorStore((s) => s.unsubscribe);
  const subscriptions = useSensorStore((s) => s.subscriptions);
  const egoVehicleId = useActorStore((s) => s.egoVehicleId);

  const grid = GRID_CONFIGS[gridSize];
  const totalCells = grid.cols * grid.rows;
  const sensorList = Array.from(sensors.values());
  const egoRgbSensor =
    sensorList.find((s) => s.type === SensorType.CameraRgb && egoVehicleId !== null && s.parent_id === egoVehicleId) ??
    sensorList.find((s) => s.type === SensorType.CameraRgb);
  const usedSensorIds = new Set(
    cells.filter((cell): cell is CellState => Boolean(cell && !cell.preset3d)).map((cell) => cell.sensorId),
  );

  // Auto-populate: [0]=3D Chase, [1]=RGB Camera if available
  const autoPopulatedRef = useRef(false);
  useEffect(() => {
    if (autoPopulatedRef.current) return;
    if (cells.every((c) => c === null) && sensors.size > 0) {
      autoPopulatedRef.current = true;
      // Prefer the RGB camera attached to the bridge-managed ego; fall back
      // to any RGB camera so user-spawned cameras still auto-populate.
      const sensorList = Array.from(sensors.values());
      const egoId = useActorStore.getState().egoVehicleId;
      const rgbCam =
        sensorList.find(
          (s) => s.type === SensorType.CameraRgb && s.parent_id === egoId,
        ) ?? sensorList.find((s) => s.type === SensorType.CameraRgb);
      setCells((prev) => {
        const next = [...prev];
        // Negative sensorId makes 3D-preset cells uniquely addressable for
        // maximize (cells.find falls back on first match) while still never
        // colliding with CARLA actor IDs (always non-negative).
        next[0] = { sensorId: -1, typeId: "3d.chase", preset3d: "chase" as CameraPresetKey };
        if (rgbCam) {
          subscribe(rgbCam.id);
          next[1] = { sensorId: rgbCam.id, typeId: rgbCam.type };
        }
        return next;
      });
    }
  }, [cells, sensors, subscribe]);

  // Clear cells whose sensor was destroyed externally (actor deleted, bridge reload, etc.)
  // 3D preset cells (preset3d set) don't bind to a CARLA sensor, so leave them alone.
  useEffect(() => {
    setCells((prev) => {
      let changed = false;
      const next = prev.map((cell) => {
        if (!cell || cell.preset3d) return cell;
        if (!sensors.has(cell.sensorId)) {
          changed = true;
          return null;
        }
        return cell;
      });
      // Re-arm auto-populate if everything is gone (e.g. after bridge reload)
      if (next.every((c) => c === null) && prev.some((c) => c !== null)) {
        autoPopulatedRef.current = false;
      }
      return changed ? next : prev;
    });
  }, [sensors]);

  // Allow other components (ActorDetails, etc.) to request adding a sensor
  // to the grid. Places it in the first empty cell; if full, replaces cell 0.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ sensorId: number; typeId: string }>).detail;
      if (!detail) return;
      const { sensorId, typeId } = detail;
      // Already shown → toast-less noop; SensorPanel's maximize is handled elsewhere.
      if (cells.some((c) => c && !c.preset3d && c.sensorId === sensorId)) return;
      subscribe(sensorId);
      setCells((prev) => {
        const next = [...prev];
        const emptyIdx = next.findIndex((c) => c === null);
        const target = emptyIdx >= 0 ? emptyIdx : 0;
        const evicted = next[target];
        if (evicted && !evicted.preset3d) unsubscribe(evicted.sensorId);
        next[target] = { sensorId, typeId };
        return next;
      });
    };
    window.addEventListener("sensor-panel:open", handler);
    return () => window.removeEventListener("sensor-panel:open", handler);
  }, [cells, subscribe, unsubscribe]);

  const handleGridChange = useCallback((size: GridSize) => {
    const newTotal = GRID_CONFIGS[size].cols * GRID_CONFIGS[size].rows;
    setGridSize(size);
    setCells((prev) => {
      const next = [...prev];
      while (next.length < newTotal) next.push(null);
      // Shrinking the grid (e.g. 3x3 → 1x1) silently dropped the truncated
      // cells, leaking every sensor subscription they held. The bridge kept
      // streaming those frames until the tab reloaded. Unsubscribe here
      // like removeCell does — 3D-preset cells have no subscription to
      // clear, so skip them.
      for (let i = newTotal; i < next.length; i++) {
        const dropped = next[i];
        if (dropped && !dropped.preset3d) unsubscribe(dropped.sensorId);
      }
      return next.slice(0, newTotal);
    });
  }, [unsubscribe]);

  const addSensorToCell = useCallback((index: number, sensorId: number, typeId: string) => {
    subscribe(sensorId);
    setCells((prev) => {
      const next = [...prev];
      next[index] = { sensorId, typeId };
      return next;
    });
  }, [subscribe]);

  const removeCell = useCallback((index: number) => {
    setCells((prev) => {
      const next = [...prev];
      const current = next[index];
      if (current && !current.preset3d) unsubscribe(current.sensorId);
      next[index] = null;
      return next;
    });
  }, [unsubscribe]);

  // Add 3D camera preset to cell. Use negative sensorId (-(index+1)) so
  // every 3D-preset cell is uniquely addressable (for maximize/find) and
  // never collides with real CARLA actor IDs.
  const add3DToCell = useCallback((index: number, preset: CameraPresetKey) => {
    setCells((prev) => {
      const next = [...prev];
      next[index] = { sensorId: -(index + 1), typeId: `3d.${preset}`, preset3d: preset };
      return next;
    });
  }, []);

  // "Quick compare" button was removed — it produced the same 2x1 compare
  // layout the panel now defaults to, which `resetGrid` below also restores
  // (via clear → auto-populate). Having three buttons that all land on the
  // same layout was toolbar noise.

  const focusManagedRgb = useCallback(() => {
    if (!egoRgbSensor) return;
    subscribe(egoRgbSensor.id);
    setGridSize("1x1");
    setCells([{ sensorId: egoRgbSensor.id, typeId: egoRgbSensor.type }]);
    setMaximizedSensor(null);
  }, [egoRgbSensor, setMaximizedSensor, subscribe]);

  // Reset to the primary compare layout so clicks on "Reset grid" restore
  // the same default the user first opened the app with, not an empty 2x2
  // scaffold that requires extra clicks before anything renders.
  const resetGrid = useCallback(() => {
    setCells((prev) => {
      // Unsubscribe every real sensor the grid currently holds — otherwise
      // "Reset grid" silently leaked subscriptions the same way the grid-
      // shrink path did before. Auto-populate re-subscribes the ego RGB
      // cam after this fires.
      for (const cell of prev) {
        if (cell && !cell.preset3d) unsubscribe(cell.sensorId);
      }
      return Array(2).fill(null);
    });
    setGridSize("2x1");
    autoPopulatedRef.current = false;
    setMaximizedSensor(null);
  }, [setMaximizedSensor, unsubscribe]);

  // If the maximized sensor no longer has a cell (destroyed / bridge reload),
  // clear the flag in an effect — not during render — to avoid React warnings.
  const maximizedCell =
    maximizedSensorId !== null
      ? cells.find((c) => c?.sensorId === maximizedSensorId)
      : undefined;
  useEffect(() => {
    if (maximizedSensorId !== null && !maximizedCell) {
      setMaximizedSensor(null);
    }
  }, [maximizedSensorId, maximizedCell, setMaximizedSensor]);

  if (maximizedCell) {
    const label = maximizedCell.preset3d
      ? CAMERA_PRESETS[maximizedCell.preset3d]?.label ?? "3D Camera"
      : `${getSensorDisplayName(maximizedCell.typeId)} #${maximizedCell.sensorId}`;
    const body = (() => {
      if (maximizedCell.preset3d) {
        return (
          <SensorCameraView
            sensorId={maximizedCell.sensorId}
            preset={maximizedCell.preset3d}
            className="h-full"
          />
        );
      }
      const entry = SENSOR_REGISTRY[maximizedCell.typeId];
      if (!entry) return null;
      const Comp = entry.component;
      return <Comp sensorId={maximizedCell.sensorId} className="h-full" />;
    })();
    if (body === null) return null;
    return (
      <div className={cn("flex h-full flex-col", className)}>
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-xs font-medium">{label}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setMaximizedSensor(null)}
            title="Restore grid (Esc)"
            aria-label="Restore sensor grid"
          >
            <Minimize2 className="size-3" aria-hidden="true" />
          </Button>
        </div>
        <div className="flex-1">
          <ErrorBoundary>
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center">
                  <Spinner className="size-6" aria-label="Loading sensor view" />
                </div>
              }
            >
              {body}
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <SensorPanelToolbar
        gridSize={gridSize}
        onGridSizeChange={handleGridChange}
        filledCells={cells.filter(Boolean).length}
        totalCells={totalCells}
        liveSensorCount={sensors.size}
        subscribedSensorCount={subscriptions.size}
        showSubscribedOnly={showSubscribedOnly}
        onToggleSubscribedOnly={() => setShowSubscribedOnly((prev) => !prev)}
        onFocusManagedRgb={focusManagedRgb}
        focusManagedRgbDisabled={!egoRgbSensor}
        onResetGrid={resetGrid}
      />

      <div
        className="flex-1 gap-2 p-2"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${grid.cols}, 1fr)`,
          gridTemplateRows: `repeat(${grid.rows}, 1fr)`,
        }}
      >
        {cells.slice(0, totalCells).map((cell, index) => (
          <div key={index} className="min-h-0 min-w-0 transition-shadow duration-150 hover:shadow-md">
            {cell ? (
              <SensorCell
                cell={cell}
                onMaximize={() => setMaximizedSensor(cell.sensorId)}
                onRemove={() => removeCell(index)}
              />
            ) : (
              <EmptyCell
                sensors={sensors}
                usedSensorIds={usedSensorIds}
                subscriptions={subscriptions}
                egoVehicleId={egoVehicleId}
                showSubscribedOnly={showSubscribedOnly}
                onSelect={(sensorId, typeId) => addSensorToCell(index, sensorId, typeId)}
                onSelect3D={(preset) => add3DToCell(index, preset)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const SensorCameraView = lazy(() => import("@/components/sensors/SensorCameraView"));
