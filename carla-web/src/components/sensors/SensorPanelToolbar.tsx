import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SensorPanelGridSize = "1x1" | "2x1" | "2x2" | "3x2" | "3x3";

interface SensorPanelToolbarProps {
  gridSize: SensorPanelGridSize;
  onGridSizeChange: (size: SensorPanelGridSize) => void;
  filledCells: number;
  totalCells: number;
  liveSensorCount: number;
  subscribedSensorCount: number;
  showSubscribedOnly: boolean;
  onToggleSubscribedOnly: () => void;
  onFocusManagedRgb: () => void;
  focusManagedRgbDisabled: boolean;
  onResetGrid: () => void;
}

// One strip across the top of the sensor panel. The old version jammed a
// Select, three counter badges, and four action buttons into the same flex
// row inline in SensorPanel — that's the "cluttered viewport controls"
// problem. Pulled out so the main panel file stays focused on orchestration.
export function SensorPanelToolbar({
  gridSize,
  onGridSizeChange,
  filledCells,
  totalCells,
  liveSensorCount,
  subscribedSensorCount,
  showSubscribedOnly,
  onToggleSubscribedOnly,
  onFocusManagedRgb,
  focusManagedRgbDisabled,
  onResetGrid,
}: SensorPanelToolbarProps) {
  return (
    <div className="flex items-center gap-2 border-b px-3 py-2">
      <span className="text-xs text-muted-foreground">Layout</span>
      <Select
        value={gridSize}
        onValueChange={(v) => onGridSizeChange(v as SensorPanelGridSize)}
      >
        <SelectTrigger size="xs" className="w-20" aria-label="Sensor grid layout">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1x1" className="text-xs">1x1</SelectItem>
          <SelectItem value="2x1" className="text-xs">2x1</SelectItem>
          <SelectItem value="2x2" className="text-xs">2x2</SelectItem>
          <SelectItem value="3x2" className="text-xs">3x2</SelectItem>
          <SelectItem value="3x3" className="text-xs">3x3</SelectItem>
        </SelectContent>
      </Select>
      <Badge
        variant="secondary"
        className="h-4 px-1.5 text-2xs tabular-nums"
        title={`${filledCells} of ${totalCells} cells filled`}
      >
        {filledCells}/{totalCells}
      </Badge>
      <Badge variant="outline" className="h-4 px-1.5 text-2xs tabular-nums">
        {liveSensorCount} live
      </Badge>
      <Badge variant="outline" className="h-4 px-1.5 text-2xs tabular-nums">
        {subscribedSensorCount} subscribed
      </Badge>
      <div className="ml-auto flex flex-wrap gap-1.5">
        <Button
          variant={showSubscribedOnly ? "secondary" : "ghost"}
          size="xs"
          onClick={onToggleSubscribedOnly}
        >
          {showSubscribedOnly ? "Subscribed only" : "All sensors"}
        </Button>
        <Button
          variant="ghost"
          size="xs"
          onClick={onFocusManagedRgb}
          disabled={focusManagedRgbDisabled}
        >
          Focus ego RGB
        </Button>
        <Button
          variant="ghost"
          size="xs"
          onClick={onResetGrid}
        >
          Reset grid
        </Button>
      </div>
    </div>
  );
}
