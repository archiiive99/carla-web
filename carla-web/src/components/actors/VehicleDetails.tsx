
import { errorMessage , reportError } from "@/lib/utils";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";
import { useActorStore } from "@/stores/actorStore";
import { carlaApi } from "@/lib/carla-api";

const LIGHT_BUTTONS = [
  { label: "Position", bit: 1 },
  { label: "Low Beam", bit: 2 },
  { label: "High Beam", bit: 4 },
  { label: "Brake", bit: 8 },
  { label: "L Blinker", bit: 16 },
  { label: "R Blinker", bit: 32 },
  { label: "Reverse", bit: 64 },
  { label: "Fog", bit: 128 },
];

interface VehicleDetailsProps {
  actorId: number;
}

export function VehicleDetails({ actorId }: VehicleDetailsProps) {
  const setAutopilot = useActorStore((s) => s.setAutopilot);
  const egoVehicleId = useActorStore((s) => s.egoVehicleId);
  const egoAutopilot = useActorStore((s) => s.egoAutopilot);
  const isEgo = egoVehicleId === actorId;
  const [control, setControl] = useState({ throttle: 0, steer: 0, brake: 0 });
  const [lightState, setLightState] = useState(0);

  const toggleLightBit = useCallback(
    (bit: number) => {
      setLightState((prev) => {
        const next = prev ^ bit;
        carlaApi.setLights(actorId, next).catch((e) =>
          reportError("Lights", e),
        );
        return next;
      });
    },
    [actorId],
  );

  // Reset local light state when switching to a different vehicle — the bridge
  // currently doesn't expose the read-back, so this keeps the UI from carrying
  // the previous actor's toggles over.
  useEffect(() => {
    setLightState(0);
  }, [actorId]);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const actor = await carlaApi.getActor(actorId);
        if (!cancelled && actor.control) {
          setControl({
            throttle: actor.control.throttle ?? 0,
            steer: actor.control.steer ?? 0,
            brake: actor.control.brake ?? 0,
          });
        }
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 500);
    return () => { cancelled = true; clearInterval(interval); };
  }, [actorId]);

  const handleAutopilotToggle = useCallback(
    (checked: boolean) => {
      setAutopilot(actorId, checked).catch((e) =>
        reportError("Autopilot", e),
      );
    },
    [actorId, setAutopilot],
  );

  return (
    <div className="space-y-3">
      {/* Autopilot */}
      <div className="flex items-center justify-between">
        <Label htmlFor="vehicle-autopilot" className="cursor-pointer text-xs">
          Autopilot
        </Label>
        <Switch
          id="vehicle-autopilot"
          checked={isEgo ? egoAutopilot : undefined}
          onCheckedChange={handleAutopilotToggle}
          aria-label="Toggle autopilot"
        />
      </div>

      <p className="text-2xs text-muted-foreground">
        {isEgo ? (
          <>
            Use <span className="font-mono">W A S D</span>, <span className="font-mono">Space</span>, <span className="font-mono">R</span> in the viewport — this uses the dedicated managed-ego control path, and autopilot turns off on the first key press.
          </>
        ) : (
          <>
            Viewport <span className="font-mono">W A S D</span> always drives the managed ego vehicle. Use the sliders below to send direct control to this selected vehicle.
          </>
        )}
      </p>

      <Separator />

      {/* Control sliders — interactive */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Throttle</Label>
          <span className="font-mono text-2xs tabular-nums text-muted-foreground">{(control.throttle * 100).toFixed(0)}%</span>
        </div>
        <Slider
          min={0}
          max={1}
          step={0.01}
          value={[control.throttle]}
          aria-label="Throttle"
          onValueChange={(v) => {
            const val = Array.isArray(v) ? v[0] : v;
            setControl((prev) => ({ ...prev, throttle: val }));
            carlaApi.applyControl(actorId, { ...control, throttle: val, hand_brake: false, reverse: false }).catch(() => {});
          }}
        />
        <div className="flex items-center justify-between">
          <Label className="text-xs">Steering</Label>
          <span className="font-mono text-2xs tabular-nums text-muted-foreground">{(control.steer * 100).toFixed(0)}%</span>
        </div>
        <Slider
          min={-1}
          max={1}
          step={0.01}
          value={[control.steer]}
          aria-label="Steering"
          onValueChange={(v) => {
            const val = Array.isArray(v) ? v[0] : v;
            setControl((prev) => ({ ...prev, steer: val }));
            carlaApi.applyControl(actorId, { ...control, steer: val, hand_brake: false, reverse: false }).catch(() => {});
          }}
        />
        <div className="flex items-center justify-between">
          <Label className="text-xs">Brake</Label>
          <span className="font-mono text-2xs tabular-nums text-muted-foreground">{(control.brake * 100).toFixed(0)}%</span>
        </div>
        <Slider
          min={0}
          max={1}
          step={0.01}
          value={[Math.max(0, control.brake)]}
          aria-label="Brake"
          onValueChange={(v) => {
            const val = Array.isArray(v) ? v[0] : v;
            setControl((prev) => ({ ...prev, brake: val }));
            carlaApi.applyControl(actorId, { ...control, brake: val, hand_brake: false, reverse: false }).catch(() => {});
          }}
        />
      </div>

      <Separator />

      {/* Lights */}
      <div className="space-y-2">
        <Label className="text-xs">Lights</Label>
        <div className="flex flex-wrap gap-1">
          {LIGHT_BUTTONS.map((light) => {
            const pressed = (lightState & light.bit) !== 0;
            return (
              <Toggle
                key={light.bit}
                size="xs"
                pressed={pressed}
                onPressedChange={() => toggleLightBit(light.bit)}
                aria-label={`Toggle ${light.label} light`}
                aria-pressed={pressed}
              >
                {light.label}
              </Toggle>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* Doors — stub UI, no bridge endpoint yet */}
      <div className="space-y-2 opacity-60">
        <div className="flex items-center gap-1">
          <Label className="text-xs">Doors</Label>
          <span className="text-3xs uppercase tracking-wide text-muted-foreground">
            not wired
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {["FL", "FR", "RL", "RR"].map((door) => (
            <Button key={door} variant="outline" size="xs" disabled className="text-2xs">
              {door}
            </Button>
          ))}
        </div>
        <Button variant="outline" size="xs" disabled className="w-full text-2xs">
          Open All
        </Button>
      </div>
    </div>
  );
}
