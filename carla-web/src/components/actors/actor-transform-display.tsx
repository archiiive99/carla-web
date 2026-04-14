import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Car, PersonStanding, Camera } from "lucide-react";
import type { CarlaActor } from "@/types/carla";

// Icon for the top of the ActorDetails pane. Only actors that present a
// distinct actor-type icon get one; traffic_light / traffic_sign / other
// currently fall through to `null` and the detail card renders without
// the leading icon rather than pretending a generic box represents them.
export function ActorIcon({ type }: { type: string }) {
  switch (type) {
    case "vehicle":
      return <Car className="size-4" aria-hidden="true" />;
    case "walker":
      return <PersonStanding className="size-4" aria-hidden="true" />;
    case "sensor":
      return <Camera className="size-4" aria-hidden="true" />;
    default:
      return null;
  }
}

// Read-only axis input: prefix letter (X/Y/Z/P/R) inside the box, value
// in monospace, aria-label carries the full semantic name so screen
// readers can distinguish "Position X" from "Rotation pitch".
export function AxisInput({
  axis,
  value,
  label,
}: {
  axis: string;
  value: string;
  label?: string;
}) {
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-2xs font-medium uppercase tracking-wider text-muted-foreground"
      >
        {axis}
      </span>
      <Input
        value={value}
        readOnly
        aria-label={label ?? `${axis} value`}
        className="h-8 pl-6 pr-2 font-mono text-xs tabular-nums"
      />
    </div>
  );
}

export function TransformDisplay({ actor }: { actor: CarlaActor }) {
  const { location: loc, rotation: rot } = actor.transform;
  return (
    <div className="space-y-2">
      <Label className="text-xs">Position</Label>
      <div className="grid grid-cols-3 gap-1">
        <AxisInput axis="X" label="Position X" value={loc.x.toFixed(2)} />
        <AxisInput axis="Y" label="Position Y" value={loc.y.toFixed(2)} />
        <AxisInput axis="Z" label="Position Z" value={loc.z.toFixed(2)} />
      </div>
      <Label className="text-xs">Rotation (°)</Label>
      <div className="grid grid-cols-3 gap-1">
        <AxisInput axis="P" label="Rotation pitch" value={rot.pitch.toFixed(1)} />
        <AxisInput axis="Y" label="Rotation yaw" value={rot.yaw.toFixed(1)} />
        <AxisInput axis="R" label="Rotation roll" value={rot.roll.toFixed(1)} />
      </div>
    </div>
  );
}

export function VelocityDisplay({ actor }: { actor: CarlaActor }) {
  const { x, y, z } = actor.velocity;
  const speed = Math.sqrt(x * x + y * y + z * z) * 3.6;
  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-baseline gap-2">
        <span className="text-muted-foreground">Speed</span>
        <span className="font-mono text-sm font-semibold tabular-nums">
          {speed.toFixed(1)}
        </span>
        <span className="text-2xs text-muted-foreground">km/h</span>
      </div>
      <div className="grid grid-cols-3 gap-1">
        <AxisInput axis="X" label="Velocity X" value={x.toFixed(2)} />
        <AxisInput axis="Y" label="Velocity Y" value={y.toFixed(2)} />
        <AxisInput axis="Z" label="Velocity Z" value={z.toFixed(2)} />
      </div>
    </div>
  );
}
