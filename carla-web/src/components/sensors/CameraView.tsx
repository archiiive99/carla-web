import { useRef, useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { useCameraSensorData } from "@/hooks/useSensorData";
import { useAnimationFrame } from "@/hooks/useAnimationFrame";
import { getSensorDisplayName } from "@/lib/sensor-registry";
import { saveCanvasAsPng, saveCanvasAsJpeg, copyCanvasToClipboard } from "@/lib/data-export";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

/** Return Tailwind text color class based on FPS value. */
function fpsColor(fps: number): string {
  if (fps > 20) return "text-success";
  if (fps > 10) return "text-warning";
  return "text-destructive";
}

/** Return Tailwind text color class based on latency in ms. */
function latencyColor(ms: number): string {
  if (ms < 50) return "text-success";
  if (ms < 100) return "text-warning";
  return "text-destructive";
}

interface CameraViewProps {
  sensorId: number;
  label?: string;
  sensorType?: string;
  className?: string;
}

export default function CameraView({
  sensorId,
  label,
  sensorType,
  className,
}: CameraViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fpsDisplayRef = useRef<HTMLSpanElement>(null);
  const fpsBadgeRef = useRef<HTMLSpanElement>(null);
  const latencyDisplayRef = useRef<HTMLSpanElement>(null);
  const latencyBadgeRef = useRef<HTMLSpanElement>(null);
  const resDisplayRef = useRef<HTMLSpanElement>(null);
  const hasReceivedFrameRef = useRef(false);
  const [hasReceivedFrame, setHasReceivedFrame] = useState(false);
  const { bitmapRef, fpsRef, latencyRef } = useCameraSensorData(sensorId);

  const displayName =
    label || (sensorType ? getSensorDisplayName(sensorType) : "Camera");

  // Reset "received" flag when switching sensors so the loading state shows
  // until the new camera delivers a frame (prevents stale FPS/last-frame bleed).
  useEffect(() => {
    hasReceivedFrameRef.current = false;
    setHasReceivedFrame(false);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
    if (resDisplayRef.current) resDisplayRef.current.textContent = "--";
  }, [sensorId]);

  const draw = useCallback(() => {
    const bitmap = bitmapRef.current;
    const canvas = canvasRef.current;
    if (canvas && bitmap) {
      if (!hasReceivedFrameRef.current) {
        hasReceivedFrameRef.current = true;
        setHasReceivedFrame(true);
      }
      if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        if (resDisplayRef.current)
          resDisplayRef.current.textContent = `${bitmap.width}x${bitmap.height}`;
      }
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.drawImage(bitmap, 0, 0);
    }

    const fps = fpsRef.current;
    if (fpsDisplayRef.current) {
      fpsDisplayRef.current.textContent = hasReceivedFrameRef.current
        ? `${fps} FPS`
        : "-- FPS";
    }
    if (fpsBadgeRef.current && hasReceivedFrameRef.current) {
      fpsBadgeRef.current.className = cn(
        "font-mono text-2xs font-medium tabular-nums",
        fpsColor(fps),
      );
    }

    const latency = latencyRef.current;
    if (latencyDisplayRef.current) {
      latencyDisplayRef.current.textContent = hasReceivedFrameRef.current
        ? `${latency}ms`
        : "--ms";
    }
    if (latencyBadgeRef.current && hasReceivedFrameRef.current) {
      latencyBadgeRef.current.className = cn(
        "font-mono text-2xs font-medium tabular-nums",
        latencyColor(latency),
      );
    }
  }, [bitmapRef, fpsRef, latencyRef]);

  useAnimationFrame(draw);

  return (
    <Card className={cn("flex h-full flex-col overflow-hidden", className)}>
      <CardHeader className="flex-row items-center justify-between space-y-0 pl-3 pr-14 py-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-xs font-medium">{displayName}</CardTitle>
          <Badge variant="secondary" className="h-4 px-1 text-2xs">
            #{sensorId}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="relative flex-1 p-2">
        <ContextMenu>
          <ContextMenuTrigger>
            <div className="flex h-full w-full items-center justify-center bg-background">
              <canvas
                ref={canvasRef}
                aria-label="Camera sensor feed"
                className="h-full w-full object-contain"
                style={{ aspectRatio: canvasRef.current ? `${canvasRef.current.width} / ${canvasRef.current.height}` : "16 / 9" }}
              />
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onClick={() => canvasRef.current && saveCanvasAsPng(canvasRef.current, `camera_${sensorId}.png`)}>
              Save as PNG
            </ContextMenuItem>
            <ContextMenuItem onClick={() => canvasRef.current && saveCanvasAsJpeg(canvasRef.current, `camera_${sensorId}.jpg`)}>
              Save as JPEG
            </ContextMenuItem>
            <ContextMenuItem onClick={async () => {
              if (canvasRef.current) {
                const ok = await copyCanvasToClipboard(canvasRef.current);
                toast[ok ? 'success' : 'error'](ok ? 'Copied to clipboard' : 'Copy failed');
              }
            }}>
              Copy to Clipboard
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>

        {/* Resolution badge — top-left overlay */}
        {hasReceivedFrame && (
          <Badge
            variant="secondary"
            className="absolute left-1.5 top-1.5 z-10 bg-background/70 px-1.5 py-0.5 font-mono text-2xs tabular-nums backdrop-blur-sm"
          >
            <span ref={resDisplayRef}>--</span>
          </Badge>
        )}

        {/* FPS + Latency badges — top-right overlay */}
        {hasReceivedFrame && (
          <div className="absolute right-1.5 top-1.5 z-10 flex gap-1">
            <Badge
              variant="secondary"
              className="bg-background/70 px-1.5 py-0.5 backdrop-blur-sm"
            >
              <span ref={fpsBadgeRef} className="font-mono tabular-nums text-2xs font-medium text-success">
                <span ref={fpsDisplayRef}>-- FPS</span>
              </span>
            </Badge>
            <Badge
              variant="secondary"
              className="bg-background/70 px-1.5 py-0.5 backdrop-blur-sm"
            >
              <span ref={latencyBadgeRef} className="font-mono tabular-nums text-2xs font-medium text-success">
                <span ref={latencyDisplayRef}>--ms</span>
              </span>
            </Badge>
          </div>
        )}

        {!hasReceivedFrame && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/90">
            <Skeleton className="aspect-video w-4/5 rounded-lg bg-muted" />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner className="size-3" />
              Connecting to camera feed...
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
