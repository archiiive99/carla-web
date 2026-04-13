# Prompt 04 — WebSocket Client, Zustand Stores & Data Pipeline

## Context

The CARLA Web frontend layout (Prompt 02) and backend bridge (Prompt 03) are built. Now connect them with a real-time data pipeline.

Read before starting:
- `Docs/agents/carla_web_implementation_prompt.md` — WebSocket protocol, Zustand store design, Web Worker architecture
- `Docs/agents/shadcn_component_mapping.md` — For any UI components needed

Reference the shadcn/ui source at `ui/apps/v4/registry/new-york-v4/ui/` for component APIs.

---

## Task

Build the complete real-time data pipeline: WebSocket client, Web Workers, Zustand stores, and typed API client.

### 1. TypeScript Types (`src/types/`)

**`src/types/carla.ts`:**
Define all CARLA domain types matching the backend API responses:
- `CarlaTransform` (location x/y/z, rotation pitch/yaw/roll)
- `CarlaActor` (id, type_id, semantic_tags, transform, velocity, angular_velocity, acceleration, bounding_box, actor_state)
- `VehicleControl` (throttle, steer, brake, hand_brake, reverse, manual_gear_shift, gear)
- `CarlaWeatherParams` (all 15+ float parameters)
- `WeatherPreset` (union of 22 preset names)
- `SensorConfig` (id, type, parent_id, transform, attributes)
- `SensorType` enum (all 19 sensor types with their string IDs like `"sensor.camera.rgb"`)
- `TrafficManagerSettings` (global and per-vehicle settings)
- `Blueprint` (id, tags, attributes with allowed values)

**`src/types/ws.ts`:**
- `ChannelId` enum (0x01 through 0xFF with names)
- `CameraFrame` (sensor_id, width, height, frame, timestamp, data: ArrayBuffer)
- `LidarFrame` (sensor_id, point_count, frame, timestamp, positions: Float32Array, intensities: Float32Array)
- `RadarFrame`, `ImuFrame`, `GnssFrame`, `CollisionEvent`, `LaneInvasionEvent`, `DvsFrame`
- `WorldTick` (frame, timestamp, actors: ActorTransform[])
- `ClientStats` (fps, processing_ms, dropped_frames)

**`src/types/api.ts`:**
- Request/response types for every REST API endpoint
- `SimulationStatus`, `SpawnVehicleRequest`, `SpawnSensorRequest`, `WeatherUpdateRequest`, etc.

### 2. REST API Client (`src/lib/carla-api.ts`)

Typed wrapper around `fetch` for all REST endpoints:

```typescript
class CarlaApi {
  constructor(private baseUrl: string) {}

  // Simulation
  async getStatus(): Promise<SimulationStatus> { ... }
  async play(): Promise<void> { ... }
  async pause(): Promise<void> { ... }
  async step(): Promise<void> { ... }
  async setSettings(settings: SimulationSettings): Promise<void> { ... }

  // World
  async getMaps(): Promise<string[]> { ... }
  async loadMap(name: string): Promise<void> { ... }
  async getWeather(): Promise<CarlaWeatherParams> { ... }
  async setWeather(params: Partial<CarlaWeatherParams>): Promise<void> { ... }
  async setWeatherPreset(preset: WeatherPreset): Promise<void> { ... }
  async getSpawnPoints(): Promise<CarlaTransform[]> { ... }

  // Actors
  async getActors(): Promise<CarlaActor[]> { ... }
  async getActor(id: number): Promise<CarlaActor> { ... }
  async spawnVehicle(config: SpawnVehicleRequest): Promise<CarlaActor> { ... }
  async spawnWalker(config: SpawnWalkerRequest): Promise<CarlaActor> { ... }
  async spawnSensor(config: SpawnSensorRequest): Promise<SensorConfig> { ... }
  async destroyActor(id: number): Promise<void> { ... }
  async applyControl(id: number, control: VehicleControl): Promise<void> { ... }
  async setAutopilot(id: number, enabled: boolean): Promise<void> { ... }

  // Blueprints
  async getVehicleBlueprints(): Promise<Blueprint[]> { ... }
  async getWalkerBlueprints(): Promise<Blueprint[]> { ... }
  async getSensorBlueprints(): Promise<Blueprint[]> { ... }

  // Traffic Manager
  async setGlobalSpeed(diff: number): Promise<void> { ... }
  async setVehicleSpeed(id: number, diff: number): Promise<void> { ... }

  // Navigation
  async getRoute(origin: CarlaTransform, dest: CarlaTransform): Promise<Waypoint[]> { ... }
  async getTopology(): Promise<RoadTopology> { ... }

  // Recording
  async startRecording(filename: string): Promise<void> { ... }
  async stopRecording(): Promise<void> { ... }
  async getRecordings(): Promise<string[]> { ... }
  async startReplay(config: ReplayConfig): Promise<void> { ... }
}
```

- Use `fetch` with proper error handling (throw typed errors)
- Support abort signals for cancellation
- Include request timeout (10s default, 30s for map loading)

### 3. WebSocket Protocol Parser (`src/lib/ws-protocol.ts`)

Binary protocol parser matching the bridge's format:

```typescript
// Parse incoming binary WebSocket frame
function parseFrame(buffer: ArrayBuffer): ParsedFrame {
  const view = new DataView(buffer)
  const channel = view.getUint8(0)
  const length = view.getUint32(1, true) // little-endian
  const payload = buffer.slice(5, 5 + length)

  switch (channel) {
    case ChannelId.Camera:
      return parseCameraFrame(payload)
    case ChannelId.Lidar:
      return parseLidarFrame(payload)
    // ... all channels
  }
}

// Encode outgoing control messages
function encodeSubscribe(sensorId: number): ArrayBuffer { ... }
function encodeUnsubscribe(sensorId: number): ArrayBuffer { ... }
function encodeClientStats(stats: ClientStats): ArrayBuffer { ... }
```

This parser runs in the Web Worker — it must use only `ArrayBuffer`, `DataView`, and `TypedArray`. No JSON parsing for sensor data.

### 4. Web Workers

**`src/workers/ws-receiver.worker.ts`:**
- Opens and manages the WebSocket connection
- Receives binary frames, parses the channel header
- Routes payloads to appropriate processing workers via `MessagePort`
- Handles reconnection with exponential backoff
- Reports connection status back to main thread
- Sends client stats (0xFE) every second

**`src/workers/image-decoder.worker.ts`:**
- Receives JPEG/WebP `ArrayBuffer` from ws-receiver
- Decodes to `ImageBitmap` using `createImageBitmap(new Blob([data], {type: 'image/jpeg'}))`
- Transfers `ImageBitmap` back to main thread (zero-copy Transferable)
- Tracks decode time for performance monitoring

**`src/workers/lidar-processor.worker.ts`:**
- Receives raw Float32Array point cloud data
- Applies point budget (downsample if > 200K points using stride)
- Computes per-point colors (height-based or intensity-based coloring)
- Outputs: `Float32Array` positions + `Float32Array` colors
- Transfers both arrays back to main thread (Transferable)

**`src/workers/telemetry-aggregator.worker.ts`:**
- Receives world tick data (all actor transforms)
- Batches updates and emits to main thread at 10Hz (not every tick)
- Computes derived values: speed (from velocity vector magnitude), heading (from rotation)
- Outputs: `Map<actorId, {transform, velocity, speed, heading}>`

Worker communication pattern:
```
Main Thread                    Workers
    │                             │
    ├── new Worker("ws-receiver") │
    │       │                     │
    │       ├── MessagePort ──────┤── image-decoder
    │       ├── MessagePort ──────┤── lidar-processor
    │       └── MessagePort ──────┤── telemetry-aggregator
    │                             │
    │◄── {type: "connected"} ─────┤  (status updates)
    │◄── {type: "camera", bitmap} ┤  (decoded images)
    │◄── {type: "lidar", pos, col}┤  (processed points)
    │◄── {type: "tick", actors} ──┤  (batched transforms)
```

### 5. WebSocket Hook (`src/hooks/useWebSocket.ts`)

```typescript
function useWebSocket(bridgeUrl: string) {
  // Manages the ws-receiver worker lifecycle
  // Returns: { status, subscribe, unsubscribe, sendControl }
  // Status: 'disconnected' | 'connecting' | 'connected' | 'error'
  // subscribe(sensorId): sends subscribe message to worker
  // unsubscribe(sensorId): sends unsubscribe message
  // Automatically starts/stops workers on mount/unmount
  // Exposes MessagePorts for sensor rendering components to connect to
}
```

### 6. Sensor Data Hook (`src/hooks/useSensorData.ts`)

```typescript
function useSensorData(sensorId: number, type: SensorType) {
  // Connects to the appropriate worker's MessagePort
  // For cameras: returns { canvasRef, fps, resolution }
  //   - Internally draws ImageBitmap to canvas via OffscreenCanvas or 2D context
  // For LiDAR: returns { positions, colors, pointCount }
  //   - Returns Float32Arrays for Three.js consumption
  // For IMU: returns { accelerometer, gyroscope, compass }
  //   - Buffers last N samples for chart display
  // For GNSS: returns { latitude, longitude, altitude }
  // Does NOT store data in React state — uses refs and direct canvas/GL updates
}
```

### 7. Zustand Stores

**`src/stores/simulationStore.ts`:**
```typescript
interface SimulationState {
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
  serverUrl: string
  bridgeUrl: string
  isRunning: boolean
  isPaused: boolean
  syncMode: boolean
  currentTick: number
  elapsedTime: number
  fixedDeltaSeconds: number
  currentMap: string
  weather: CarlaWeatherParams

  connect: (bridgeUrl: string) => Promise<void>
  disconnect: () => void
  play: () => Promise<void>
  pause: () => Promise<void>
  step: () => Promise<void>
  setWeather: (params: Partial<CarlaWeatherParams>) => Promise<void>
  setWeatherPreset: (preset: WeatherPreset) => Promise<void>
  loadMap: (name: string) => Promise<void>
  updateFromTick: (tick: number, time: number) => void  // called from worker
}
```

**`src/stores/actorStore.ts`:**
```typescript
interface ActorState {
  actors: Map<number, CarlaActor>
  selectedActorId: number | null
  actorsByType: {
    vehicles: number[]
    walkers: number[]
    sensors: number[]
    trafficLights: number[]
    other: number[]
  }

  selectActor: (id: number | null) => void
  updateActorTransforms: (batch: ActorTransformBatch) => void  // from worker at 10Hz
  spawnVehicle: (config: SpawnVehicleRequest) => Promise<CarlaActor>
  spawnWalker: (config: SpawnWalkerRequest) => Promise<CarlaActor>
  destroyActor: (id: number) => Promise<void>
  applyControl: (id: number, control: VehicleControl) => Promise<void>
  setAutopilot: (id: number, enabled: boolean) => Promise<void>
  refreshActors: () => Promise<void>  // full refresh from REST API
}
```

**`src/stores/sensorStore.ts`:**
```typescript
interface SensorState {
  sensors: Map<number, SensorConfig>
  subscriptions: Set<number>

  subscribe: (sensorId: number) => void
  unsubscribe: (sensorId: number) => void
  spawnSensor: (config: SpawnSensorRequest) => Promise<SensorConfig>
  destroySensor: (sensorId: number) => Promise<void>
  updateConfig: (sensorId: number, attrs: Record<string, any>) => Promise<void>
  refreshSensors: () => Promise<void>
}
// CRITICAL: Sensor FRAME DATA never enters this store. Only metadata/config.
```

**`src/stores/uiStore.ts`:**
```typescript
interface UIState {
  leftPanelOpen: boolean
  rightPanelOpen: boolean
  bottomPanelOpen: boolean
  bottomPanelTab: 'sensors' | 'telemetry' | 'events'
  sensorGridLayout: string[][]  // sensor IDs in grid positions
  theme: 'dark' | 'light'

  toggleLeftPanel: () => void
  toggleRightPanel: () => void
  toggleBottomPanel: () => void
  setBottomTab: (tab: string) => void
  setSensorGridLayout: (layout: string[][]) => void
}
```

**`src/stores/performanceStore.ts`:**
```typescript
interface PerformanceState {
  fps: number
  latency: number            // ms
  bandwidth: number          // bytes/s
  droppedFrames: number
  workerUtilization: Record<string, number>  // worker name → processing ms

  update: (metrics: Partial<PerformanceState>) => void
}
```

### 8. Performance Monitor Hook (`src/hooks/usePerformanceMonitor.ts`)

- Track FPS via `requestAnimationFrame` delta
- Track bandwidth by summing WebSocket message sizes per second
- Track latency from world tick timestamp vs client receive time
- Track dropped frames from worker reports
- Update `performanceStore` at 1Hz (once per second)
- Report stats back to bridge via WebSocket (channel 0xFE) every second

### 9. Connect Everything

Update the existing layout components to use the stores:
- `TopBar`: show real `connectionStatus` from simulationStore, real tick/time
- `StatusBar`: show real FPS, latency, bandwidth from performanceStore
- `LeftPanel`: populate actor list from actorStore (still with mock data until backend is connected, but wired up)

### 10. Quality Checklist

- [ ] All TypeScript types compile without errors
- [ ] REST API client has typed methods for every endpoint
- [ ] WebSocket binary protocol parser handles all channel types
- [ ] Web Workers initialize and communicate via MessagePorts
- [ ] Zustand stores update correctly from worker messages
- [ ] Sensor frame data NEVER flows through React state or Zustand
- [ ] Performance monitor tracks FPS, latency, bandwidth
- [ ] `npm run build` passes with zero errors
- [ ] Workers are code-split (not in main bundle)
