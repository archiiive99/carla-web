// Camera presets for the multi-view sensor grid (ego-relative offset +
// rotation pairs). Kept separate from the component that consumes them
// (SensorCameraView) because mixing a React component with non-component
// exports (const / type) in a single file invalidates Vite Fast Refresh
// on every edit.

export const CAMERA_PRESETS = {
  front: { offset: { x: 5, y: 0, z: 2 }, rotation: { pitch: -5, yaw: 0 }, label: "Front" },
  rear: { offset: { x: -8, y: 0, z: 3 }, rotation: { pitch: -10, yaw: 180 }, label: "Rear" },
  left: { offset: { x: 0, y: -5, z: 2.5 }, rotation: { pitch: -8, yaw: -90 }, label: "Left" },
  right: { offset: { x: 0, y: 5, z: 2.5 }, rotation: { pitch: -8, yaw: 90 }, label: "Right" },
  birdseye: { offset: { x: 0, y: 0, z: 40 }, rotation: { pitch: -89, yaw: 0 }, label: "Bird's Eye" },
  chase: { offset: { x: -10, y: 0, z: 4 }, rotation: { pitch: -12, yaw: 0 }, label: "Chase" },
} as const;

export type CameraPresetKey = keyof typeof CAMERA_PRESETS;
