
import { useRef, useEffect, useState } from "react";
import { Separator } from "@/components/ui/separator";
import { SignalHigh, SignalMedium, SignalLow } from "lucide-react";
import { usePerformanceStore } from "@/stores/performanceStore";
import { useSimulationStore } from "@/stores/simulationStore";
import { useActorStore } from "@/stores/actorStore";

type LatencyTier = "low" | "moderate" | "high";

function formatUptime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `Up: ${m}m ${String(s).padStart(2, "0")}s`;
}

function latencyTier(ms: number): LatencyTier {
  if (ms < 50) return "low";
  if (ms < 100) return "moderate";
  return "high";
}

function latencyTierToken(tier: LatencyTier): string {
  if (tier === "low") return "text-success";
  if (tier === "moderate") return "text-warning";
  return "text-destructive";
}

export function StatusBar() {
  const latencyRef = useRef<HTMLSpanElement>(null);
  const bandwidthRef = useRef<HTMLSpanElement>(null);
  const tickRateRef = useRef<HTMLSpanElement>(null);
  const tickCountRef = useRef<HTMLSpanElement>(null);
  const fpsRef = useRef<HTMLSpanElement>(null);
  const sparklineRef = useRef<SVGPolylineElement>(null);
  const fpsHistoryRef = useRef<number[]>([]);
  const connectedAtRef = useRef<number | null>(null);
  const lastTickRef = useRef<{ tick: number; at: number } | null>(null);
  const [tier, setTier] = useState<LatencyTier>("low");
  const [uptime, setUptime] = useState<string>("");

  const connectionStatus = useSimulationStore((s) => s.connectionStatus);
  const actorsByType = useActorStore((s) => s.actorsByType);

  // Pure state reset uses the React-19 "adjust state during render" idiom
  // (matches VehicleDetails, SegmentationView, CameraView). The previous
  // setState inside useEffect triggered a cascading render warning.
  const [lastConnectionStatus, setLastConnectionStatus] = useState(connectionStatus);
  if (lastConnectionStatus !== connectionStatus) {
    setLastConnectionStatus(connectionStatus);
    if (connectionStatus !== "connected") {
      setUptime("");
    }
  }
  // Ref mutations still need an effect because `connectedAtRef.current` reads
  // are not timing-safe during render — performance.now() is impure and the
  // refs only settle to their new value after commit.
  useEffect(() => {
    if (connectionStatus === "connected") {
      if (connectedAtRef.current === null) {
        // performance.now() so the uptime readout doesn't drift if the
        // OS clock jumps. Paired with the performance.now() read below.
        connectedAtRef.current = performance.now();
      }
    } else {
      connectedAtRef.current = null;
    }
  }, [connectionStatus]);

  // Subscribe to perf store — mutate DOM for per-frame text, setState only on tier change.
  useEffect(() => {
    const unsub = usePerformanceStore.subscribe((state) => {
      const roundedLatency = Math.round(state.latency);
      if (latencyRef.current) {
        latencyRef.current.textContent = `${roundedLatency}ms`;
      }
      const next = latencyTier(state.latency);
      setTier((prev) => (prev === next ? prev : next));
      if (bandwidthRef.current) {
        const kb = state.bandwidth / 1024;
        bandwidthRef.current.textContent =
          kb > 1024
            ? `${(kb / 1024).toFixed(1)} MB/s`
            : `${Math.round(kb)} KB/s`;
      }
      if (fpsRef.current) {
        fpsRef.current.textContent = `${state.fps} FPS`;
      }
      // Update FPS sparkline
      fpsHistoryRef.current.push(state.fps);
      if (fpsHistoryRef.current.length > 60) fpsHistoryRef.current.shift();
      if (sparklineRef.current) {
        sparklineRef.current.setAttribute(
          "points",
          fpsHistoryRef.current.map((v, i) => `${i * (40 / 60)},${12 - Math.min(v, 60) / 60 * 12}`).join(" "),
        );
      }
      if (connectedAtRef.current !== null) {
        setUptime(formatUptime(performance.now() - connectedAtRef.current));
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = useSimulationStore.subscribe((state) => {
      const now = performance.now();
      // Only roll the tick-rate window when we actually recompute Hz.
      // Previously this updated lastTickRef on every subscription fire —
      // including unrelated state changes (weather, isRunning, etc.) and
      // the ~20Hz tick bursts — which kept timeDelta at ~50ms and held
      // it permanently below the 0.25s gate, so the Hz readout never
      // advanced past its first reading.
      if (!lastTickRef.current) {
        lastTickRef.current = { tick: state.currentTick, at: now };
      } else if (tickRateRef.current) {
        const tickDelta = state.currentTick - lastTickRef.current.tick;
        const timeDelta = (now - lastTickRef.current.at) / 1000;
        if (tickDelta >= 0 && timeDelta > 0.25) {
          const hz = tickDelta / timeDelta;
          tickRateRef.current.textContent = `${hz.toFixed(hz >= 10 ? 0 : 1)} Hz`;
          lastTickRef.current = { tick: state.currentTick, at: now };
        }
      }
      if (tickCountRef.current) {
        tickCountRef.current.textContent = `T${state.currentTick}`;
      }
    });
    return unsub;
  }, []);

  return (
    <footer className="flex h-8 shrink-0 flex-nowrap items-center justify-between gap-3 border-t px-4 text-xs text-muted-foreground">
      <div className="flex min-w-0 shrink items-center gap-3 whitespace-nowrap">
        <span
          className={`flex items-center gap-1 ${latencyTierToken(tier)}`}
          aria-label={`${tier} latency`}
        >
          <span className="text-muted-foreground">Latency:</span>
          {tier === "low" && <SignalHigh className="size-3" aria-hidden="true" />}
          {tier === "moderate" && <SignalMedium className="size-3" aria-hidden="true" />}
          {tier === "high" && <SignalLow className="size-3" aria-hidden="true" />}
          <span ref={latencyRef} className="font-mono tabular-nums">--ms</span>
        </span>
        <Separator orientation="vertical" className="h-4" />
        <span className="flex items-center gap-1">
          <span className="text-muted-foreground">Bandwidth:</span>
          <span ref={bandwidthRef} className="font-mono tabular-nums">
            0 KB/s
          </span>
        </span>
        <Separator orientation="vertical" className="h-4" />
        <span className="flex items-center gap-1">
          <span className="text-muted-foreground">Tick:</span>
          <span ref={tickCountRef} className="font-mono tabular-nums">T0</span>
          <span className="text-muted-foreground">/</span>
          <span ref={tickRateRef} className="font-mono tabular-nums">0 Hz</span>
        </span>
        {(actorsByType.vehicles.length > 0 || actorsByType.walkers.length > 0) && (
          <>
            <Separator orientation="vertical" className="h-4" />
            <span className="font-mono tabular-nums" aria-label={`${actorsByType.vehicles.length} vehicles, ${actorsByType.walkers.length} walkers, ${actorsByType.sensors.length} sensors`}>
              {actorsByType.vehicles.length}V {actorsByType.walkers.length}W {actorsByType.sensors.length}S
            </span>
          </>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3 whitespace-nowrap">
        <span className="flex items-center gap-1">
          <span ref={fpsRef} className="font-mono tabular-nums">
            0 FPS
          </span>
          <svg width="40" height="12" className="inline-block ml-1" aria-hidden="true">
            <polyline
              ref={sparklineRef}
              points=""
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              opacity="0.8"
            />
          </svg>
        </span>
        {uptime && (
          <>
            <Separator orientation="vertical" className="h-4" />
            <span className="font-mono tabular-nums" aria-label={`Session uptime ${uptime.replace(/^Up:\s*/, "")}`}>{uptime}</span>
          </>
        )}
      </div>
    </footer>
  );
}
