import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { usePerformanceStore } from "@/stores/performanceStore";
import { useSimulationStore } from "@/stores/simulationStore";
import { useActorStore } from "@/stores/actorStore";

function formatBandwidth(bytesPerSec: number): string {
  const kb = bytesPerSec / 1024;
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB/s`;
  return `${Math.round(kb)} KB/s`;
}

function formatUptime(connectedSince: number | null): string {
  if (!connectedSince) return "--";
  const totalSec = Math.max(0, Math.floor((Date.now() - connectedSince) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function buildSeries(values: number[]) {
  return values.map((value, index) => ({ index, value }));
}

function MetricCard({
  title,
  current,
  peak,
  series,
  colorVar,
}: {
  title: string;
  current: string;
  peak: string;
  series: { index: number; value: number }[];
  colorVar: string;
}) {
  return (
    <Card className="min-h-0">
      <CardHeader className="px-3 py-2">
        <CardTitle className="text-xs font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-3 pb-3">
        <ChartContainer
          className="h-24 w-full"
          config={{ value: { label: title, color: colorVar } }}
        >
          <AreaChart data={series}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="index" hide />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--color-value)"
              fill="var(--color-value)"
              fillOpacity={0.2}
            />
          </AreaChart>
        </ChartContainer>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Current</span>
            <span className="font-mono tabular-nums">{current}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Peak</span>
            <span className="font-mono tabular-nums">{peak}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function TelemetryPanel() {
  const {
    fps,
    latency,
    bandwidth,
    droppedFrames,
    peakFps,
    peakBandwidth,
    peakLatency,
    connectedSince,
    fpsHistory,
    latencyHistory,
    bandwidthHistory,
  } = usePerformanceStore();
  const serverVersion = useSimulationStore((s) => s.serverVersion);
  const connectionStatus = useSimulationStore((s) => s.connectionStatus);
  const sensorCount = useActorStore((s) => s.actorsByType.sensors.length);

  const fpsSeries = useMemo(() => buildSeries(fpsHistory), [fpsHistory]);
  const latencySeries = useMemo(() => buildSeries(latencyHistory), [latencyHistory]);
  const bandwidthSeries = useMemo(
    () => buildSeries(bandwidthHistory.map((b) => b / 1024)),
    [bandwidthHistory],
  );
  return (
    <div className="flex h-full flex-col overflow-hidden p-3">
      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-3">
        <MetricCard
          title="FPS"
          current={`${fps}`}
          peak={`${peakFps}`}
          series={fpsSeries}
          colorVar="var(--chart-3)"
        />
        <MetricCard
          title="Latency"
          current={`${Math.round(latency)}ms`}
          peak={`${Math.round(peakLatency)}ms`}
          series={latencySeries}
          colorVar="var(--chart-2)"
        />
        <MetricCard
          title="Bandwidth"
          current={formatBandwidth(bandwidth)}
          peak={formatBandwidth(peakBandwidth)}
          series={bandwidthSeries}
          colorVar="var(--chart-4)"
        />
      </div>
      <Card className="mt-3">
        <CardContent className="grid gap-2 p-3 pt-2 text-xs md:grid-cols-3">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Sensors</span>
            <span className="font-mono tabular-nums">{sensorCount}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Dropped</span>
            <span className="font-mono tabular-nums">{droppedFrames}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Connection</span>
            <span className="font-mono">{connectionStatus}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Uptime</span>
            <span className="font-mono tabular-nums">{formatUptime(connectedSince)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">CARLA</span>
            <span className="font-mono">{serverVersion || "--"}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
