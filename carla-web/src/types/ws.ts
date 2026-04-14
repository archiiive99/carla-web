// --- Worker messaging ---

export type WorkerStatus = "disconnected" | "connecting" | "connected" | "error";

export interface ActorTransform {
  id: number;
  position: { x: number; y: number; z: number };
  rotation: { pitch: number; yaw: number; roll: number };
  velocity: { x: number; y: number; z: number };
}
