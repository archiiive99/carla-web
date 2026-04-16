
import { useRef, useEffect, useCallback, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTopologyCached } from "@/lib/topology-cache";
import type { TopologyEdge } from "@/types/carla";
import { themeColors } from "@/lib/theme-colors";
import { useAnimationFrame } from "@/hooks/useAnimationFrame";
import { useSimulationStore, useIsConnected } from "@/stores/simulationStore";

interface OpenDriveViewerProps {
  className?: string;
}

function roadViewerThemeColors() {
  const c = themeColors();
  return {
    background: c.background,
    muted: c.mutedFg,
    road: c.border,
    junction: "oklch(0.7 0.17 60)", // amber-ish (junction highlight)
  };
}

export function OpenDriveViewer({ className }: OpenDriveViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [topology, setTopology] = useState<TopologyEdge[]>([]);
  const [loading, setLoading] = useState(false);
  const [showJunctions, setShowJunctions] = useState(true);
  const viewRef = useRef({ cx: 0, cy: 0, zoom: 0.5 });
  const draggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  // Cache the last-seen CSS rect so the useAnimationFrame loop doesn't
  // reassign canvas.width/height every frame — the assignment forces a
  // layout sync and internally resets the backing store, both wasted
  // when size is unchanged (which is the 60fps steady state).
  const lastRectRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  const currentMap = useSimulationStore((s) => s.currentMap);
  const isConnected = useIsConnected();

  const fetchTopology = useCallback(async () => {
    setLoading(true);
    try {
      const edges = await getTopologyCached(currentMap);
      setTopology(edges);
    } catch {
      // Not connected
    } finally {
      setLoading(false);
    }
  }, [currentMap]);

  // Auto-load topology on mount and whenever the active map changes.
  useEffect(() => {
    setTopology([]);
    if (isConnected) fetchTopology();
  }, [fetchTopology, currentMap, isConnected]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = devicePixelRatio;
    if (
      rect.width !== lastRectRef.current.w ||
      rect.height !== lastRectRef.current.h
    ) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      lastRectRef.current = { w: rect.width, h: rect.height };
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Reset the transform before applying DPR scale each frame, since we
    // no longer force a backing-store reset by reassigning width/height.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const v = viewRef.current;
    const colors = roadViewerThemeColors();

    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, w, h);

    if (topology.length === 0) {
      ctx.fillStyle = colors.muted;
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(loading ? "Loading road network..." : "Click Refresh to load road network", w / 2, h / 2);
      return;
    }

    // Draw road segments
    for (const edge of topology) {
      const s = edge.start.transform.location;
      const e = edge.end.transform.location;
      const sx = (s.x - v.cx) * v.zoom + w / 2;
      const sy = (s.y - v.cy) * v.zoom + h / 2;
      const ex = (e.x - v.cx) * v.zoom + w / 2;
      const ey = (e.y - v.cy) * v.zoom + h / 2;

      // Skip offscreen segments
      if (
        Math.max(sx, ex) < -10 || Math.min(sx, ex) > w + 10 ||
        Math.max(sy, ey) < -10 || Math.min(sy, ey) > h + 10
      ) continue;

      const isJunction = edge.start.lane_id !== edge.end.lane_id;

      if (isJunction && showJunctions) {
        ctx.strokeStyle = colors.junction;
        ctx.lineWidth = 2;
      } else {
        ctx.strokeStyle = colors.road;
        ctx.lineWidth = 1.5;
      }

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }

    // Road IDs at nodes
    if (v.zoom > 1) {
      ctx.fillStyle = colors.muted;
      ctx.font = "8px monospace";
      for (const edge of topology) {
        const s = edge.start.transform.location;
        const sx = (s.x - v.cx) * v.zoom + w / 2;
        const sy = (s.y - v.cy) * v.zoom + h / 2;
        if (sx > 0 && sx < w && sy > 0 && sy < h) {
          ctx.fillText(`R${edge.start.road_id}`, sx + 3, sy - 3);
        }
      }
    }

    // Stats
    ctx.fillStyle = colors.muted;
    ctx.font = "9px monospace";
    ctx.textAlign = "left";
    ctx.fillText(`${topology.length} segments`, 8, 14);
  }, [topology, showJunctions, loading]);

  useAnimationFrame(draw);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      draggingRef.current = true;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingRef.current) return;
    viewRef.current.cx -= (e.clientX - lastMouseRef.current.x) / viewRef.current.zoom;
    viewRef.current.cy -= (e.clientY - lastMouseRef.current.y) / viewRef.current.zoom;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  // Zoom — React's synthetic onWheel is passive in recent versions, so
  // preventDefault() in a synthetic handler is a no-op and the page scrolls
  // behind the zoom. Attach a native non-passive listener instead.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      viewRef.current.zoom = Math.max(0.02, Math.min(10, viewRef.current.zoom * factor));
    };
    canvas.addEventListener("wheel", handler, { passive: false });
    return () => canvas.removeEventListener("wheel", handler);
  }, []);

  return (
    <Card className={cn("flex h-full flex-col overflow-hidden", className)}>
      <CardHeader className="flex-row items-center justify-between space-y-0 px-3 py-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-xs font-medium">Road Network</CardTitle>
          <Badge variant="secondary" className="h-5 px-2 text-2xs tabular-nums">
            {topology.length} seg
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Checkbox
              id="junctions"
              checked={showJunctions}
              onCheckedChange={(c) => setShowJunctions(!!c)}
              className="size-3.5"
            />
            <Label htmlFor="junctions" className="cursor-pointer text-xs">
              Junctions
            </Label>
          </div>
          <Button
            variant="outline"
            size="icon-xs"
            onClick={fetchTopology}
            disabled={loading || !isConnected}
            title={isConnected ? "Refresh road topology" : "Connect to CARLA first"}
            aria-label="Refresh road topology"
          >
            {loading ? <Spinner className="size-3" aria-hidden="true" /> : <RefreshCw className="size-3" aria-hidden="true" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-3 pt-2">
        <canvas
          ref={canvasRef}
          aria-label="Road network viewer"
          className="h-full w-full cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </CardContent>
    </Card>
  );
}
