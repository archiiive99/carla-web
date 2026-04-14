import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CarlaTransform } from "@/types/carla";

// Position + rotation inputs for the SpawnPanel tabs. Each axis input
// carries its own aria-label so screen readers can distinguish "Position X"
// from "Rotation pitch" without the visual prefix ("X"/"P"/"R").
export function TransformInputs({
  value,
  onChange,
}: {
  value: CarlaTransform;
  onChange: (t: CarlaTransform) => void;
}) {
  const updateLoc = (axis: "x" | "y" | "z", val: string) => {
    onChange({
      ...value,
      location: { ...value.location, [axis]: parseFloat(val) || 0 },
    });
  };
  const updateRot = (axis: "pitch" | "yaw" | "roll", val: string) => {
    onChange({
      ...value,
      rotation: { ...value.rotation, [axis]: parseFloat(val) || 0 },
    });
  };

  const axisField = (
    axis: string,
    fullLabel: string,
    val: number,
    handler: (v: string) => void,
  ) => (
    <div className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-2xs font-medium uppercase tracking-wider text-muted-foreground"
      >
        {axis}
      </span>
      <Input
        type="number"
        value={val}
        onChange={(e) => handler(e.target.value)}
        aria-label={fullLabel}
        className="h-8 pl-7 pr-2 font-mono text-xs tabular-nums"
      />
    </div>
  );

  return (
    <div className="space-y-2">
      <Label className="text-xs">Position</Label>
      <div className="grid grid-cols-3 gap-2">
        {axisField("X", "Position X", value.location.x, (v) => updateLoc("x", v))}
        {axisField("Y", "Position Y", value.location.y, (v) => updateLoc("y", v))}
        {axisField("Z", "Position Z", value.location.z, (v) => updateLoc("z", v))}
      </div>
      <Label className="text-xs">Rotation (°)</Label>
      <div className="grid grid-cols-3 gap-2">
        {axisField("P", "Rotation pitch", value.rotation.pitch, (v) => updateRot("pitch", v))}
        {axisField("Y", "Rotation yaw", value.rotation.yaw, (v) => updateRot("yaw", v))}
        {axisField("R", "Rotation roll", value.rotation.roll, (v) => updateRot("roll", v))}
      </div>
    </div>
  );
}

export const DEFAULT_TRANSFORM: CarlaTransform = {
  location: { x: 0, y: 0, z: 2 },
  rotation: { pitch: 0, yaw: 0, roll: 0 },
};
