
import { useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eraser } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGnssSensorData } from "@/hooks/useSensorData";
import { themeColors, readCssVar } from "@/lib/theme-colors";

interface GnssViewProps {
  sensorId: number;
  className?: string;
}

function gnssThemeColors() {
  const c = themeColors();
  return {
    background: c.background,
    grid: c.border,
    muted: c.mutedFg,
    accent: readCssVar("--chart-3", "oklch(0.72 0.17 145)"),
  };
}

export default function GnssView({ sensorId, className }: GnssViewProps) {
  const latRef = useRef<HTMLSpanElement>(null);
  const lonRef = useRef<HTMLSpanElement>(null);
  const altRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trailRef = useRef<{ x: number; y: number }[]>([]);
  const {
    latRef: latValueRef,
    lonRef: lonValueRef,
    altRef: altValueRef,
    trailRef: gpsTrailRef,
  } = useGnssSensorData(sensorId);

  const drawTrail = useCallback(() => {
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
    const colors = gnssThemeColors();

    // Background grid
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 0.5;
    const gridSize = 20;
    for (let x = 0; x < w; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Trail
    const trail = trailRef.current;
    if (trail.length > 1) {
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 1.5;
      for (let i = 1; i < trail.length; i++) {
        const prev = trail[i - 1];
        const curr = trail[i];
        // Loop bounds guarantee both are defined, but
        // noUncheckedIndexedAccess widens arr[i] to T|undefined.
        // Local assignments let the flow-sensitive narrow hit once.
        if (!prev || !curr) continue;
        const alpha = i / trail.length;
        ctx.globalAlpha = alpha * 0.8;
        ctx.beginPath();
        ctx.moveTo(w / 2 + prev.x * 2, h / 2 + prev.y * 2);
        ctx.lineTo(w / 2 + curr.x * 2, h / 2 + curr.y * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Current position dot
    const last = trail[trail.length - 1];
    if (last) {
      ctx.fillStyle = colors.accent;
      ctx.beginPath();
      ctx.arc(w / 2 + last.x * 2, h / 2 + last.y * 2, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Crosshair at center
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    // No data label
    if (trail.length === 0) {
      ctx.fillStyle = colors.muted;
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Waiting for GNSS data...", w / 2, h / 2 + 20);
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (latRef.current) latRef.current.textContent = latValueRef.current.toFixed(6);
      if (lonRef.current) lonRef.current.textContent = lonValueRef.current.toFixed(6);
      if (altRef.current) altRef.current.textContent = altValueRef.current.toFixed(2);

      const sourceTrail = gpsTrailRef.current;
      const origin = sourceTrail[0];
      if (origin) {
        trailRef.current = sourceTrail.map((point) => ({
          x: (point.lon - origin.lon) * 100000,
          y: (origin.lat - point.lat) * 100000,
        }));
      } else {
        trailRef.current = [];
      }
      drawTrail();
    }, 100);

    const handleResize = () => drawTrail();
    window.addEventListener("resize", handleResize);
    return () => {
      clearInterval(interval);
      window.removeEventListener("resize", handleResize);
    };
  }, [altValueRef, drawTrail, gpsTrailRef, latValueRef, lonValueRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // ResizeObserver.observe() throws if the target is null; the previous
    // `canvas.parentElement!` non-null assertion relied on DOM structure
    // that's not enforced by TypeScript. A null-check is cheap and avoids
    // crashing the component if the canvas is ever rendered without a
    // parent (e.g. during a Suspense boundary transition).
    const parent = canvas.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(() => drawTrail());
    observer.observe(parent);
    return () => observer.disconnect();
  }, [drawTrail]);

  return (
    <Card className={cn("flex h-full flex-col overflow-hidden", className)}>
      <CardHeader className="flex-row items-center justify-between space-y-0 pl-3 pr-14 py-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-xs font-medium">GNSS</CardTitle>
          <Badge variant="secondary" className="h-4 px-1 text-2xs">
            #{sensorId}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => {
            gpsTrailRef.current = [];
            trailRef.current = [];
          }}
          title="Clear GNSS trail"
          aria-label="Clear GNSS trail"
        >
          <Eraser className="size-3" aria-hidden="true" />
        </Button>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2 p-2">
        {/* Coordinates — wrap gracefully on narrow cells */}
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
          <div className="flex items-baseline gap-1.5">
            <span className="text-muted-foreground">Lat</span>
            <span ref={latRef} className="font-mono tabular-nums text-foreground">0.000000</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-muted-foreground">Lon</span>
            <span ref={lonRef} className="font-mono tabular-nums text-foreground">0.000000</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-muted-foreground">Alt</span>
            <span ref={altRef} className="font-mono tabular-nums text-foreground">0.00</span>
            <span className="text-muted-foreground">m</span>
          </div>
        </div>
        {/* Position canvas */}
        <canvas ref={canvasRef} aria-label="GNSS position trail" className="flex-1 rounded" />
      </CardContent>
    </Card>
  );
}
