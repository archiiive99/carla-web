import type {
  CarlaActor,
  ActorDetail,
  CarlaTransform,
  SpectatorState,
  CarlaWeatherParams,
  Blueprint,
  SensorConfig,
  VehicleControl,
  TopologyEdge,
  WeatherPreset,
} from "@/types/carla";
import type {
  SimulationStatus,
  SimulationSettings,
  SpawnVehicleRequest,
  SpawnWalkerRequest,
  SpawnSensorRequest,
  ReplayConfig,
  BridgeInfoResponse,
  HealthResponse,
} from "@/types/api";
import { getDefaultBridgeUrl, normalizeBridgeUrl } from "@/lib/bridge-url";
import { BRIDGE_URL_KEY } from "@/constants";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10_000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // FastAPI errors come back as `{"detail": "…"}`. Surface just the message
      // so downstream toasts don't read as raw JSON.
      let message = body || res.statusText;
      if (body) {
        try {
          const parsed = JSON.parse(body) as { detail?: unknown };
          if (typeof parsed.detail === "string") message = parsed.detail;
          else if (Array.isArray(parsed.detail))
            message = (parsed.detail as Array<{ msg?: string }>)
              .map((d) => d.msg ?? JSON.stringify(d))
              .join("; ");
        } catch {
          /* keep raw body */
        }
      }
      throw new ApiError(res.status, message);
    }

    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export class CarlaApi {
  constructor(private readonly baseUrlProvider: string | (() => string)) {}

  private url(path: string): string {
    const baseUrl = typeof this.baseUrlProvider === "function"
      ? this.baseUrlProvider()
      : this.baseUrlProvider;
    return `${normalizeBridgeUrl(baseUrl)}${path}`;
  }

  // --- Health ---

  async getHealth(): Promise<HealthResponse> {
    return request<HealthResponse>(this.url("/health"));
  }

  async getRealtimeSession(): Promise<Pick<BridgeInfoResponse, "default_vehicle_id" | "default_camera_id" | "session_ready">> {
    return request(this.url("/api/realtime/session"));
  }

  // --- Simulation ---

  async getStatus(): Promise<SimulationStatus> {
    return request<SimulationStatus>(this.url("/api/simulation/status"));
  }

  async play(): Promise<void> {
    await request(this.url("/api/simulation/play"), { method: "POST" });
  }

  async pause(): Promise<void> {
    await request(this.url("/api/simulation/pause"), { method: "POST" });
  }

  async step(): Promise<{ frame: number }> {
    return request(this.url("/api/simulation/step"), { method: "POST" });
  }

  async setSettings(settings: SimulationSettings): Promise<void> {
    await request(this.url("/api/simulation/settings"), {
      method: "POST",
      body: JSON.stringify(settings),
    });
  }

  async reload(): Promise<void> {
    await request(this.url("/api/simulation/reload"), { method: "POST" }, 30_000);
  }

  // --- World ---

  async getMaps(): Promise<string[]> {
    const res = await request<{ maps: string[] }>(this.url("/api/world/maps"));
    return res.maps;
  }

  async loadMap(mapName: string): Promise<void> {
    await request(
      this.url("/api/world/load"),
      { method: "POST", body: JSON.stringify({ map_name: mapName }) },
      30_000,
    );
  }

  async getWeather(): Promise<CarlaWeatherParams> {
    return request<CarlaWeatherParams>(this.url("/api/world/weather"));
  }

  async setWeather(params: Partial<CarlaWeatherParams>): Promise<void> {
    await request(this.url("/api/world/weather"), {
      method: "POST",
      body: JSON.stringify({ params }),
    });
  }

  async setWeatherPreset(preset: WeatherPreset): Promise<void> {
    await request(this.url("/api/world/weather"), {
      method: "POST",
      body: JSON.stringify({ preset }),
    });
  }

  async getSpectator(): Promise<SpectatorState> {
    return request<SpectatorState>(this.url("/api/world/spectator"));
  }

  async setSpectator(transform: CarlaTransform): Promise<void> {
    await request(this.url("/api/world/spectator"), {
      method: "POST",
      body: JSON.stringify(transform),
    });
  }

  /** Load or unload a CARLA map layer (Buildings / Decals / Foliage /
   *  Ground / ParkedVehicles / Particles / Props / StreetLights / Walls / All).
   *  Layer names are sent lowercase + snake_case to match the bridge's
   *  carla.MapLayer mapping. */
  async setMapLayer(layer: string, action: "load" | "unload"): Promise<void> {
    await request(this.url(`/api/world/map-layers`), {
      method: "POST",
      body: JSON.stringify({ layer: layer.toLowerCase(), action }),
    });
  }

  async getSpawnPoints(): Promise<CarlaTransform[]> {
    const res = await request<{ spawn_points: CarlaTransform[] }>(
      this.url("/api/world/spawn-points"),
    );
    return res.spawn_points;
  }

  // --- Actors ---

  async getActors(): Promise<CarlaActor[]> {
    const res = await request<{ actors: CarlaActor[]; count: number }>(
      this.url("/api/actors"),
    );
    return res.actors;
  }

  async getActor(id: number): Promise<ActorDetail> {
    return request<ActorDetail>(this.url(`/api/actors/${id}`));
  }

  async spawnVehicle(config: SpawnVehicleRequest): Promise<CarlaActor> {
    return request<CarlaActor>(this.url("/api/actors/spawn/vehicle"), {
      method: "POST",
      body: JSON.stringify(config),
    });
  }

  async spawnWalker(config: SpawnWalkerRequest): Promise<CarlaActor> {
    return request<CarlaActor>(this.url("/api/actors/spawn/walker"), {
      method: "POST",
      body: JSON.stringify(config),
    });
  }

  async spawnSensor(config: SpawnSensorRequest): Promise<SensorConfig> {
    return request<SensorConfig>(this.url("/api/actors/spawn/sensor"), {
      method: "POST",
      body: JSON.stringify(config),
    });
  }

  async getSensorConfig(sensorId: number): Promise<{ id: number; type_id: string; attributes: Record<string, string> }> {
    return request(this.url(`/api/sensors/${sensorId}/config`));
  }

  async destroyActor(id: number): Promise<void> {
    await request(this.url(`/api/actors/${id}`), { method: "DELETE" });
  }

  /** Bridge-side bulk destroy: removes every actor the bridge has spawned
   *  (does not touch built-in traffic lights or externally-spawned actors). */
  async destroyAllActors(): Promise<{ status: string; count: number }> {
    return request(this.url(`/api/actors/all`), { method: "DELETE" });
  }

  async applyControl(id: number, control: VehicleControl): Promise<void> {
    await request(this.url(`/api/actors/${id}/control`), {
      method: "POST",
      body: JSON.stringify(control),
    });
  }

  async applyRealtimeControl(control: VehicleControl): Promise<{ status: string; id: number; managed_ego: boolean }> {
    return request(this.url("/api/realtime/control"), {
      method: "POST",
      body: JSON.stringify(control),
    }, 750);
  }

  async setAutopilot(id: number, enabled: boolean, tmPort = 8000): Promise<void> {
    await request(this.url(`/api/actors/${id}/autopilot`), {
      method: "POST",
      body: JSON.stringify({ enabled, tm_port: tmPort }),
    });
  }

  /** Set the vehicle light state bitmask (carla.VehicleLightState). */
  async setLights(id: number, lightState: number): Promise<void> {
    await request(this.url(`/api/actors/${id}/lights`), {
      method: "POST",
      body: JSON.stringify({ light_state: lightState }),
    });
  }

  // --- Blueprints ---

  async getVehicleBlueprints(): Promise<Blueprint[]> {
    const res = await request<{ blueprints: Blueprint[] }>(
      this.url("/api/blueprints/vehicles"),
    );
    return res.blueprints;
  }

  async getWalkerBlueprints(): Promise<Blueprint[]> {
    const res = await request<{ blueprints: Blueprint[] }>(
      this.url("/api/blueprints/walkers"),
    );
    return res.blueprints;
  }

  // getSensorBlueprints removed — SensorSpawnTab hardcodes the KNOWN-WORKING
  // sensor enum (see components/controls/spawn/SensorSpawnTab.tsx:80-91)
  // rather than dynamic discovery. The bridge endpoint /api/blueprints/sensors
  // still exists; re-add a wrapper here if a future feature needs it.

  // --- Traffic ---

  async setGlobalSpeed(speedDiff: number): Promise<void> {
    await request(this.url("/api/traffic/global-speed"), {
      method: "POST",
      body: JSON.stringify({ speed_diff: speedDiff }),
    });
  }

  /** Set per-vehicle auto-lane-change behavior (TrafficManager). */
  async setVehicleAutoLaneChange(vehicleId: number, enabled: boolean): Promise<void> {
    await request(this.url(`/api/traffic/vehicle/${vehicleId}/lane`), {
      method: "POST",
      body: JSON.stringify({ auto_lane_change: enabled, force_lane_change: false, lane_offset: 0 }),
    });
  }

  // --- Navigation ---

  async getTopology(): Promise<TopologyEdge[]> {
    const res = await request<{ topology: TopologyEdge[] }>(
      this.url("/api/map/topology"),
    );
    return res.topology;
  }

  async getRoadGeometry(distance = 5): Promise<{ x: number; y: number; z: number; yaw: number; road_id: number; lane_id: number; lane_width: number; is_junction: boolean }[]> {
    return request(this.url(`/api/map/road-geometry?distance=${distance}`));
  }

  // --- Recording ---

  async startRecording(filename: string): Promise<void> {
    await request(this.url("/api/recording/start"), {
      method: "POST",
      body: JSON.stringify({ filename }),
    });
  }

  async stopRecording(): Promise<void> {
    await request(this.url("/api/recording/stop"), { method: "POST" });
  }

  async getRecordings(): Promise<string[]> {
    const res = await request<{ recordings: string[] }>(
      this.url("/api/recording/files"),
    );
    return res.recordings;
  }

  async startReplay(config: ReplayConfig): Promise<void> {
    await request(this.url("/api/replay/start"), {
      method: "POST",
      body: JSON.stringify(config),
    });
  }

  async stopReplay(): Promise<void> {
    await request(this.url("/api/replay/stop"), { method: "POST" });
  }
}

function getBridgeUrl(): string {
  if (typeof window !== 'undefined') {
    return normalizeBridgeUrl(localStorage.getItem(BRIDGE_URL_KEY) || getDefaultBridgeUrl());
  }
  return getDefaultBridgeUrl();
}

export const carlaApi = new CarlaApi(getBridgeUrl());
