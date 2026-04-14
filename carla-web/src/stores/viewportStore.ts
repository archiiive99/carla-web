import { create } from "zustand";
import type { RefObject } from "react";
import * as THREE from "three";
import type { CameraPresetKey } from "@/components/sensors/sensor-camera-presets";

// Single Three.js scene, many camera viewports. Every visible 3D rect in the
// app — the main viewport, every sensor-cell RGB camera, preset chase/front/
// birdseye previews — is a rect-tracking entry here. A compositor under the
// root <Canvas> reads these entries each frame and draws the shared scene
// once per rect with gl.setViewport + gl.setScissor. No per-cell scenes.

export type ViewportKind =
  | { type: "main" }
  | { type: "sensor-preset"; preset: CameraPresetKey }
  // sensor-extrinsic: camera is parented to a CARLA sensor actor's transform.
  // The compositor uses the sensor's fov attribute and the parent actor's
  // position so pixels match the CARLA sensor pose within the shared scene.
  | { type: "sensor-extrinsic"; sensorId: number };

export interface ViewportEntry {
  id: string;
  divRef: RefObject<HTMLDivElement | null>;
  camera: THREE.PerspectiveCamera;
  kind: ViewportKind;
}

interface ViewportState {
  viewports: Map<string, ViewportEntry>;
  register: (entry: ViewportEntry) => void;
  unregister: (id: string) => void;
  updateKind: (id: string, kind: ViewportKind) => void;
}

export const useViewportStore = create<ViewportState>((set) => ({
  viewports: new Map(),
  register: (entry) =>
    set((s) => {
      const next = new Map(s.viewports);
      next.set(entry.id, entry);
      return { viewports: next };
    }),
  unregister: (id) =>
    set((s) => {
      if (!s.viewports.has(id)) return s;
      const next = new Map(s.viewports);
      next.delete(id);
      return { viewports: next };
    }),
  updateKind: (id, kind) =>
    set((s) => {
      const existing = s.viewports.get(id);
      if (!existing) return s;
      const next = new Map(s.viewports);
      next.set(id, { ...existing, kind });
      return { viewports: next };
    }),
}));
