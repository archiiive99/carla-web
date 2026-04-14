
import { useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useRadarSensorData } from "@/hooks/useSensorData";
import { themeColors, readCssVar } from "@/lib/theme-colors";
import { useAnimationFrame } from "@/hooks/useAnimationFrame";

interface RadarViewProps {
  sensorId: number;
  className?: string;
}

const DEPTH_RINGS = [10, 20, 50, 100];
const AZIMUTH_LINES = 12; // every 30 degrees

function radarThemeColors() {
  const c = themeColors();
  return {
    background: c.background,
    grid: c.border,
    muted: c.mutedFg,
    accent: readCssVar("--chart-3", "oklch(0.72 0.17 145)"),
  };
}

export default function RadarView({ sensorId, className }: RadarViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const { detectionsRef } = useRadarSensorData(sensorId);

  const drawGrid = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * devicePixelRatio;
    canvas.height = rect.height * devicePixelRatio;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(devicePixelRatio, devicePixelRatio);
    const w = rect.width;
    const h = rect.height;
    const cx = w / 2;
    const cy = h / 2;
    const maxRadius = Math.min(cx, cy) - 10;
    const colors = radarThemeColors();

    // Background
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, w, h);

    // Depth rings
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 0.5;
    for (const depth of DEPTH_RINGS) {
      const r = (depth / DEPTH_RINGS[DEPTH_RINGS.length - 1]) * maxRadius;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      // Label
      ctx.fillStyle = colors.muted;
      ctx.font = "10px monospace";
      ctx.fillText(`${depth}m`, cx + r + 2, cy - 2);
    }

    // Azimuth lines
    ctx.strokeStyle = colors.grid;
    for (let i = 0; i < AZIMUTH_LINES; i++) {
      const angle = (i / AZIMUTH_LINES) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(
        cx + Math.cos(angle) * maxRadius,
        cy + Math.sin(angle) * maxRadius,
      );
      ctx.stroke();
    }

    // Center dot
    ctx.fillStyle = colors.accent;
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();

    const detections = detectionsRef.current;
    if (countRef.current) {
      countRef.current.textContent = `${detections.length} det`;
    }

    if (detections.length === 0) {
      ctx.fillStyle = colors.muted;
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Waiting for radar data...", cx, cy + maxRadius + 20);
      return;
    }

    for (const det of detections) {
      const radius = Math.min(
        det.depth / DEPTH_RINGS[DEPTH_RINGS.length - 1],
        1,
      ) * maxRadius;
      const angle = det.azimuth - Math.PI / 2;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      const velocity = Math.max(-20, Math.min(20, det.velocity));
      const normalized = (velocity + 20) / 40;
      const r = Math.round(255 * normalized);
      const b = Math.round(255 * (1 - normalized));
      ctx.fillStyle = `rgb(${r}, ${Math.round((r + b) / 6)}, ${b})`;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [detectionsRef]);

  useAnimationFrame(drawGrid);
  useEffect(() => {
    const handleResize = () => drawGrid();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [drawGrid]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      drawGrid();
    });
    observer.observe(canvas.parentElement!);
    return () => observer.disconnect();
  }, [drawGrid]);

  return (
    <Card className={cn("flex h-full flex-col overflow-hidden", className)}>
      <CardHeader className="flex-row items-center justify-between space-y-0 pl-3 pr-14 py-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-xs font-medium">Radar</CardTitle>
          <Badge variant="secondary" className="h-4 px-1 text-2xs">
            #{sensorId}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            ref={countRef}
            className="font-mono text-2xs tabular-nums text-muted-foreground"
          >
            0 det
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-1">
        <canvas ref={canvasRef} aria-label="Radar polar plot" className="h-full w-full rounded" />
      </CardContent>
    </Card>
  );
}
