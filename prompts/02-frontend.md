# carla-web — Frontend Deep Dive

## Tech Stack
- React 19 + TypeScript 5.9
- Vite (dev server, port 58336)
- Three.js + React-Three-Fiber (3D rendering)
- Zustand (state management)
- Tailwind CSS v4 + shadcn/ui
- Recharts (data visualization)
- Web Workers (offload binary processing)

## Entry Point

`src/main.tsx` → `src/App.tsx`

App.tsx sets up routing (SimulationPage, SettingsPage) and context providers.

---

## WebSocket Connection

### Worker Architecture
The frontend uses a dedicated Web Worker for WebSocket communication to avoid blocking the main thread:

```
Main Thread                         ws-receiver.worker.ts
    │                                      │
    ├─ postMessage({type:"connect"}) ────► │
    │                                      ├─ new WebSocket("ws://localhost:58337/ws")
    │                                      ├─ ws.onmessage → parseFrame()
    │                                      │   ├─ Camera → createImageBitmap() → postMessage
    │                                      │   ├─ LiDAR → process points → postMessage
    │                                      │   └─ WorldTick → postMessage
    │ ◄──── postMessage({type:"camera"}) ──┤
    │                                      │
    ├─ postMessage({type:"subscribe"}) ──► │ → ws.send(encodeSubscribe(sensorId))
```

### Binary Frame Parser: `src/lib/ws-protocol.ts`

Mirrors the backend protocol exactly:

```typescript
parseFrame(buffer: ArrayBuffer): ParsedFrame | null
  1. Read channel (1 byte, offset 0)
  2. Read length (4 bytes LE, offset 1)
  3. Slice payload from offset 5
  4. Switch on channel → type-specific parser
```

### Channel IDs: `src/types/ws.ts`

```typescript
enum ChannelId {
  Camera = 0x01,        Depth = 0x02,
  Segmentation = 0x03,  Lidar = 0x04,
  SemanticLidar = 0x05, Radar = 0x06,
  Imu = 0x07,           Gnss = 0x08,
  Collision = 0x09,     LaneInvasion = 0x0A,
  Dvs = 0x0B,           WorldTick = 0x10,
  Telemetry = 0x11,     Subscribe = 0xF0,
  Unsubscribe = 0xF1,   ClientStats = 0xFE,
  Control = 0xFF,
}
```

**MUST match backend `ws/channels.py` exactly.**

---

## Web Workers

### `ws-receiver.worker.ts`
- Owns the WebSocket connection
- Parses incoming binary frames
- For camera frames: decodes JPEG to ImageBitmap via `createImageBitmap(new Blob([data]))`
- Posts decoded results back to main thread

### `image-decoder.worker.ts`
- Secondary image processing (depth colormap, segmentation overlay)
- Canvas-based decoding if needed

### `lidar-processor.worker.ts`
- Converts raw point cloud bytes to Float32Array positions + colors
- LiDAR: 4 floats per point (x, y, z, intensity)
- Semantic LiDAR: 6 floats per point (x, y, z, cos_angle, obj_index, semantic_tag)

### `telemetry-aggregator.worker.ts`
- Aggregates performance metrics (FPS, latency)

---

## Zustand Stores

### `simulationStore.ts`
```typescript
{
  connected: boolean,       // CARLA connection status
  playing: boolean,         // simulation running
  map: string,              // current map name
  weather: WeatherParams,   // weather settings
  fps: number,              // simulation FPS
}
```

### `actorStore.ts`
```typescript
{
  actors: Map<number, ActorInfo>,     // all actors by ID
  egoVehicleId: number | null,        // default ego vehicle
  selectedActorId: number | null,     // UI selection
}
```

### `sensorStore.ts`
```typescript
{
  sensors: Map<number, SensorInfo>,
  activeSensorId: number | null,
  latestFrames: Map<number, CameraFrame>,  // latest frame per sensor
}
```

### `performanceStore.ts`
- FPS tracking, latency, frame drop counts

### `uiStore.ts`
- Panel visibility, layout preferences, theme

---

## Component Structure

### `components/sensors/`
- Camera view (renders ImageBitmap to <canvas>)
- Depth view (colorized depth map)
- Segmentation view (palette-colored)
- LiDAR view (Three.js point cloud)
- Radar view
- IMU/GNSS data displays

### `components/viewport/`
- Three.js 3D scene with actor positions
- Camera controls (orbit, follow vehicle)
- Grid/ground plane

### `components/actors/`
- Actor list panel
- Vehicle control inputs
- Traffic manager panel

### `components/controls/`
- Simulation play/pause/step
- Weather controls
- Map selector

### `components/layout/`
- Main layout with resizable panels
- Header, sidebar, status bar

---

## Camera Frame Rendering Flow

```
1. ws-receiver.worker receives binary frame
2. parseFrame() → CameraFrame { sensorId, width, height, data: ArrayBuffer }
3. new Blob([data], {type: "image/jpeg"})
4. createImageBitmap(blob)
5. postMessage({type: "camera", bitmap}, [bitmap])  // transfer ownership
6. Main thread receives ImageBitmap
7. Canvas 2D context: ctx.drawImage(bitmap, 0, 0)
8. bitmap.close()  // release memory
```

---

## Vite Configuration

Key settings in `vite.config.ts`:
- `server.port: 58336`
- `server.host: "0.0.0.0"`
- COOP/COEP headers for SharedArrayBuffer (needed by Web Workers):
  ```
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  ```
- Path alias: `@/` → `src/`

---

## REST API Client: `src/lib/carla-api.ts`

Wraps all bridge REST endpoints:
```typescript
const api = new CarlaApi("http://localhost:58337");
await api.getSimulationStatus();
await api.playSimulation();
await api.pauseSimulation();
await api.spawnActor(blueprint, transform);
await api.setWeather(params);
await api.getActors();
// etc.
```
