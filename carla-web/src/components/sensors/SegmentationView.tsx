
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { List } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCameraSensorData } from "@/hooks/useSensorData";
import { useAnimationFrame } from "@/hooks/useAnimationFrame";

const LEGEND_ITEMS = [
  { label: "Roads", color: "#804080" },
  { label: "Sidewalks", color: "#f423e8" },
  { label: "Buildings", color: "#464646" },
  { label: "Vegetation", color: "#6b8e23" },
  { label: "Sky", color: "#4682b4" },
  { label: "Pedestrians", color: "#dc143c" },
  { label: "Cars", color: "#00008e" },
  { label: "Trucks", color: "#000046" },
];

interface SegmentationViewProps {
  sensorId: number;
  className?: string;
}

export default function SegmentationView({
  sensorId,
  className,
}: SegmentationViewProps) {
  const [showLegend, setShowLegend] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resDisplayRef = useRef<HTMLSpanElement>(null);
  const hasReceivedFrameRef = useRef(false);
  const [hasReceivedFrame, setHasReceivedFrame] = useState(false);
  const { bitmapRef } = useCameraSensorData(sensorId);

  // Reset "received" state when switching sensors (avoids stale last frame).
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
    const canvas = canvasRef.current;
    const bitmap = bitmapRef.current;
    if (canvas && bitmap) {
      if (!hasReceivedFrameRef.current) {
        hasReceivedFrameRef.current = true;
        setHasReceivedFrame(true);
      }
      if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        if (resDisplayRef.current) {
          resDisplayRef.current.textContent = `${bitmap.width}×${bitmap.height}`;
        }
      }
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.drawImage(bitmap, 0, 0);
    }
  }, [bitmapRef]);

  useAnimationFrame(draw);

  return (
    <Card className={cn("flex h-full flex-col overflow-hidden", className)}>
      <CardHeader className="flex-row items-center justify-between space-y-0 pl-3 pr-14 py-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-xs font-medium">
            Semantic Segmentation
          </CardTitle>
          <Badge variant="secondary" className="h-4 px-1 text-2xs">
            #{sensorId}
          </Badge>
          <span
            ref={resDisplayRef}
            className="font-mono text-2xs tabular-nums text-muted-foreground"
          >
            --
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant={showLegend ? "secondary" : "ghost"}
            size="icon-xs"
            onClick={() => setShowLegend(!showLegend)}
            title={showLegend ? "Hide class legend" : "Show class legend"}
            aria-label={showLegend ? "Hide class legend" : "Show class legend"}
            aria-pressed={showLegend}
          >
            <List className="size-3" aria-hidden="true" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="relative flex-1 p-0">
        <canvas
          ref={canvasRef}
          aria-label="Segmentation view"
          className="h-full w-full object-contain"
        />
        {!hasReceivedFrame && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            Waiting for data...
          </div>
        )}
        {showLegend && (
          <div className="absolute bottom-2 left-2 rounded-md bg-background/80 p-2 backdrop-blur-sm">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {LEGEND_ITEMS.map((item) => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <div
                    className="size-2.5 rounded-sm"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-2xs">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
