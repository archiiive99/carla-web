import { useId, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getSensorDisplayName } from "@/lib/sensor-registry";
import { useRegisterViewport } from "@/components/viewport/useRegisterViewport";
import {
  CAMERA_PRESETS,
  type CameraPresetKey,
} from "./sensor-camera-presets";

// A sensor cell that renders the shared world scene from a PerspectiveCamera
// driven by either a preset (ego-relative) or a CARLA sensor's extrinsics.
// The actual render is done by the single root WorldCanvas's compositor.
// This component is a DOM rect + metadata registration.

interface SensorCameraViewProps {
  sensorId: number;
  preset?: CameraPresetKey;
  // Header label (RGB Camera / Depth etc. — only used for real sensors
  // where sensorId maps to a CARLA actor).
  label?: string;
  sensorType?: string;
  className?: string;
}

export default function SensorCameraView({
  sensorId,
  preset,
  label,
  sensorType,
  className,
}: SensorCameraViewProps) {
  const reactId = useId();
  const divRef = useRef<HTMLDivElement>(null);

  // Unique-per-mount viewport id. Preset cells pass negative sensorIds;
  // real sensor cells pass positive CARLA actor ids — combining with the
  // React id ensures multiple cells showing the same sensor (split view)
  // register as independent viewports.
  const vpId = preset
    ? `sensor-preset-${reactId}-${preset}`
    : `sensor-rgb-${reactId}-${sensorId}`;

  useRegisterViewport(
    vpId,
    divRef,
    preset
      ? { type: "sensor-preset", preset }
      : { type: "sensor-extrinsic", sensorId },
  );

  const headerLabel = preset
    ? CAMERA_PRESETS[preset]?.label ?? "Camera"
    : label ?? (sensorType ? getSensorDisplayName(sensorType) : "Camera");

  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden rounded-md border bg-transparent",
        className,
      )}
    >
      <div ref={divRef} className="absolute inset-0" aria-label="Sensor camera view" />
      <div className="pointer-events-none absolute left-1.5 top-1.5 z-10 flex gap-1">
        <Badge
          variant="secondary"
          className="h-5 bg-background/70 px-2 text-2xs backdrop-blur-sm"
        >
          {headerLabel}
        </Badge>
        {!preset && (
          <Badge variant="secondary" className="h-5 bg-background/70 px-2 text-2xs backdrop-blur-sm">
            #{sensorId}
          </Badge>
        )}
      </div>
    </div>
  );
}
