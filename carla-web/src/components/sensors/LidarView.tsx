
import { useRef, Suspense, lazy } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Download } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { useLidarSensorData } from "@/hooks/useSensorData";
import { saveLidarAsPly } from "@/lib/data-export";

const LidarScene = lazy(() => import("./LidarScene"));

interface LidarViewProps {
  sensorId: number;
  className?: string;
}

export default function LidarView({ sensorId, className }: LidarViewProps) {
  const pointCountRef = useRef<HTMLSpanElement>(null);
  const { positionsRef, colorsRef, pointCountRef: liveCountRef } = useLidarSensorData(sensorId);

  const handleExport = () => {
    const positions = positionsRef.current;
    const colors = colorsRef.current;
    const count = liveCountRef.current;
    // Tell the user when Export is pressed before any frame has arrived
    // — a silent no-op looked like a broken button.
    if (!positions || !colors || count <= 0) {
      toast.error("No LiDAR data to export — waiting for first frame");
      return;
    }
    saveLidarAsPly(positions, colors, count, `lidar_${sensorId}.ply`);
  };

  return (
    <Card className={cn("flex h-full flex-col overflow-hidden", className)}>
      <CardHeader className="flex-row items-center justify-between space-y-0 pl-3 pr-14 py-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-xs font-medium">LiDAR</CardTitle>
          <Badge variant="secondary" className="h-4 px-1 text-2xs">
            #{sensorId}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            ref={pointCountRef}
            className="font-mono text-2xs tabular-nums text-success transition-colors"
          >
            0 pts
          </span>
          <Button variant="ghost" size="icon-xs" onClick={handleExport} title="Export as PLY" aria-label="Export LiDAR data as PLY">
            <Download className="size-3" aria-hidden="true" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="relative flex-1 p-2">
        <ErrorBoundary>
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <Spinner className="size-6" aria-label="Loading LiDAR scene" />
              </div>
            }
          >
            <ContextMenu>
              <ContextMenuTrigger className="block h-full w-full">
                <LidarScene sensorId={sensorId} pointCountRef={pointCountRef} />
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onClick={handleExport}>
                  <Download className="mr-2 size-4" aria-hidden="true" /> Export Data (PLY)
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </Suspense>
        </ErrorBoundary>
      </CardContent>
    </Card>
  );
}
