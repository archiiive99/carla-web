# CARLA Web Version — Full Implementation Prompt

> This is a comprehensive, self-contained prompt for an AI coding agent to build the CARLA Simulator Web Version from scratch. It covers every layer of the stack: backend bridge, frontend application, real-time data pipeline, and all utility features.

---

## Prompt

You are building **CARLA Web** — a full-featured web-based interface for the CARLA autonomous driving simulator. The goal is to provide a browser-based experience that faithfully reproduces the CARLA simulation with **identical rendering quality** to the native UE5 client, while exposing **every CARLA feature** through an intuitive, high-performance web UI.

---

### PROJECT OVERVIEW

**What CARLA is:** CARLA is an open-source autonomous driving simulator built on Unreal Engine 5. It provides physically accurate vehicle simulation, a comprehensive sensor suite (19+ sensor types), traffic management, weather control, and scenario execution. The simulator runs as a server that clients connect to via RPC (port 2000) and a TCP streaming protocol (port 2001).

**What you are building:** A web application that acts as a remote client to a running CARLA server. The backend bridge connects to CARLA's native API and translates data into web-friendly formats. The frontend displays real-time simulation data and provides controls for every CARLA feature.

**Architecture summary:**
```
UE5 CARLA Server (GPU machine)
  ├── Pixel Streaming (WebRTC) ──────────→ Browser: Main 3D viewport <video>
  ├── TCP Sensor Streaming (port 2001) ──→ Bridge: Python middleware
  └── RPC Commands (port 2000) ──────────→ Bridge: Python middleware
                                               │
                                               ├── WebSocket ──→ Browser: Sensor feeds, telemetry
                                               └── REST API ──→ Browser: Commands, configuration

Browser (React + shadcn/ui)
  ├── Main Viewport (Pixel Streaming video overlay with React UI)
  ├── Sensor Panel (multi-view: cameras, LiDAR, radar, charts)
  ├── Control Panel (simulation, weather, traffic, scenarios)
  └── Actor Manager (spawn, configure, monitor vehicles/sensors)
```

---

### CRITICAL REQUIREMENTS

#### 1. Performance & Speed Optimization (NON-NEGOTIABLE)

This is a real-time simulation interface. Every architectural and implementation decision must prioritize performance. Specifically:

**Data Pipeline:**
- All sensor data (camera images, LiDAR point clouds, radar detections) MUST be processed in **Web Workers** — never on the main thread.
- Camera frames MUST be compressed server-side to **JPEG (quality 75-85) or WebP** before WebSocket transmission. Raw pixel transfer is unacceptable.
- LiDAR point clouds MUST use **binary ArrayBuffer** transmission with Float32Array typed views. Never serialize point clouds as JSON.
- Use **SharedArrayBuffer + Atomics** for zero-copy data transfer between the WebSocket receiver worker and rendering workers where browser support allows.
- WebSocket connections MUST use **binary frame mode** for all sensor data. Reserve text frames only for small JSON control messages.
- Implement **adaptive quality control**: the bridge should monitor client-reported frame processing time and automatically reduce resolution/FPS when the client is saturated.
- Implement **backpressure handling**: if the client cannot consume data fast enough, drop frames on the server side rather than letting the buffer grow unbounded.

**Frontend Rendering:**
- The main viewport (Pixel Streaming) renders in a `<video>` element — this is hardware-accelerated by default. React UI overlays must use `pointer-events: none` where appropriate to avoid blocking video interaction.
- LiDAR point cloud visualization MUST use **Three.js** with `BufferGeometry` and `Points` — never create individual mesh objects per point. Use a fixed **point budget** (default 200K points max) and downsample if the source exceeds it.
- Implement **object pooling** for all Three.js geometries, materials, and textures. Never allocate new GPU resources per frame.
- Use **OffscreenCanvas** for sensor image rendering (camera feeds) to keep image decoding off the main thread.
- All sensor display components must use `React.memo` with shallow comparison. High-frequency numeric displays (speed, coordinates) must use `useRef` + direct DOM mutation, not React state updates.
- **requestAnimationFrame** must gate all visual updates. Never use `setInterval` or `setTimeout` for rendering loops.
- Implement **virtualized scrolling** (e.g., `@tanstack/react-virtual`) for any list that could exceed 50 items (actor list, event log, waypoint list).
- Code-split all heavy dependencies: Three.js, chart libraries, and map components must be dynamically imported with `React.lazy` + `Suspense`.

**Network:**
- Target **<100ms end-to-end latency** for the primary camera feed (server render → client display).
- Implement WebSocket **auto-reconnect** with exponential backoff (initial 1s, max 30s, jitter).
- Use a single multiplexed WebSocket connection with a topic/channel header byte to distinguish sensor streams, telemetry, and control messages. Do not open a separate WebSocket per sensor.
- Implement **client-side frame dropping**: if a new frame arrives before the previous one is rendered, skip the previous one.

**Build & Bundle:**
- Enable **tree-shaking** and ensure no unused Three.js modules are bundled.
- Use **React.lazy + Suspense** for heavy components to reduce initial bundle size.
- Target **<200KB** initial JavaScript bundle (gzipped) for the shell; lazy-load everything else.
- Image assets use standard `<img>` tags. Vite handles asset optimization at build time.

#### 2. Identical Rendering Quality

The main 3D viewport MUST display exactly what UE5 renders — including Lumen global illumination, Nanite geometry, ray-traced shadows/reflections (if enabled), dynamic weather effects, and all post-processing. This is achieved through **UE5 Pixel Streaming**, not WebGL reconstruction.

- Enable the `PixelStreamingPlugin` in the CARLA UE5 project.
- Configure the Pixel Streaming signaling server (Node.js, included with UE5).
- The frontend embeds the Pixel Streaming client library and renders the WebRTC stream in a `<video>` element.
- Overlay transparent React UI panels on top of the video stream.
- Forward mouse/keyboard input through Pixel Streaming for spectator camera control.

#### 3. UI/UX Design Quality

The interface must feel like a professional simulation control center — clean, information-dense but not cluttered, with clear visual hierarchy and smooth interactions.

**IMPORTANT — shadcn/ui Reference Repository:**
The complete shadcn/ui v4 source repository is available locally at `ui/` (root of this project). This is the official shadcn GitHub repo containing:
- `ui/apps/v4/registry/new-york-v4/ui/` — 57 base UI component source files (Button, Card, Dialog, Sidebar, Chart, Resizable, etc.)
- `ui/apps/v4/registry/new-york-v4/blocks/` — 28 pre-built block templates (dashboards, sidebars, login forms)
- `ui/apps/v4/registry/new-york-v4/examples/` — 1,087 example implementations showing every component variant
- `ui/apps/v4/registry/themes.ts` — 24 color theme definitions in OKLch format
- `ui/apps/v4/registry/styles/` — 5 style variants (vega, nova, lyra, maia, mira)
- `ui/apps/v4/registry/base-colors.ts` — 7 base color palettes (neutral, stone, zinc, mauve, olive, mist, taupe)
- `ui/templates/next-app/` — Next.js starter template

**You MUST reference this local repository** when implementing components. Read the actual component source code in `ui/apps/v4/registry/new-york-v4/ui/` to understand the API, props, and sub-components before using them. Consult `ui/apps/v4/registry/new-york-v4/examples/` for usage patterns. See `Docs/agents/shadcn_component_mapping.md` for the complete mapping of every CARLA Web UI element to specific shadcn components.

**Design System:**
- Use **shadcn/ui v4 (new-york style)** components as the foundation. Every UI primitive (buttons, dialogs, dropdowns, tabs, sliders, forms, tables, sidebars, charts) MUST come from shadcn — do not reinvent any component that shadcn already provides.
- **Style variant: `vega`** — clean and modern, ideal for data-dense dashboards.
- **Base color: `zinc`** — neutral, professional, dark mode default. Color palette uses OKLch color space via CSS variables from `ui/apps/v4/registry/themes.ts`.
- **Primary accent: `blue`** for interactive elements and selected states. **Destructive: `red`** for errors and dangerous actions. **Status colors:** green (connected/running), yellow (loading/syncing), red (error/disconnected).
- **Chart colors:** Use `--chart-1` through `--chart-5` CSS variables for all data visualizations. Charts use shadcn's `Chart` component (`ui/chart.tsx`) which wraps Recharts with theme-aware styling.
- Typography: **Inter** or **Geist** font. Maximum 4 font size levels: `text-sm` (body/labels), `text-base` (section content), `text-lg` (section headers), `text-xl` (page titles only). Use `font-mono` for numeric readouts (telemetry, coordinates, FPS).
- Spacing: strictly use Tailwind's spacing scale (multiples of 4px). Consistent `gap-2` or `gap-3` in flex/grid layouts.
- Borders: subtle `border-border` (1px) for panel separation. Use `rounded-lg` consistently.
- Shadows: minimal — only for floating panels and dropdowns.
- Transitions: `transition-colors duration-150` on interactive elements. No gratuitous animations.
- **Icons: Lucide React** (`lucide-react`) — the default icon library for shadcn/ui.

**Key shadcn Components to Use:**
- **Layout:** `ResizablePanelGroup` + `ResizablePanel` + `ResizableHandle` for the main panel layout. `Sidebar` component (21KB, full state management with `useSidebar` hook, collapsible, mobile-responsive) for the left actor panel.
- **Data Entry:** `Slider` for all weather/traffic/physics parameters. `Select` and `Command` (searchable combobox) for blueprint/map selection. `Switch` for toggles. `Form` + `Field` for sensor configuration.
- **Data Display:** `Table` for actor/sensor lists. `Card` for sensor view containers. `Badge` for status indicators. `Chart` (wraps Recharts) for IMU/telemetry graphs. `ScrollArea` for scrollable panels. `Skeleton` and `Spinner` for loading states.
- **Overlays:** `Dialog` for modals. `Sheet` for slide-out panels. `Popover` for inline panels. `ContextMenu` for right-click actions. `DropdownMenu` for action menus. `Tooltip` for hover hints. `AlertDialog` for confirmations. `Sonner` for toast notifications.
- **Navigation:** `Tabs` for panel tab switching. `Command` for Cmd+K command palette. `Breadcrumb` for nested navigation.
- **Blocks:** Start from `sidebar-07` (collapsible sections) for actor panel. Reference `dashboard-01` for overall layout patterns.

**Layout:**
```
┌──────────────────────────────────────────────────────────────────┐
│  Top Bar: connection status, sim time, FPS, map name, controls  │
├────────┬─────────────────────────────────────────┬───────────────┤
│        │                                         │               │
│  Left  │         Main 3D Viewport                │    Right      │
│  Panel │         (Pixel Streaming)               │    Panel      │
│        │                                         │               │
│ Actor  │                                         │  Properties   │
│ List   │                                         │  & Details    │
│        │                                         │               │
│ Spawn  ├─────────────────────────────────────────┤  Sensor       │
│ Tools  │  Bottom Panel (collapsible)             │  Config       │
│        │  Sensor Views | Telemetry | Event Log   │               │
│        │                                         │               │
├────────┴─────────────────────────────────────────┴───────────────┤
│  Status Bar: latency, bandwidth, tick rate, sync mode            │
└──────────────────────────────────────────────────────────────────┘
```

- All panels must be **resizable** (drag handles) and **collapsible** (toggle buttons).
- Support **multi-monitor layouts**: sensor views should be detachable into separate browser windows (`window.open` with shared state via `BroadcastChannel`).
- Implement **keyboard shortcuts** for common actions (Space: play/pause, N: next tick, W: toggle weather panel, S: toggle sensor panel, Escape: deselect).
- Every interactive element must have visible hover, active, focus, and disabled states.
- Loading states: use skeleton placeholders (`animate-pulse`) for data that hasn't arrived yet.
- Connection status: prominent indicator in the top bar with color coding (green=connected, yellow=connecting, red=disconnected).

---

### BACKEND: PYTHON BRIDGE SERVICE

Build a Python middleware service that bridges the CARLA simulator to the web frontend. This is the translation layer between CARLA's native protocols and web-standard protocols.

**Technology:** Python 3.10+, FastAPI, `asyncio`, `websockets`, `carla` Python API, `uvicorn`.

#### Bridge Architecture

```python
# Conceptual structure — not literal code
class CarlaBridge:
    """
    Connects to CARLA server, subscribes to sensors,
    and serves data to web clients via WebSocket + REST.
    """
    carla_client: carla.Client          # Connection to CARLA RPC
    world: carla.World                  # Current simulation world
    sensor_manager: SensorManager       # Manages sensor subscriptions
    ws_broadcaster: WebSocketBroadcaster # Multiplexed WebSocket server

    # REST endpoints (FastAPI)
    # WebSocket endpoint (single multiplexed connection)
```

#### REST API Endpoints

Design and implement the following REST API. All responses are JSON. All mutations return the updated state.

**Simulation Control:**
```
GET    /api/simulation/status         → { running, paused, tick, elapsed_time, map, sync_mode, weather }
POST   /api/simulation/play           → Start/resume simulation
POST   /api/simulation/pause          → Pause simulation
POST   /api/simulation/step           → Advance one tick (sync mode)
POST   /api/simulation/settings       → { sync_mode, fixed_delta, no_rendering, substepping, ... }
POST   /api/simulation/reload         → Reload current map
```

**World & Maps:**
```
GET    /api/world/maps                → List available maps
POST   /api/world/load                → { map_name } → Load a new map
GET    /api/world/weather             → Current weather parameters (all 15+ floats)
POST   /api/world/weather             → Set weather parameters or preset name
GET    /api/world/weather/presets     → List of 22 weather presets
GET    /api/world/spawn-points        → Array of available spawn transforms
POST   /api/world/map-layers          → { layer, action: "load"|"unload" }
```

**Actors:**
```
GET    /api/actors                    → List all actors with type, transform, velocity
GET    /api/actors/:id                → Detailed actor info (physics, lights, control state)
POST   /api/actors/spawn/vehicle      → { blueprint, transform, autopilot? } → Spawn vehicle
POST   /api/actors/spawn/walker       → { blueprint, transform } → Spawn pedestrian
POST   /api/actors/spawn/sensor       → { type, transform, parent_id, attributes } → Attach sensor
DELETE /api/actors/:id                → Destroy actor
POST   /api/actors/:id/control        → { throttle, steer, brake, hand_brake, reverse }
POST   /api/actors/:id/autopilot      → { enabled, tm_port }
POST   /api/actors/:id/transform      → { location, rotation }
POST   /api/actors/:id/lights         → { light_state }
POST   /api/actors/:id/physics        → { physics_control_params }
GET    /api/actors/:id/bounding-box   → 3D bounding box extent and transform
```

**Sensors:**
```
GET    /api/sensors/types             → Available sensor types with configurable attributes
GET    /api/sensors/:id/config        → Current sensor configuration
POST   /api/sensors/:id/config        → Update sensor attributes
```

**Traffic Manager:**
```
GET    /api/traffic/status            → TM status and global settings
POST   /api/traffic/global-speed      → Set global speed difference percentage
POST   /api/traffic/vehicle/:id/speed → Set per-vehicle speed
POST   /api/traffic/vehicle/:id/lane  → Lane change settings
POST   /api/traffic/vehicle/:id/ignore → Ignore lights/signs/walkers percentages
POST   /api/traffic/vehicle/:id/route → Set custom route (waypoint array)
```

**Blueprints:**
```
GET    /api/blueprints/vehicles       → Available vehicle blueprints with attributes
GET    /api/blueprints/walkers        → Available walker blueprints
GET    /api/blueprints/sensors        → Available sensor blueprints with attribute schemas
GET    /api/blueprints/props          → Available static props
```

**Recording & Replay:**
```
POST   /api/recording/start           → { filename } → Start recording
POST   /api/recording/stop            → Stop recording
GET    /api/recording/files           → List saved recordings
POST   /api/replay/start              → { filename, start_time, duration, camera_id }
POST   /api/replay/stop               → Stop replay
```

**Navigation:**
```
GET    /api/map/topology              → Road network graph (waypoints + connections)
POST   /api/map/route                 → { origin, destination } → Planned route (waypoints + road options)
GET    /api/map/waypoint              → { location } → Nearest waypoint info (road_id, lane_id, type)
```

#### WebSocket Protocol

Single multiplexed WebSocket connection at `ws://host:port/ws`.

**Message format (binary):**
```
[1 byte: channel_id][4 bytes: message_length][N bytes: payload]

Channel IDs:
  0x01 = Camera frame     → [4B sensor_id][4B width][4B height][4B frame_no][8B timestamp][N bytes JPEG/WebP data]
  0x02 = Depth frame      → [4B sensor_id][4B width][4B height][4B frame_no][8B timestamp][N bytes encoded data]
  0x03 = Segmentation     → [4B sensor_id][4B width][4B height][4B frame_no][8B timestamp][N bytes PNG data]
  0x04 = LiDAR            → [4B sensor_id][4B point_count][4B frame_no][8B timestamp][N*16B Float32 x,y,z,intensity]
  0x05 = Semantic LiDAR   → [4B sensor_id][4B point_count][4B frame_no][8B timestamp][N*24B Float32 x,y,z,cos,idx,tag]
  0x06 = Radar            → [4B sensor_id][4B detection_count][4B frame_no][8B timestamp][N*16B Float32 vel,az,alt,depth]
  0x07 = IMU              → [4B sensor_id][4B frame_no][8B timestamp][12B accel_xyz][12B gyro_xyz][4B compass]
  0x08 = GNSS             → [4B sensor_id][4B frame_no][8B timestamp][8B lat][8B lon][8B alt]
  0x09 = Collision        → [4B sensor_id][4B frame_no][8B timestamp][4B other_actor_id][12B impulse_xyz]
  0x0A = Lane invasion     → [4B sensor_id][4B frame_no][8B timestamp][4B marking_count][N*marking_data]
  0x0B = DVS events       → [4B sensor_id][4B event_count][4B frame_no][8B timestamp][N*event_data]
  0x10 = World tick       → [4B frame_no][8B timestamp][4B actor_count][per_actor: 4B id, 12B pos, 12B rot, 12B vel]
  0x11 = Telemetry        → [4B vehicle_id][4B frame_no][JSON: speed, gear, throttle, steer, brake, ...]

  0xF0 = Subscribe        → [4B sensor_id] (text JSON: { "action": "subscribe", "sensor_id": 123 })
  0xF1 = Unsubscribe      → [4B sensor_id]
  0xFE = Client stats     → (text JSON: { "fps": 30, "processing_ms": 12, "dropped_frames": 2 })
  0xFF = Control           → (text JSON: any command)
```

**Server-side implementation details:**
- The bridge runs `carla.Sensor.listen(callback)` for each subscribed sensor.
- Camera callbacks compress the BGRA buffer to JPEG using `turbojpeg` (fastest Python JPEG encoder) or `Pillow` with libjpeg-turbo.
- LiDAR callbacks extract the raw float buffer from `carla.LidarMeasurement.raw_data` and forward it directly as binary (already in the right format).
- The bridge maintains a **per-client subscription set**. Only sensors with at least one subscriber are active. When the last client unsubscribes, the sensor is stopped.
- World tick data is broadcast to all clients every simulation tick.
- Implement a **frame counter per client per sensor**. If the client's last-acknowledged frame is more than 3 frames behind, skip frames for that client.

#### Bridge Performance Requirements:
- JPEG compression of 1920x1080 BGRA frame: **<5ms** (use turbojpeg with TJFLAG_FASTDCT)
- WebSocket broadcast to 10 clients: **<2ms** (async send, don't wait for ACK)
- Total bridge overhead per frame per sensor: **<10ms**
- Bridge must be **async end-to-end** (no blocking calls on the event loop)

---

### FRONTEND: REACT APPLICATION

**Technology:** Vite + React 19 + TypeScript (client-side SPA, NO Next.js), Tailwind CSS v4, shadcn/ui v4, Zustand, react-router-dom, Three.js (via @react-three/fiber), Recharts.

**IMPORTANT: This is a pure client-side SPA built with Vite, NOT Next.js. No SSR, no RSC, no server components, no App Router. Use react-router-dom for routing, React.lazy for code splitting, and standard HTML for fonts.**

#### Project Structure

```
carla-web/
├── index.html                    # Vite entry HTML (fonts, root div, dark class)
├── public/
│   └── favicon.png               # CARLA logo
├── src/
│   ├── main.tsx                  # ReactDOM.createRoot + BrowserRouter
│   ├── App.tsx                   # Routes + providers (TooltipProvider, Toaster)
│   ├── index.css                 # Tailwind directives + theme CSS variables
│   ├── routes/
│   │   ├── SimulationPage.tsx    # Main simulation page
│   │   └── SettingsPage.tsx      # Connection settings, preferences
│   ├── components/
│   │   ├── ui/                   # shadcn/ui components (Button, Card, Slider, etc.)
│   │   ├── layout/
│   │   │   ├── TopBar.tsx        # Connection status, sim controls, time
│   │   │   ├── StatusBar.tsx     # Latency, bandwidth, FPS metrics
│   │   │   ├── LeftPanel.tsx     # Actor list, spawn tools
│   │   │   ├── RightPanel.tsx    # Properties, sensor config
│   │   │   ├── BottomPanel.tsx   # Sensor views, telemetry, event log
│   │   │   └── ResizableLayout.tsx # Panel resize logic
│   │   ├── viewport/
│   │   │   ├── MainViewport.tsx  # Pixel Streaming video + overlay
│   │   │   ├── PixelStreamingClient.tsx # WebRTC connection manager
│   │   │   └── ViewportOverlay.tsx # HUD: speed, gear, compass
│   │   ├── sensors/
│   │   │   ├── SensorPanel.tsx   # Multi-view sensor display container
│   │   │   ├── CameraView.tsx    # Single camera feed (canvas-based)
│   │   │   ├── DepthView.tsx     # Depth camera visualization
│   │   │   ├── SegmentationView.tsx # Semantic segmentation overlay
│   │   │   ├── LidarView.tsx     # 3D point cloud (Three.js)
│   │   │   ├── RadarView.tsx     # Radar detection plot
│   │   │   ├── ImuChart.tsx      # Accelerometer/gyro line charts
│   │   │   ├── GnssView.tsx      # GPS map pin
│   │   │   └── DvsView.tsx       # DVS event accumulation display
│   │   ├── controls/
│   │   │   ├── SimulationControls.tsx  # Play/Pause/Step/Speed
│   │   │   ├── WeatherControls.tsx     # Weather presets + sliders
│   │   │   ├── TimeOfDayControl.tsx    # Sun position slider
│   │   │   ├── VehicleControls.tsx     # Throttle/steer/brake (keyboard)
│   │   │   └── SpawnPanel.tsx          # Vehicle/walker/sensor spawn UI
│   │   ├── actors/
│   │   │   ├── ActorList.tsx           # Virtualized actor list
│   │   │   ├── ActorDetails.tsx        # Selected actor properties
│   │   │   ├── VehicleDetails.tsx      # Vehicle-specific controls
│   │   │   ├── SensorDetails.tsx       # Sensor config editor
│   │   │   └── TrafficManagerPanel.tsx # TM settings per vehicle
│   │   ├── map/
│   │   │   ├── MiniMap.tsx             # 2D top-down actor positions
│   │   │   ├── RouteEditor.tsx         # Visual waypoint editor
│   │   │   └── OpenDriveViewer.tsx     # Road network visualization
│   │   ├── scenario/
│   │   │   ├── ScenarioRunner.tsx      # Scenario load/execute/monitor
│   │   │   └── RecordingControls.tsx   # Record/replay transport
│   │   └── shared/
│   │       ├── ConnectionIndicator.tsx # Connection state badge
│   │       ├── NumericReadout.tsx      # High-perf numeric display (useRef)
│   │       └── EventLog.tsx            # Collision/lane events (virtualized)
│   ├── hooks/
│   │   ├── useWebSocket.ts       # WebSocket connection + reconnect
│   │   ├── useSensorData.ts      # Subscribe to sensor streams
│   │   ├── useCarlaApi.ts        # REST API wrapper (fetch + SWR)
│   │   ├── usePixelStreaming.ts  # Pixel Streaming connection
│   │   ├── useKeyboardShortcuts.ts # Global keyboard handler
│   │   └── usePerformanceMonitor.ts # FPS, latency, bandwidth tracking
│   ├── workers/
│   │   ├── ws-receiver.worker.ts     # WebSocket binary frame parser
│   │   ├── image-decoder.worker.ts   # JPEG/WebP decode to ImageBitmap
│   │   ├── lidar-processor.worker.ts # Point cloud downsampling, coloring
│   │   └── telemetry-aggregator.worker.ts # Aggregate world tick data
│   ├── stores/
│   │   ├── simulationStore.ts    # Simulation state (Zustand)
│   │   ├── actorStore.ts         # Actor registry
│   │   ├── sensorStore.ts        # Sensor subscriptions and config
│   │   ├── uiStore.ts            # Panel visibility, layout prefs
│   │   └── performanceStore.ts   # Client metrics
│   ├── lib/
│   │   ├── carla-api.ts          # Typed REST API client
│   │   ├── ws-protocol.ts        # Binary WebSocket protocol parser
│   │   ├── image-utils.ts        # Image conversion helpers
│   │   ├── lidar-utils.ts        # Point cloud helpers
│   │   ├── color-maps.ts         # Depth/segmentation color palettes
│   │   └── constants.ts          # Channel IDs, defaults, limits
│   ├── types/
│   │   ├── carla.ts              # CARLA domain types (Vehicle, Sensor, Weather, etc.)
│   │   ├── api.ts                # API request/response types
│   │   └── ws.ts                 # WebSocket message types
│   └── styles/
│       └── globals.css           # Tailwind directives + custom properties
├── vite.config.ts                # Vite config (port 42691, SharedArrayBuffer headers, worker format)
├── tailwind.config.ts
├── tsconfig.json
├── tsconfig.app.json
├── package.json
└── components.json               # shadcn/ui config
```

#### Component Implementation Details

**MainViewport.tsx — Pixel Streaming Integration:**
- Initialize UE5 Pixel Streaming client on mount.
- Render WebRTC video stream in a `<video>` element that fills the viewport container.
- Overlay a transparent `<div>` for HUD elements (speed, gear, coordinates, compass).
- Forward keyboard/mouse events to Pixel Streaming for spectator camera control.
- Display a fallback "Connecting to simulation..." skeleton when the stream isn't active.
- Show current FPS and latency in a corner badge.

**CameraView.tsx — Optimized Camera Feed:**
- Receive binary JPEG frames from the WebSocket receiver worker via `MessagePort`.
- Decode JPEG to `ImageBitmap` in the image-decoder worker (using `createImageBitmap`).
- Transfer the `ImageBitmap` to the main thread (zero-copy via Transferable).
- Draw to an `OffscreenCanvas` or regular `<canvas>` using `drawImage`.
- Display frame metadata: resolution, FPS, frame number.
- Support click-to-enlarge (opens in a floating panel or new window).
- MUST NOT use `<img>` with blob URLs (causes GC pressure from URL.createObjectURL/revokeObjectURL churn).

**LidarView.tsx — WebGL Point Cloud:**
- Use `@react-three/fiber` with a `<Canvas>` component.
- Receive Float32Array point data from the lidar-processor worker.
- Update `BufferGeometry.attributes.position` and `color` directly (`.needsUpdate = true`).
- Apply intensity-based or height-based coloring via a custom `ShaderMaterial` for maximum performance.
- Implement orbit controls for user camera manipulation.
- Support point size adjustment slider.
- Apply point budget: if point count > 200K, use stride-based downsampling in the worker.
- Show point count and scan rate in a corner badge.

**RadarView.tsx:**
- Render detections as a 2D polar plot (azimuth vs. depth) using Canvas 2D.
- Color-code by velocity (blue = approaching, red = receding).
- Show detection count and update rate.

**ImuChart.tsx:**
- Use Recharts with a fixed-width sliding window (last 200 samples).
- Three line series: X, Y, Z for accelerometer; three for gyroscope.
- Use `isAnimationActive={false}` on Recharts to prevent animation overhead.
- Update via `useRef` buffer, flush to chart state at 10Hz (not every frame).

**WeatherControls.tsx:**
- Preset dropdown (22 CARLA weather presets).
- Expandable "Advanced" section with individual sliders for all 15+ weather parameters.
- Each slider fires a debounced (300ms) REST API call to update weather.
- Show current values with monospace numeric readouts.

**ActorList.tsx:**
- Virtualized list using `@tanstack/react-virtual`.
- Group by type: Vehicles, Walkers, Sensors, Traffic Lights, Props.
- Each item shows: icon, type, ID, brief status (speed for vehicles, state for traffic lights).
- Click to select → populate RightPanel with details.
- Right-click context menu: Teleport spectator, Destroy, Toggle autopilot.

**SpawnPanel.tsx:**
- Tabbed interface: Vehicles | Walkers | Sensors | Props.
- Blueprint selector with search/filter.
- Transform input (position X/Y/Z, rotation yaw) or "Random spawn point" button.
- For sensors: parent actor selector + attribute configuration (resolution, FOV, range, etc.).
- "Spawn" button with loading state.

**MiniMap.tsx:**
- 2D Canvas or SVG rendering of all actor positions from above.
- Color-coded dots: blue=ego vehicle, green=NPC vehicles, yellow=walkers, red=selected.
- Pan and zoom with mouse/touch.
- Click on actor dot to select.
- Show road network as gray lines if OpenDRIVE topology is loaded.

**RecordingControls.tsx:**
- Record button (turns red when active).
- File list of saved recordings.
- Replay transport: play, pause, seek bar, playback speed.
- Camera selector for replay viewpoint.

#### Zustand Store Design

```typescript
// simulationStore.ts
interface SimulationState {
  // Connection
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
  serverUrl: string
  bridgeUrl: string

  // Simulation state (updated every tick via WebSocket)
  isRunning: boolean
  isPaused: boolean
  syncMode: boolean
  currentTick: number
  elapsedTime: number
  fixedDeltaSeconds: number
  currentMap: string

  // Weather (updated via REST response or WebSocket tick)
  weather: CarlaWeatherParams

  // Actions
  connect: (serverUrl: string, bridgeUrl: string) => Promise<void>
  disconnect: () => void
  play: () => Promise<void>
  pause: () => Promise<void>
  step: () => Promise<void>
  setWeather: (params: Partial<CarlaWeatherParams>) => Promise<void>
  setWeatherPreset: (preset: string) => Promise<void>
  loadMap: (mapName: string) => Promise<void>
}

// actorStore.ts
interface ActorState {
  actors: Map<number, CarlaActor>           // All actors keyed by ID
  selectedActorId: number | null

  // Updated every world tick (bulk update, not per-actor)
  updateActorTransforms: (transforms: ActorTransformBatch) => void
  selectActor: (id: number | null) => void
  spawnVehicle: (config: VehicleSpawnConfig) => Promise<CarlaActor>
  spawnWalker: (config: WalkerSpawnConfig) => Promise<CarlaActor>
  destroyActor: (id: number) => Promise<void>
  applyControl: (id: number, control: VehicleControl) => Promise<void>
  setAutopilot: (id: number, enabled: boolean) => Promise<void>
}

// sensorStore.ts — SEPARATE store for performance isolation
interface SensorState {
  sensors: Map<number, SensorConfig>
  subscriptions: Set<number>               // Currently subscribed sensor IDs

  // These are NOT stored in Zustand state — they go directly to rendering
  // via Worker MessagePorts. Zustand only tracks metadata.
  subscribe: (sensorId: number) => void
  unsubscribe: (sensorId: number) => void
  spawnSensor: (config: SensorSpawnConfig) => Promise<SensorConfig>
  updateConfig: (sensorId: number, attrs: Record<string, any>) => Promise<void>
}
```

**Critical:** Sensor frame data (images, point clouds) must NEVER flow through Zustand or React state. The data path is: WebSocket Worker → Processing Worker → Rendering Canvas/WebGL. Zustand only tracks which sensors exist and which are subscribed.

#### Web Worker Architecture

```
                    ┌──────────────────────┐
                    │   Main Thread        │
                    │   (React UI)         │
                    │                      │
                    │   - Layout/panels    │
                    │   - Controls         │
                    │   - Zustand stores   │
                    │   - Three.js canvas  │
                    └──────┬───────────────┘
                           │ MessagePort (metadata only)
                    ┌──────┴───────────────┐
                    │   WS Receiver Worker │
                    │                      │
                    │   - WebSocket conn   │
                    │   - Binary parsing   │
                    │   - Channel routing  │
                    └──┬────┬────┬────┬────┘
                       │    │    │    │  MessagePort + Transferable
              ┌────────┘    │    │    └────────┐
              │             │    │             │
     ┌────────┴──┐  ┌──────┴──┐ │    ┌────────┴──────────┐
     │ Image     │  │ LiDAR   │ │    │ Telemetry         │
     │ Decoder   │  │ Proc.   │ │    │ Aggregator        │
     │ Worker    │  │ Worker  │ │    │ Worker            │
     │           │  │         │ │    │                   │
     │ JPEG →    │  │ Filter, │ │    │ Batch actor       │
     │ ImageBmp  │  │ color,  │ │    │ transforms,       │
     │           │  │ budget  │ │    │ emit at 10Hz      │
     └─────┬─────┘  └────┬───┘ │    └────────┬──────────┘
           │              │     │             │
     Transferable   Transferable │       postMessage
     ImageBitmap    Float32Array │       (JSON batch)
           │              │     │             │
           ▼              ▼     ▼             ▼
     OffscreenCanvas  Three.js  Radar      Zustand
     (camera feed)    (LiDAR)   Canvas     (actor positions)
```

---

### COMPLETE SENSOR IMPLEMENTATION CHECKLIST

For each sensor type, implement end-to-end: bridge callback → compression/encoding → WebSocket transmission → worker processing → frontend rendering component.

- [ ] **RGB Camera** — JPEG compress → binary WS → ImageBitmap decode → canvas draw
- [ ] **Depth Camera** — Apply color map server-side → JPEG → same pipeline as RGB
- [ ] **Semantic Segmentation** — Apply CityScapes palette server-side → PNG (lossless for label accuracy) → canvas
- [ ] **Instance Segmentation** — Unique color per instance → PNG → canvas
- [ ] **Optical Flow** — Encode as HSV color map → JPEG → canvas (or raw float for advanced viz)
- [ ] **Normals Camera** — Direct RGB display → JPEG → canvas
- [ ] **DVS Camera** — Accumulate events into frame on server → JPEG → canvas
- [ ] **Ray-Cast LiDAR** — Raw Float32 binary → worker downsample → Three.js Points
- [ ] **Semantic LiDAR** — Raw binary + semantic tag → worker color by tag → Three.js Points
- [ ] **Radar** — Raw Float32 binary → Canvas 2D polar plot
- [ ] **IMU** — JSON or minimal binary → Recharts line chart (buffered)
- [ ] **GNSS** — JSON → Map pin update (Leaflet or simple canvas map)
- [ ] **Collision** — JSON event → Event log entry + optional 3D marker
- [ ] **Lane Invasion** — JSON event → Event log entry + lane overlay
- [ ] **Obstacle Detection** — JSON event → Proximity indicator
- [ ] **GBuffer channels** — Individual channel images → same pipeline as camera sensors

---

### COMPLETE FEATURE IMPLEMENTATION CHECKLIST

- [ ] **Pixel Streaming main viewport** with spectator camera control
- [ ] **Simulation play/pause/step** with sync and async mode support
- [ ] **Simulation speed control** (tick rate adjustment)
- [ ] **Weather system** — all 22 presets + 15+ individual parameter sliders
- [ ] **Map loading** — list available maps, load selected, show loading progress
- [ ] **Map layer control** — toggle individual map layers on/off
- [ ] **Vehicle spawning** — blueprint selection, position, auto-pilot toggle
- [ ] **Walker spawning** — blueprint selection, position, AI controller
- [ ] **Sensor attachment** — type selection, parent actor, full attribute configuration
- [ ] **Vehicle control** — keyboard-driven throttle/steer/brake/handbrake/reverse
- [ ] **Ackermann control** option for realistic steering
- [ ] **Vehicle lights** — toggle all light states
- [ ] **Vehicle doors** — open/close individual or all
- [ ] **Vehicle physics editor** — mass, drag, wheel params, suspension, engine curves
- [ ] **Traffic Manager panel** — global and per-vehicle speed, lane, compliance settings
- [ ] **Route planning** — visual waypoint editor, route display on minimap
- [ ] **Actor list** — virtualized, grouped, searchable, with context menu
- [ ] **Actor details** — transform, velocity, bounding box, semantic tags
- [ ] **Spectator teleport** — click actor to move spectator to its position
- [ ] **Debug drawing** — toggle debug lines/points/strings on viewport
- [ ] **Recording** — start/stop recording to file
- [ ] **Replay** — load recording, transport controls, seek, speed
- [ ] **OpenDRIVE viewer** — road network visualization
- [ ] **Event log** — collision, lane invasion, obstacle events with timestamps
- [ ] **Multi-sensor panel** — configurable grid layout for multiple sensor views
- [ ] **Detachable sensor windows** — pop out sensor views to separate browser windows
- [ ] **Keyboard shortcuts** — comprehensive shortcut system with customization
- [ ] **Connection management** — auto-reconnect, connection settings, multi-server support
- [ ] **Performance monitor** — FPS, latency, bandwidth, frame drops, worker utilization
- [ ] **Responsive layout** — resizable panels, collapsible sections, layout persistence
- [ ] **Dark/light theme** — full theme support (dark default)
- [ ] **Export data** — download sensor data snapshots (images, point clouds) as files

---

### DEVELOPMENT WORKFLOW

#### Phase 1: Foundation (Week 1-2)
1. Set up Next.js project with TypeScript, Tailwind, shadcn/ui
2. Implement basic layout (TopBar, panels, resizable grid)
3. Build Python bridge skeleton (FastAPI + CARLA client connection)
4. Implement REST API for simulation status + world info
5. Implement WebSocket connection with binary protocol
6. Get a single RGB camera streaming end-to-end

#### Phase 2: Core Sensors (Week 3-4)
1. Implement all camera sensor types (depth, segmentation, normals, optical flow, DVS)
2. Implement LiDAR 3D point cloud renderer
3. Implement radar polar plot
4. Implement IMU/GNSS displays
5. Build multi-sensor panel with grid layout
6. Implement Web Worker pipeline for all sensor types

#### Phase 3: Simulation Control (Week 5-6)
1. Integrate Pixel Streaming for main viewport
2. Implement weather controls (presets + advanced sliders)
3. Implement actor spawning (vehicles, walkers, sensors)
4. Implement vehicle control (keyboard input)
5. Implement actor list + details panel
6. Implement Traffic Manager controls

#### Phase 4: Advanced Features (Week 7-8)
1. Implement minimap with actor positions
2. Implement route editor / waypoint planner
3. Implement recording/replay transport
4. Implement OpenDRIVE road network viewer
5. Implement event log (collision, lane invasion)
6. Implement detachable sensor windows

#### Phase 5: Polish & Optimization (Week 9-10)
1. Performance profiling and optimization pass
2. Adaptive quality system (auto-reduce resolution/FPS)
3. Layout persistence (save/restore panel sizes)
4. Keyboard shortcut system
5. Dark/light theme
6. Error handling, edge cases, loading states
7. Export/download sensor data feature

---

### TESTING STRATEGY

- **Unit tests** (Vitest): utility functions, protocol parsers, color map generators
- **Component tests** (React Testing Library): control panels, actor list, spawn forms
- **Integration tests**: WebSocket protocol round-trip, REST API contract tests
- **Performance tests**: measure frame processing time, ensure <16ms main thread budget
- **E2E tests** (Playwright): connect to mock bridge, verify sensor display, verify controls

---

### QUALITY REQUIREMENTS

| Metric | Target |
|--------|--------|
| Main viewport FPS | 30-60 (Pixel Streaming dependent) |
| Sensor panel update rate | 20-30 FPS per camera feed |
| LiDAR render rate | 10-20 FPS for 200K points |
| Main thread frame budget | <16ms (60 FPS capable) |
| Initial page load (gzipped) | <200KB JS + <50KB CSS |
| Time to interactive | <3 seconds |
| WebSocket reconnect time | <2 seconds (after detection) |
| Memory usage (10 sensors) | <500MB browser tab |
| Bridge CPU usage (10 sensors) | <50% of one core |

---

### CONSTRAINTS & ASSUMPTIONS

1. The CARLA UE5 server is running on a machine with a GPU (the web client does NOT need a GPU, except for LiDAR WebGL rendering which uses the integrated GPU).
2. The Python bridge and CARLA server may run on the same machine or on different machines on the same network.
3. The web client connects to the bridge, not directly to the CARLA server.
4. Multiple web clients can connect simultaneously; each manages its own sensor subscriptions.
5. The bridge must handle client disconnection gracefully (clean up sensors, release resources).
6. UE5 Pixel Streaming requires the `PixelStreamingPlugin` to be enabled in the CARLA UE5 build — this may require rebuilding CARLA from source with the plugin included.
7. If Pixel Streaming is not available, the main viewport should fall back to a "camera-only" mode where a high-resolution RGB camera provides the viewport image (lower quality but functional).

---

### REFERENCE: CARLA DATA STRUCTURES

```typescript
// Core CARLA types for the frontend

interface CarlaTransform {
  location: { x: number; y: number; z: number }
  rotation: { pitch: number; yaw: number; roll: number }
}

interface CarlaActor {
  id: number
  type_id: string          // e.g., "vehicle.tesla.model3"
  semantic_tags: number[]
  transform: CarlaTransform
  velocity: { x: number; y: number; z: number }
  angular_velocity: { x: number; y: number; z: number }
  acceleration: { x: number; y: number; z: number }
  bounding_box: { extent: { x: number; y: number; z: number }; transform: CarlaTransform }
  actor_state: 'active' | 'dormant' | 'invalid'
}

interface VehicleControl {
  throttle: number       // 0.0 - 1.0
  steer: number          // -1.0 - 1.0
  brake: number          // 0.0 - 1.0
  hand_brake: boolean
  reverse: boolean
  manual_gear_shift: boolean
  gear: number
}

interface CarlaWeatherParams {
  sun_azimuth_angle: number        // 0-360
  sun_altitude_angle: number       // -90 to 90
  cloudiness: number               // 0-100
  precipitation: number            // 0-100
  precipitation_deposits: number   // 0-100
  wind_intensity: number           // 0-100
  fog_density: number              // 0-100
  fog_distance: number             // meters
  fog_falloff: number
  wetness: number                  // 0-100
  dust_storm: number               // 0-100
  scattering_intensity: number
  mie_scattering_scale: number
  rayleigh_scattering_scale: number
}

interface SensorConfig {
  id: number
  type: string                     // e.g., "sensor.camera.rgb"
  parent_id: number               // Attached actor ID
  transform: CarlaTransform       // Relative to parent
  attributes: Record<string, string | number | boolean>
  // Common attributes by type:
  // Camera: image_size_x, image_size_y, fov, lens_k, lens_kcube, lens_circle_falloff
  // LiDAR: channels, range, points_per_second, rotation_frequency, upper_fov, lower_fov
  // Radar: horizontal_fov, vertical_fov, range, points_per_second
}

type WeatherPreset =
  | 'ClearNoon' | 'CloudyNoon' | 'WetNoon' | 'WetCloudyNoon'
  | 'MidRainyNoon' | 'HardRainNoon' | 'SoftRainNoon'
  | 'ClearSunset' | 'CloudySunset' | 'WetSunset' | 'WetCloudySunset'
  | 'MidRainSunset' | 'HardRainSunset' | 'SoftRainSunset'
  | 'ClearNight' | 'CloudyNight' | 'WetNight' | 'WetCloudyNight'
  | 'SoftRainNight' | 'MidRainyNight' | 'HardRainNight'
  | 'DustStorm'
```

---

### FINAL NOTES

- **Always prioritize performance.** A beautiful UI that lags is worse than a plain UI that runs smoothly. Measure before you optimize, but design for performance from the start.
- **Binary over JSON** for any data that arrives more than once per second.
- **Workers for everything** that touches sensor data.
- **Never block the main thread** with data processing.
- **Test with realistic load**: 3+ cameras, 1 LiDAR, 1 radar, 50+ NPC vehicles simultaneously.
- The bridge is the performance bottleneck — invest in async design, efficient compression, and smart frame dropping.
- The frontend must degrade gracefully: if a sensor stream is too heavy, reduce quality automatically rather than freezing.
