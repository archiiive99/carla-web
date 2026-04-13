# CARLA Web Architecture Overview

This document outlines the high-level architecture for the CARLA Web version, defining how the web client communicates with the CARLA simulator and the overall system design.

---

## 1. System Architecture

```
+-------------------+        WebSocket/gRPC        +-------------------+
|                   | <=========================>  |                   |
|   CARLA Web       |                              |   CARLA Server    |
|   (React+Vite)    |        REST API              |   (UE5 Backend)   |
|                   | <=========================>  |                   |
+-------------------+                              +-------------------+
        |                                                   |
        v                                                   v
+-------------------+                              +-------------------+
|   Browser Client  |                              |   Simulation      |
|   - React UI      |                              |   - Physics       |
|   - 3D Viewport   |                              |   - Sensors       |
|   - Sensor Views  |                              |   - Traffic       |
|   - Controls      |                              |   - Weather       |
+-------------------+                              +-------------------+
```

## 2. Communication Layer

### WebSocket (Real-Time Data)
- **Sensor streams**: camera images, LiDAR point clouds, radar data
- **Vehicle telemetry**: position, velocity, acceleration, steering angle
- **Simulation state**: tick count, elapsed time, weather state
- **Traffic updates**: NPC vehicle and pedestrian positions

### REST API (Command & Control)
- **Simulation control**: start, stop, pause, step, set tick rate
- **World configuration**: weather, time of day, map loading
- **Actor management**: spawn, destroy, configure vehicles and sensors
- **Scenario management**: load, save, execute predefined scenarios

### Data Format
- Sensor images: compressed JPEG/WebP for camera, binary for LiDAR
- Telemetry: JSON or MessagePack for structured data
- Large datasets: binary protocol with schema headers

---

## 3. Frontend Architecture

### Page Structure

```
/                           # Dashboard - simulation overview
/simulation                 # Main simulation view with 3D viewport
/simulation/sensors         # Sensor configuration and monitoring
/simulation/vehicles        # Vehicle spawning and management
/simulation/scenarios       # Scenario editor and runner
/settings                   # Application and connection settings
/docs                       # Embedded documentation viewer
```

### Framework
- **Vite + React 19 + TypeScript** (pure client-side SPA, no SSR)
- **NOT Next.js** — this is a real-time simulation dashboard, not a content website

### Core Components

#### Simulation Viewport
- WebGL-based 3D rendering (Three.js or Babylon.js)
- Camera controls: orbit, follow vehicle, free camera
- Overlay HUD: speed, position, simulation time
- Mini-map with actor positions

#### Sensor Panel
- Multi-view layout for simultaneous sensor feeds
- Supported sensors:
  - RGB Camera (streaming JPEG/WebP)
  - Depth Camera (color-mapped visualization)
  - Semantic Segmentation (labeled overlay)
  - LiDAR (WebGL point cloud renderer)
  - Radar (range-doppler plot)
  - IMU (real-time graphs)
  - GNSS (map pin)

#### Control Panel
- Play/Pause/Step controls
- Simulation speed slider
- Weather controls (presets + fine-grained)
- Time of day slider
- Vehicle spawn controls

#### Scenario Editor
- Visual route planner on map
- Waypoint placement and configuration
- Trigger zone definition
- Event scripting (simplified visual scripting or YAML editor)

---

## 4. State Management

### Global State (Zustand)

```typescript
interface SimulationStore {
  // Connection
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  serverUrl: string;

  // Simulation
  isRunning: boolean;
  isPaused: boolean;
  tickRate: number;
  elapsedTime: number;
  currentTick: number;

  // World
  currentMap: string;
  weather: WeatherParams;
  timeOfDay: number;

  // Actors
  vehicles: Vehicle[];
  sensors: Sensor[];
  pedestrians: Pedestrian[];

  // Selected
  selectedActorId: string | null;

  // Actions
  connect: (url: string) => Promise<void>;
  disconnect: () => void;
  toggleSimulation: () => void;
  spawnVehicle: (config: VehicleConfig) => Promise<Vehicle>;
  attachSensor: (vehicleId: string, sensorConfig: SensorConfig) => Promise<Sensor>;
}
```

### Sensor Data State (separate store for performance)

```typescript
interface SensorDataStore {
  // Keyed by sensor ID
  frames: Record<string, SensorFrame>;
  subscriptions: Record<string, boolean>;

  subscribe: (sensorId: string) => void;
  unsubscribe: (sensorId: string) => void;
}
```

---

## 5. Performance Strategies

### Rendering
- Use `requestAnimationFrame` for viewport updates
- Offload LiDAR point cloud processing to Web Workers
- Use OffscreenCanvas for sensor image processing where supported
- Implement LOD (Level of Detail) for point cloud visualization

### Data Transfer
- Compress sensor images server-side before streaming
- Use binary WebSocket frames for sensor data (avoid JSON serialization overhead)
- Implement adaptive quality: reduce resolution/framerate when client is under load
- Client-side frame dropping when behind real-time

### React Optimization
- Sensor feed components use `React.memo` with custom comparison
- Telemetry values use `useRef` for values that change every frame
- Heavy computations (coordinate transforms, data aggregation) in `useMemo`
- Debounce user inputs that trigger server commands

---

## 6. Error Handling and Resilience

### Connection Management
- Auto-reconnect with exponential backoff on WebSocket disconnection
- Queue commands during brief disconnections, replay on reconnect
- Clear visual indicator of connection state at all times
- Graceful degradation: show last known state when disconnected

### Data Integrity
- Sequence numbers on streamed data to detect drops
- Timestamp validation to discard stale data
- Schema validation on API responses at the boundary

---

## 7. Security Considerations

- WebSocket connections should use WSS (TLS) in production
- API endpoints should validate all user inputs
- No direct shell command execution from the web client
- Rate limiting on command endpoints to prevent simulation abuse
- CORS configuration to restrict allowed origins
