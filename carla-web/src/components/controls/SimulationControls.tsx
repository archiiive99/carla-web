
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Play, Pause, SkipForward, Gauge } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { useSimulationStore, useIsConnected } from "@/stores/simulationStore";
import { carlaApi } from "@/lib/carla-api";

// Speed steps: 0.5, 1, 2, 5, 10
const SPEED_STEPS = [0.5, 1, 2, 5, 10];

export function SimulationControls() {
  const isConnected = useIsConnected();
  const isRunning = useSimulationStore((s) => s.isRunning);
  const isPaused = useSimulationStore((s) => s.isPaused);
  const syncMode = useSimulationStore((s) => s.syncMode);
  const play = useSimulationStore((s) => s.play);
  const pause = useSimulationStore((s) => s.pause);
  const step = useSimulationStore((s) => s.step);
  const [speedIdx, setSpeedIdx] = useState(1); // Default to 1x

  const handlePlay = useCallback(() => { play().catch(() => {}); }, [play]);
  const handlePause = useCallback(() => { pause().catch(() => {}); }, [pause]);
  const handleStep = useCallback(() => { step().catch(() => {}); }, [step]);

  const handleSyncToggle = useCallback(
    (checked: boolean) => {
      carlaApi.setSettings({ sync_mode: checked }).catch(() => {});
    },
    [],
  );

  return (
    <div className="flex items-center gap-1.5">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant={isRunning && !isPaused ? "default" : "outline"}
              size="icon"
              disabled={!isConnected}
              onClick={handlePlay}
              aria-label={isRunning && !isPaused ? "Simulation running" : "Play simulation"}
              aria-pressed={isRunning && !isPaused}
              className={isRunning && !isPaused ? "bg-success text-success-foreground hover:bg-success/90" : ""}
            >
              <Play className="size-3.5" aria-hidden="true" />
            </Button>
          }
        />
        <TooltipContent side="bottom">
          <p className="flex items-center gap-1.5">Play <Kbd>Space</Kbd></p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant={isPaused ? "default" : "outline"}
              size="icon"
              disabled={!isConnected}
              onClick={handlePause}
              aria-label={isPaused ? "Simulation paused" : "Pause simulation"}
              aria-pressed={isPaused}
              className={isPaused ? "bg-warning text-warning-foreground hover:bg-warning/90" : ""}
            >
              <Pause className="size-3.5" aria-hidden="true" />
            </Button>
          }
        />
        <TooltipContent side="bottom">
          <p>Pause</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="outline"
              size="icon"
              disabled={!isConnected || (isRunning && !syncMode)}
              onClick={handleStep}
              aria-label="Step one simulation tick"
            >
              <SkipForward className="size-3.5" aria-hidden="true" />
            </Button>
          }
        />
        <TooltipContent side="bottom">
          <p className="flex items-center gap-1.5">Step <Kbd>N</Kbd></p>
        </TooltipContent>
      </Tooltip>

      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className="w-20 gap-1 text-xs"
              disabled={!isConnected}
              aria-label={`Simulation speed ${SPEED_STEPS[speedIdx]}x — click to change`}
            >
              <Gauge className="size-3" aria-hidden="true" />
              {SPEED_STEPS[speedIdx]}x
            </Button>
          }
        />
        <PopoverContent className="w-52 p-3" align="center">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Sim Speed</Label>
              <span className="font-mono tabular-nums text-xs text-muted-foreground">{SPEED_STEPS[speedIdx]}x</span>
            </div>
            <Slider
              min={0}
              max={SPEED_STEPS.length - 1}
              step={1}
              value={[speedIdx]}
              aria-label="Simulation speed"
              onValueChange={(v) => {
                const idx = Array.isArray(v) ? v[0] : v;
                // Slider min/max/step keep idx within SPEED_STEPS bounds,
                // but noUncheckedIndexedAccess treats arr[i] as T|undefined.
                // Clamp defensively; falls back to the middle step (1×).
                const multiplier = SPEED_STEPS[idx] ?? 1;
                setSpeedIdx(idx);
                // Slider drags fire onValueChange per step; silent-swallow
                // follows the same pattern as VehicleDetails / TrafficManager
                // so a transient bridge hiccup doesn't spam speed-change
                // toasts while the user is dragging.
                carlaApi.setSettings({
                  sync_mode: true,
                  fixed_delta: 0.05 / multiplier,
                }).catch(() => {});
              }}
            />
            <div className="flex justify-between font-mono text-2xs tabular-nums text-muted-foreground">
              <span>0.5x</span>
              <span>1x</span>
              <span>2x</span>
              <span>5x</span>
              <span>10x</span>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Separator orientation="vertical" className="h-4" />

      <div className="flex items-center gap-1.5">
        <Switch
          id="sync-mode"
          checked={syncMode}
          onCheckedChange={handleSyncToggle}
          disabled={!isConnected}
          aria-label="Toggle synchronous simulation mode"
          className="peer"
        />
        <Label htmlFor="sync-mode" className="text-sm text-muted-foreground peer-disabled:opacity-50">
          Sync
        </Label>
      </div>
    </div>
  );
}
