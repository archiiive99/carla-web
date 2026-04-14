
import { useRef, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { useImuSensorData } from "@/hooks/useSensorData";
import { saveImuAsCsv } from "@/lib/data-export";
import { themeColors } from "@/lib/theme-colors";

interface ImuChartProps {
  sensorId: number;
  className?: string;
}

import { IMU_BUFFER_MAX_SAMPLES } from "@/constants";
const FLUSH_INTERVAL_MS = 100;

// Accelerometer + gyroscope share X/Y/Z → chart-1/2/3 mapping; one config
// drives both charts.
const AXES = ["x", "y", "z"] as const;
const AXIS_CHART_CONFIG: ChartConfig = {
  x: { label: "X", color: "var(--chart-1)" },
  y: { label: "Y", color: "var(--chart-2)" },
  z: { label: "Z", color: "var(--chart-3)" },
};

function AxisTimeSeries({
  title,
  data,
  gridColor,
  axisColor,
}: {
  title: string;
  data: Sample[];
  gridColor: string;
  axisColor: string;
}) {
  return (
    <div className="flex-1">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-2xs text-muted-foreground">{title}</span>
        <div className="flex items-center gap-2 text-3xs text-muted-foreground">
          {AXES.map((axis) => (
            <span key={axis} className="flex items-center gap-1">
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: AXIS_CHART_CONFIG[axis].color }}
              />
              {AXIS_CHART_CONFIG[axis].label as string}
            </span>
          ))}
        </div>
      </div>
      <ChartContainer config={AXIS_CHART_CONFIG} className="h-full w-full">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis dataKey="t" hide />
          <YAxis width={30} tick={{ fontSize: 9 }} stroke={axisColor} />
          <ChartTooltip content={<ChartTooltipContent />} />
          {AXES.map((axis) => (
            <Line
              key={axis}
              dataKey={axis}
              stroke={`var(--color-${axis})`}
              strokeWidth={1}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ChartContainer>
    </div>
  );
}

function chartThemeColors() {
  const c = themeColors();
  return { grid: c.border, axis: c.mutedFg };
}

interface Sample {
  t: number;
  x: number;
  y: number;
  z: number;
}

export default function ImuChart({ sensorId, className }: ImuChartProps) {
  const [accelData, setAccelData] = useState<Sample[]>([]);
  const [gyroData, setGyroData] = useState<Sample[]>([]);
  const compassDisplayRef = useRef<HTMLSpanElement>(null);
  const { bufferRef, compassRef } = useImuSensorData(sensorId);
  const chartColors = chartThemeColors();

  const handleExport = () => {
    const samples = bufferRef.current.map((sample) => ({
      timestamp: sample.t,
      accel: sample.accel,
      gyro: sample.gyro,
      compass: compassRef.current,
    }));
    if (samples.length === 0) return;
    saveImuAsCsv(samples, `imu_${sensorId}.csv`);
  };

  // Flush real sensor buffer to chart state at 10Hz
  useEffect(() => {
    const interval = setInterval(() => {
      const buf = bufferRef.current;
      if (buf.length === 0) return;

      const accelSamples = buf.map((s, i) => ({
        t: i,
        x: s.accel.x,
        y: s.accel.y,
        z: s.accel.z,
      }));
      const gyroSamples = buf.map((s, i) => ({
        t: i,
        x: s.gyro.x,
        y: s.gyro.y,
        z: s.gyro.z,
      }));
      setAccelData(accelSamples.slice(-IMU_BUFFER_MAX_SAMPLES));
      setGyroData(gyroSamples.slice(-IMU_BUFFER_MAX_SAMPLES));

      // Update compass via ref
      if (compassDisplayRef.current) {
        compassDisplayRef.current.textContent = `${compassRef.current.toFixed(1)}°`;
      }
    }, FLUSH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [bufferRef, compassRef]);

  return (
    <Card className={cn("flex h-full flex-col overflow-hidden", className)}>
      <CardHeader className="flex-row items-center justify-between space-y-0 pl-3 pr-14 py-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-xs font-medium">IMU</CardTitle>
          <Badge variant="secondary" className="h-4 px-1 text-2xs">
            #{sensorId}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            ref={compassDisplayRef}
            className="font-mono text-2xs tabular-nums text-muted-foreground"
            title="Compass heading"
          >
            0.0°
          </span>
          <Button variant="ghost" size="icon-xs" onClick={handleExport} title="Export as CSV" aria-label="Export IMU data as CSV">
            <Download className="size-3" aria-hidden="true" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2 p-2">
        {/* Accelerometer */}
        <AxisTimeSeries
          title="Accelerometer (m/s²)"
          data={accelData}
          gridColor={chartColors.grid}
          axisColor={chartColors.axis}
        />
        <AxisTimeSeries
          title="Gyroscope (rad/s)"
          data={gyroData}
          gridColor={chartColors.grid}
          axisColor={chartColors.axis}
        />
      </CardContent>
    </Card>
  );
}
