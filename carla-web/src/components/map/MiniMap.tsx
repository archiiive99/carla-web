
import { useRef, useEffect, useCallback, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useActorStore } from "@/stores/actorStore";
import { useSimulationStore } from "@/stores/simulationStore";
import { carlaApi } from "@/lib/carla-api";
import type { CarlaActor, TopologyEdge } from "@/types/carla";
import { MINIMAP_DEFAULT_ZOOM, MINIMAP_MIN_ZOOM, MINIMAP_MAX_ZOOM, BRIDGE_EGO_ROLE } from "@/constants";
import { useAnimationFrame } from "@/hooks/useAnimationFrame";
import { readMapColors } from "./minimap/palette";
import { drawActor } from "./minimap/draw-actor";

interface MiniMapProps {
  className?: string;
}

export function MiniMap({ className }: MiniMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef({ cx: 0, cy: 0, zoom: MINIMAP_DEFAULT_ZOOM });
  const draggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });

  const actors = useActorStore((s) => s.actors);
  const selectedActorId = useActorStore((s) => s.selectedActorId);
  const selectActor = useActorStore((s) => s.selectActor);
  const storeEgoId = useActorStore((s) => s.egoVehicleId);
  const [topology, setTopology] = useState<TopologyEdge[]>([]);

  // Refetch topology whenever the active map changes (avoids keeping the
  // previous map's road network after a load/reload).
  const currentMap = useSimulationStore((s) => s.currentMap);
  useEffect(() => {
    let cancelled = false;
    setTopology([]);
    carlaApi.getTopology().then((data) => { if (!cancelled) setTopology(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [currentMap]);

  // Auto-center on the bridge-managed ego once on first load.
  // Prefer the real ego (role_name="bridge_ego") — with many NPCs spawned,
  // the "first vehicle" in the map is non-deterministic.
  const centeredRef = useRef(false);
  useEffect(() => {
    if (centeredRef.current) return;
    const ego =
      (storeEgoId !== null ? actors.get(storeEgoId) : undefined) ??
      Array.from(actors.values()).find(
        (a) => a.type === "vehicle" && a.role_name === BRIDGE_EGO_ROLE,
      ) ??
      Array.from(actors.values()).find((a) => a.type === "vehicle");
    if (ego) {
      centeredRef.current = true;
      viewRef.current.cx = ego.transform.location.x;
      viewRef.current.cy = ego.transform.location.y;
      viewRef.current.zoom = 2;
    }
  }, [actors, storeEgoId]);

  const worldToScreen = useCallback(
    (wx: number, wy: number, w: number, h: number) => {
      const v = viewRef.current;
      const sx = (wx - v.cx) * v.zoom + w / 2;
      const sy = (wy - v.cy) * v.zoom + h / 2;
      return { sx, sy };
    },
    [],
  );

  const screenToWorld = useCallback(
    (sx: number, sy: number, w: number, h: number) => {
      const v = viewRef.current;
      const wx = (sx - w / 2) / v.zoom + v.cx;
      const wy = (sy - h / 2) / v.zoom + v.cy;
      return { wx, wy };
    },
    [],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = devicePixelRatio;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const zoom = viewRef.current.zoom;
    const palette = readMapColors();

    // Background
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, w, h);

    // Grid
    const gridSize = zoom > 2 ? 10 : zoom > 0.5 ? 50 : 100;
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 0.5;
    const topLeft = screenToWorld(0, 0, w, h);
    const startX = Math.floor(topLeft.wx / gridSize) * gridSize;
    const startY = Math.floor(topLeft.wy / gridSize) * gridSize;
    for (let gx = startX; gx < topLeft.wx + w / zoom; gx += gridSize) {
      const { sx } = worldToScreen(gx, 0, w, h);
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, h);
      ctx.stroke();
    }
    for (let gy = startY; gy < topLeft.wy + h / zoom; gy += gridSize) {
      const { sy } = worldToScreen(0, gy, w, h);
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
      ctx.stroke();
    }

    // Draw road topology (batched for performance)
    if (topology.length > 0) {
      ctx.strokeStyle = palette.road;
      ctx.lineWidth = Math.max(1, zoom * 0.8);
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      for (const edge of topology) {
        const s = worldToScreen(edge.start.transform.location.x, edge.start.transform.location.y, w, h);
        const e = worldToScreen(edge.end.transform.location.x, edge.end.transform.location.y, w, h);
        ctx.moveTo(s.sx, s.sy);
        ctx.lineTo(e.sx, e.sy);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Resolve the real ego once per frame (prefer store, then role_name, then first vehicle)
    const actorList = Array.from(actors.values());
    let egoId: number | null = null;
    if (storeEgoId !== null && actors.has(storeEgoId)) egoId = storeEgoId;
    else {
      for (const a of actorList) {
        if (a.type === "vehicle" && a.role_name === BRIDGE_EGO_ROLE) {
          egoId = a.id;
          break;
        }
      }
    }

    // Draw actors
    for (const actor of actorList) {
      const { sx, sy } = worldToScreen(
        actor.transform.location.x,
        actor.transform.location.y,
        w,
        h,
      );

      if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) continue;

      const isSelected = actor.id === selectedActorId;
      const isEgo = actor.id === egoId;
      const size = isSelected ? 8 : isEgo ? 7 : 5;

      if (isSelected) {
        ctx.beginPath();
        ctx.arc(sx, sy, size + 3, 0, Math.PI * 2);
        ctx.strokeStyle = palette.selected;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      drawActor(ctx, palette, actor, sx, sy, size, isEgo);
    }

    // Scale bar
    const scaleMeters = zoom > 2 ? 10 : zoom > 0.5 ? 50 : 200;
    const scalePx = scaleMeters * zoom;
    ctx.fillStyle = palette.mutedFg;
    ctx.fillRect(10, h - 18, scalePx, 2);
    ctx.font = "9px monospace";
    ctx.fillText(`${scaleMeters}m`, 10, h - 22);

    // Origin crosshair
    const { sx: ox, sy: oy } = worldToScreen(0, 0, w, h);
    ctx.strokeStyle = palette.road;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(ox - 8, oy);
    ctx.lineTo(ox + 8, oy);
    ctx.moveTo(ox, oy - 8);
    ctx.lineTo(ox, oy + 8);
    ctx.stroke();
  }, [actors, selectedActorId, storeEgoId, topology, worldToScreen, screenToWorld]);

  useAnimationFrame(draw);

  // Pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      draggingRef.current = true;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - lastMouseRef.current.x;
    const dy = e.clientY - lastMouseRef.current.y;
    viewRef.current.cx -= dx / viewRef.current.zoom;
    viewRef.current.cy -= dy / viewRef.current.zoom;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  // Zoom — attach as a native non-passive listener so preventDefault actually
  // stops the page from scrolling (React's synthetic onWheel is passive).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      viewRef.current.zoom = Math.max(MINIMAP_MIN_ZOOM, Math.min(MINIMAP_MAX_ZOOM, viewRef.current.zoom * factor));
    };
    canvas.addEventListener("wheel", handler, { passive: false });
    return () => canvas.removeEventListener("wheel", handler);
  }, []);

  // Click to select actor
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const { wx, wy } = screenToWorld(mx, my, rect.width, rect.height);

      let closest: number | null = null;
      let closestDist = 15 / viewRef.current.zoom;
      for (const actor of actors.values()) {
        const dx = actor.transform.location.x - wx;
        const dy = actor.transform.location.y - wy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < closestDist) {
          closestDist = dist;
          closest = actor.id;
        }
      }
      selectActor(closest);
    },
    [actors, selectActor, screenToWorld],
  );

  return (
    <Card className={cn("flex h-full flex-col overflow-hidden", className)}>
      <CardHeader className="px-3 py-2">
        <CardTitle className="text-xs font-medium">MiniMap</CardTitle>
      </CardHeader>
      <CardContent className="relative flex-1 px-3 pb-3">
        <canvas
          ref={canvasRef}
          aria-label="Mini map with actor positions"
          className="h-full w-full cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={handleClick}
        />
        <div className="absolute left-2 top-2 rounded border border-border/60 bg-background/80 px-2 py-1 font-mono tabular-nums text-2xs text-muted-foreground backdrop-blur-sm">
          {actors.size} actors
        </div>
        <div className="absolute bottom-2 right-2 space-y-0.5 rounded border border-border/60 bg-background/80 p-2 text-3xs text-muted-foreground backdrop-blur-sm">
          <div className="flex items-center gap-1.5"><div className="size-2 rounded-full bg-chart-3" aria-hidden="true" />Ego</div>
          <div className="flex items-center gap-1.5"><div className="size-2 rounded-full bg-chart-4" aria-hidden="true" />Vehicles</div>
          <div className="flex items-center gap-1.5"><div className="size-2 rounded-full bg-chart-2" aria-hidden="true" />Walkers</div>
          <div className="flex items-center gap-1.5"><div className="size-2 rounded-full bg-chart-6" aria-hidden="true" />Sensors</div>
          <div className="flex items-center gap-1.5"><div className="size-2 rounded-full bg-amber-500" aria-hidden="true" />Selected</div>
        </div>
      </CardContent>
    </Card>
  );
}
