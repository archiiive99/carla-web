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
  fixed_delta: number;
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

export interface HealthResponse {
  status: string;
  carla_connected: boolean;
  ws_clients: number;
  active_sensors: number;
  default_vehicle_id?: number | null;
  default_camera_id?: number | null;
  session_ready?: boolean;
}
