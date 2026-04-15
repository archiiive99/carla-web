import type { CarlaTransform } from "./carla";

// --- Simulation ---

export interface SimulationStatus {
  connected: boolean;
  running: boolean;
  paused: boolean;
  tick: number;
  elapsed_time: number;
  map: string;
  sync_mode: boolean;
  // Matches the bridge schema (models/schemas.py): float | None.
  // Can legitimately be null if CARLA runs in async mode without a
  // fixed step. No frontend code reads this today, but typing it
  // accurately keeps future consumers from assuming `number`.
  fixed_delta: number | null;
  server_version: string;
}

export interface SimulationSettings {
  sync_mode?: boolean;
  fixed_delta?: number;
  no_rendering?: boolean;
  substepping?: boolean;
  max_substep_delta?: number;
  max_substeps?: number;
}

// --- Spawn requests ---

export interface SpawnVehicleRequest {
  blueprint: string;
  transform: CarlaTransform;
  autopilot?: boolean;
}

export interface SpawnWalkerRequest {
  blueprint: string;
  transform: CarlaTransform;
}

export interface SpawnSensorRequest {
  type: string;
  transform: CarlaTransform;
  parent_id: number;
  attributes: Record<string, string | number>;
}

// --- Recording ---

export interface ReplayConfig {
  filename: string;
  start_time?: number;
  duration?: number;
  camera_id?: number;
}

// --- Health / bridge info ---

/** Shape of GET /health. Mirrors the bridge's realtime_session.snapshot()
 *  spread into the top-level response in main.py health_check(). */
export interface HealthResponse {
  status: string;
  carla_connected: boolean;
  ws_clients: number;
  active_sensors: number;
  // Spread from realtime_session.snapshot() — keep in sync with
  // carla-web-bridge/src/realtime_session.py::snapshot() keys.
  default_vehicle_id?: number | null;
  default_camera_id?: number | null;
  session_armed?: boolean;
  camera_arm_ready?: boolean;
  session_ready?: boolean;
  state?:
    | "IDLE"
    | "ARMING"
    | "VEHICLE_PENDING"
    | "CAMERA_PENDING"
    | "READY"
    | "RECOVERING";
}
