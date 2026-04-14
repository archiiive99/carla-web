// --- Geometry ---

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Rotation {
  pitch: number;
  yaw: number;
  roll: number;
}

export interface CarlaTransform {
  location: Vector3;
  rotation: Rotation;
}

export interface SpectatorState {
  transform: CarlaTransform;
}

// --- Actors ---

export type ActorType =
  | "vehicle"
  | "walker"
  | "sensor"
  | "traffic_light"
  | "traffic_sign"
  | "other";

export interface CarlaActor {
  id: number;
  type_id: string;
  type: ActorType;
  transform: CarlaTransform;
  velocity: Vector3;
  is_alive: boolean;
  parent_id?: number | null;
  role_name?: string | null;
  /** "Red" | "Yellow" | "Green" | "Off" | "Unknown" — only set for traffic_light actors */
  traffic_light_state?: string | null;
  vehicle_color?: string | null;
  vehicle_driver_id?: string | null;
  vehicle_generation?: string | null;
  vehicle_wheel_count?: number | null;
}

export interface ActorDetail extends CarlaActor {
  control?: VehicleControlState;
}

// --- Vehicle Control ---

export interface VehicleControl {
  throttle: number;
  steer: number;
  brake: number;
  hand_brake: boolean;
  reverse: boolean;
}

export interface VehicleControlState extends VehicleControl {
  gear: number;
}

// --- Weather ---

export interface CarlaWeatherParams {
  cloudiness: number;
  precipitation: number;
  precipitation_deposits: number;
  wind_intensity: number;
  sun_azimuth_angle: number;
  sun_altitude_angle: number;
  fog_density: number;
  fog_distance: number;
  fog_falloff: number;
  wetness: number;
  scattering_intensity: number;
  mie_scattering_scale: number;
  rayleigh_scattering_scale: number;
  dust_storm: number;
}

export type WeatherPreset =
  | "ClearNoon"
  | "CloudyNoon"
  | "WetNoon"
  | "WetCloudyNoon"
  | "MidRainyNoon"
  | "HardRainNoon"
  | "SoftRainNoon"
  | "ClearSunset"
  | "CloudySunset"
  | "WetSunset"
  | "WetCloudySunset"
  | "MidRainSunset"
  | "HardRainSunset"
  | "SoftRainSunset"
  | "ClearNight"
  | "CloudyNight"
  | "WetNight"
  | "WetCloudyNight"
  | "SoftRainNight"
  | "MidRainyNight"
  | "HardRainNight"
  | "DustStorm";

// --- Sensors ---

export enum SensorType {
  CameraRgb = "sensor.camera.rgb",
  CameraDepth = "sensor.camera.depth",
  CameraSemanticSeg = "sensor.camera.semantic_segmentation",
  CameraInstanceSeg = "sensor.camera.instance_segmentation",
  CameraOpticalFlow = "sensor.camera.optical_flow",
  CameraNormals = "sensor.camera.normals",
  CameraDvs = "sensor.camera.dvs",
  LidarRayCast = "sensor.lidar.ray_cast",
  LidarRayCastSemantic = "sensor.lidar.ray_cast_semantic",
  Radar = "sensor.other.radar",
  Imu = "sensor.other.imu",
  Gnss = "sensor.other.gnss",
  Collision = "sensor.other.collision",
  LaneInvasion = "sensor.other.lane_invasion",
  Obstacle = "sensor.other.obstacle",
}

export interface SensorConfig {
  id: number;
  type: string;
  parent_id: number;
  transform: CarlaTransform;
  attributes: Record<string, string | number>;
}

// --- Blueprints ---

export interface BlueprintAttribute {
  id: string;
  type: string;
  value: string;
  recommended_values: string[];
}

export interface Blueprint {
  id: string;
  tags: string[];
  attributes: BlueprintAttribute[];
}

// --- Navigation ---

export interface TopologyEdge {
  start: {
    id: number;
    road_id: number;
    lane_id: number;
    transform: CarlaTransform;
  };
  end: {
    id: number;
    road_id: number;
    lane_id: number;
    transform: CarlaTransform;
  };
}
