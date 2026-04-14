import type { CameraPresetKey } from "@/components/sensors/sensor-camera-presets";

export interface CellState {
  sensorId: number;
  typeId: string;
  preset3d?: CameraPresetKey;
}
