import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePerformanceStore } from "@/stores/performanceStore";
import { useSimulationStore } from "@/stores/simulationStore";
import { useActorStore } from "@/stores/actorStore";

function metricColor(kind: "fps" | "latency", value: number) {
  if (kind === "fps") {
    if (value > 24) return "text-success";
    if (value > 15) return "text-warning";
    return "text-destructive";
  }
  if (value < 50) return "text-success";
  if (value < 100) return "text-warning";
  return "text-destructive";
}

function formatBandwidth(bytesPerSec: number): string {
  const kb = bytesPerSec / 1024;
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)}MB/s`;
  return `${Math.round(kb)}KB/s`;
}

export function PerformanceOverlay() {
  const { fps, latency, bandwidth, droppedFrames } = usePerformanceStore();
  const sensorCount = useActorStore((s) => s.actorsByType.sensors.length);

  // Compute server tick rate from simulation currentTick changes.
  // Both `tick` and `at` must seed from the live store/now at effect
  // mount, not default to {0,0}: if the overlay is toggled on mid-
  // session the simulation's currentTick is already in the thousands,
  // so the first state-change fire would compute dTick = thousands and
  // report a wildly inflated Server FPS until the next 0.5s window
  // reset the baseline. Seed both values when the subscription arms.
  const [serverFps, setServerFps] = useState(0);
  const lastTickRef = useRef({ tick: 0, at: 0 });
  useEffect(() => {
    lastTickRef.current = {
      tick: useSimulationStore.getState().currentTick,
      at: performance.now(),
    };
    const unsub = useSimulationStore.subscribe((state) => {
      const now = performance.now();
      const dt = (now - lastTickRef.current.at) / 1000;
      const dTick = state.currentTick - lastTickRef.current.tick;
      if (dTick < 0) {
        // currentTick went backwards — map reload / reconnect reset the
        // simulation. Rebase so Server FPS doesn't stay frozen until the
        // tick counter climbs back past the stale baseline.
        lastTickRef.current = { tick: state.currentTick, at: now };
      } else if (dt >= 0.5 && dTick > 0) {
        setServerFps(Math.round(dTick / dt));
        lastTickRef.current = { tick: state.currentTick, at: now };
      }
    });
    return unsub;
  }, []);

  return (
    <Card className="pointer-events-none absolute right-3 top-16 z-30 w-52 border-border/60 bg-overlay-bg/70 text-overlay-fg shadow-xl backdrop-blur-sm" aria-label="Performance overlay" role="status">
      <CardHeader className="px-3 py-2">
        <CardTitle className="text-xs font-medium">Performance</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 px-3 pb-3 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Browser FPS</span>
          <span className={`font-mono tabular-nums ${metricColor("fps", fps)}`}>{fps}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Server FPS</span>
          <span className={`font-mono tabular-nums ${metricColor("fps", serverFps)}`}>{serverFps}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Latency</span>
          <span className={`font-mono tabular-nums ${metricColor("latency", latency)}`}>{Math.round(latency)}ms</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">BW</span>
          <span className="font-mono tabular-nums">{formatBandwidth(bandwidth)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Sensors</span>
          <span className="font-mono tabular-nums">{sensorCount}</span>
        </div>
        {droppedFrames > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Dropped</span>
            <span className="font-mono tabular-nums text-warning">{droppedFrames}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
