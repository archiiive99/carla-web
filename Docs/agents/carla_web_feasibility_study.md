# CARLA Web Version — Feasibility Study & Technical Analysis

This document presents a comprehensive technical analysis of building a web-based interface for the CARLA autonomous driving simulator. It covers rendering feasibility, architecture decisions, performance constraints, and a complete feature inventory.

---

## 1. Core Question: Is Unreal Engine Required?

### Answer: Yes — Unreal Engine 5 is absolutely required on the server side.

CARLA's rendering pipeline is **fundamentally inseparable from Unreal Engine 5**. Every visual output — from RGB camera frames to depth maps, semantic segmentation, optical flow, and LiDAR ray-casting — is computed within UE5's rendering pipeline.

**Evidence from codebase:**

| Component | UE5 Dependency | Source |
|-----------|---------------|--------|
| RGB Camera | `USceneCaptureComponent2D_CARLA` renders scene to `UTextureRenderTarget2D` | `Sensor/SceneCaptureCamera.h` |
| Depth Camera | UE5 post-process material applied to scene capture | `Sensor/DepthCamera.h` |
| Semantic Segmentation | UE5 stencil buffer + custom material | `Sensor/SemanticSegmentationCamera.h` |
| LiDAR | UE5 `LineTraceSingleByChannel` (ray-casting via Chaos physics) | `Sensor/RayCastLidar.h` |
| Weather | UE5 post-process volumes + dynamic sky | `Weather/Weather.h` |
| Physics | UE5 Chaos Vehicles plugin | Vehicle control system |
| Materials & Lighting | UE5 material system, Lumen GI | Throughout rendering pipeline |
| GBuffer Access | UE5 deferred rendering buffers (SceneColor, Depth, Normals, etc.) | `Sensor/GBufferUint8Sensor.h` |

**Conclusion:** The server **must** run UE5 with the CARLA plugin. The web version is a **remote client** that receives and displays data rendered by the UE5 backend.

---

## 2. Rendering Architecture Options

### Option A: UE5 Pixel Streaming (Recommended for "identical rendering")

UE5's built-in Pixel Streaming plugin encodes the rendered viewport as H.264/VP8 video and streams it to a browser via WebRTC.

**Pros:**
- Pixel-perfect reproduction of UE5 rendering (shadows, reflections, Nanite, Lumen, etc.)
- Sub-100ms latency with proper configuration
- Browser receives standard video stream — no complex client-side 3D rendering needed
- Supports input forwarding (mouse, keyboard, touch) back to UE5
- Built-in adaptive bitrate for varying network conditions

**Cons:**
- Bandwidth-heavy (~5-15 Mbps for 1080p@30fps)
- Requires GPU on server for real-time encoding (NVENC/AMD AMF)
- Single viewport per stream (multiple cameras need multiple streams or compositing)
- Latency depends on network (50-150ms typical)

**Implementation:**
1. Enable `PixelStreamingPlugin` in `CarlaUnreal.uproject`
2. Configure signaling server (included with UE5 Pixel Streaming)
3. Frontend connects via WebRTC and renders to `<video>` element
4. Overlay React UI on top of the video stream

### Option B: Hybrid Approach (Recommended for full feature set)

Combine Pixel Streaming for the main 3D viewport with WebSocket-based data streaming for sensor feeds, telemetry, and a lightweight WebGL reconstruction.

**Architecture:**
```
┌─────────────────────────────────────────────────────────────┐
│                    UE5 CARLA Server (GPU)                    │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Pixel Stream  │  │ Sensor Data  │  │ RPC Commands     │  │
│  │ (WebRTC)      │  │ (TCP Stream) │  │ (MessagePack)    │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
└─────────┼─────────────────┼────────────────────┼────────────┘
          │                 │                    │
          │    ┌────────────┴────────────┐       │
          │    │  Bridge / Middleware     │       │
          │    │  (Python/Node.js)       │       │
          │    │  - TCP → WebSocket      │       │
          │    │  - Image compression    │       │
          │    │  - Data serialization   │       │
          │    └────────────┬────────────┘       │
          │                 │                    │
     WebRTC            WebSocket             REST API
          │                 │                    │
┌─────────┴─────────────────┴────────────────────┴────────────┐
│                    Web Browser (React)                       │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Main Viewport │  │ Sensor Views │  │ Control Panels   │  │
│  │ (Video/WebGL) │  │ (Canvas/GL)  │  │ (React+shadcn)  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Option C: Full WebGL Reconstruction (Not recommended)

Reconstruct the entire 3D scene in the browser using Three.js/Babylon.js.

**Why this doesn't work for "identical rendering":**
- Would require exporting all CARLA assets (meshes, materials, textures) to web-compatible formats
- Cannot reproduce UE5's Lumen GI, Nanite geometry, Chaos physics visuals
- Map assets are 10-50 GB — impractical for browser download
- Weather effects, post-processing, and material complexity would be drastically reduced
- Development effort would be enormous for a vastly inferior visual result

**Verdict:** Only viable for a simplified top-down/schematic view, not for matching UE5 visual fidelity.

---

## 3. Can All CARLA Features Be Rendered in the Web Client?

### Full Feature Inventory & Web Feasibility

#### 3.1 Camera Sensors

| Sensor | Data Format | Web Display Method | Feasibility |
|--------|------------|-------------------|-------------|
| RGB Camera | BGRA 8-bit pixels | JPEG/WebP → `<canvas>` or `<img>` | **Full support** |
| Depth Camera | BGRA encoded depth | Color-mapped visualization on canvas | **Full support** |
| Semantic Segmentation | BGRA with class colors | Color overlay on canvas | **Full support** |
| Instance Segmentation | BGRA with instance IDs | Color-coded canvas rendering | **Full support** |
| Optical Flow Camera | OpticalFlowPixel (2D vectors) | Arrow/color-coded visualization | **Full support** |
| Normals Camera | BGRA surface normals | Direct RGB display | **Full support** |
| DVS Camera | Event stream (x, y, t, pol) | Accumulated event image on canvas | **Full support** |
| GBuffer Channels | Multiple render targets | Individual channel display | **Full support** |

**Performance note:** Camera images should be JPEG/WebP compressed server-side before WebSocket transmission. At 1920x1080, raw BGRA is ~8MB/frame; JPEG at quality 80 is ~100-200KB/frame.

#### 3.2 Non-Camera Sensors

| Sensor | Data Format | Web Display Method | Feasibility |
|--------|------------|-------------------|-------------|
| LiDAR (Ray-Cast) | Point cloud (x,y,z,intensity) | WebGL point rendering (Three.js) | **Full support** — use Web Workers for parsing |
| Semantic LiDAR | Point cloud + semantic tags | Color-coded WebGL points | **Full support** |
| Radar | Detections (vel, azimuth, alt, depth) | Range-Doppler plot or 3D markers | **Full support** |
| IMU | Accelerometer + Gyroscope vectors | Real-time line charts (Chart.js / D3) | **Full support** |
| GNSS | Lat/Lon/Alt | Map pin (Leaflet/Mapbox) | **Full support** |
| Collision | Impulse vector + actors | Event log + 3D indicator | **Full support** |
| Lane Invasion | Lane marking crossings | Event log + visual overlay | **Full support** |
| Obstacle Detection | Distance + actor | Proximity indicator | **Full support** |

#### 3.3 Environment & World

| Feature | Control Method | Web Implementation | Feasibility |
|---------|---------------|-------------------|-------------|
| Weather (22 presets) | `world.set_weather()` | Dropdown + sliders via REST API | **Full support** |
| Weather parameters (15+) | Individual float params | Fine-grained slider controls | **Full support** |
| Time of day | Sun altitude/azimuth | Slider or time picker | **Full support** |
| Map loading | `client.load_world()` | Map selector dropdown | **Full support** |
| Map layers | `load/unload_map_layer()` | Toggle checkboxes | **Full support** |

#### 3.4 Vehicle & Actor Control

| Feature | Web Implementation | Feasibility |
|---------|-------------------|-------------|
| Vehicle spawning | Blueprint selector + map click | **Full support** |
| Vehicle control (throttle/steer/brake) | Keyboard/gamepad input forwarding | **Full support** — via Pixel Streaming input or WebSocket commands |
| Ackermann control | Steering angle input | **Full support** |
| Physics parameters | Form with engine/wheel/suspension params | **Full support** |
| Vehicle lights | Toggle buttons | **Full support** |
| Doors | Open/close buttons | **Full support** |
| Pedestrian spawning | Blueprint + waypoint path | **Full support** |
| Autopilot (Traffic Manager) | Enable/configure per vehicle | **Full support** |

#### 3.5 Traffic Manager

| Feature | Web Implementation | Feasibility |
|---------|-------------------|-------------|
| Speed control | Slider per vehicle or global | **Full support** |
| Lane behavior | Dropdowns/toggles | **Full support** |
| Collision avoidance | Distance slider | **Full support** |
| Traffic compliance | Percentage sliders | **Full support** |
| Route planning | Visual waypoint editor on map | **Full support** |

#### 3.6 Advanced Features

| Feature | Web Implementation | Feasibility |
|---------|-------------------|-------------|
| Scenario runner | Upload/select YAML + execute | **Full support** |
| OpenDRIVE viewer | SVG/Canvas road network renderer | **Full support** |
| Debug drawing | WebGL overlay lines/points/text | **Full support** |
| Recording/Replay | Transport controls (play/pause/seek) | **Full support** |
| World snapshots | JSON state display + export | **Full support** |

### Summary: **All CARLA features can be exposed through the web interface.** The key constraint is that visual rendering quality depends on the backend UE5 instance — the web client displays what UE5 renders.

---

## 4. Performance Constraints & Optimization Strategy

### 4.1 Bandwidth Requirements

| Data Stream | Raw Size/Frame | Compressed | Target FPS | Bandwidth |
|------------|---------------|------------|------------|-----------|
| Main viewport (Pixel Streaming) | N/A | H.264 encoded | 30-60 | 5-15 Mbps |
| RGB Camera (1920x1080) | 8.3 MB | ~150 KB (JPEG Q80) | 20-30 | 3-4.5 MB/s |
| RGB Camera (640x480) | 1.2 MB | ~30 KB (JPEG Q80) | 30 | ~900 KB/s |
| Depth Camera (640x480) | 1.2 MB | ~50 KB (PNG) | 20 | ~1 MB/s |
| LiDAR (300K points) | 4.8 MB | ~2 MB (binary) | 10-20 | 20-40 MB/s |
| LiDAR (64K points) | 1 MB | ~500 KB (binary) | 20 | ~10 MB/s |
| Radar | ~2 KB | ~2 KB | 20 | ~40 KB/s |
| IMU/GNSS | ~100 B | ~100 B | 20-50 | ~5 KB/s |
| Telemetry (all actors) | ~10 KB | ~5 KB | 20 | ~100 KB/s |

### 4.2 Latency Budget

| Component | Target | Strategy |
|-----------|--------|----------|
| Server render | <33ms | UE5 GPU rendering (already optimized) |
| Image compression | <10ms | GPU-accelerated NVJPEG / hardware encoder |
| Network transfer | <50ms | Low-latency WebSocket, binary frames |
| Client decode/render | <16ms | OffscreenCanvas + Web Workers |
| **Total end-to-end** | **<110ms** | Acceptable for monitoring; tighter for control |

### 4.3 Client-Side Optimization Priorities

1. **Web Workers** for all data parsing (image decode, point cloud processing, telemetry aggregation)
2. **OffscreenCanvas** for sensor image rendering (avoids main thread blocking)
3. **SharedArrayBuffer** + **Atomics** for zero-copy data transfer between workers
4. **requestAnimationFrame** gating — never render faster than display refresh
5. **Adaptive quality** — reduce resolution/FPS when client CPU/GPU is saturated
6. **Binary WebSocket frames** — no JSON for sensor data; use ArrayBuffer with typed views
7. **Object pooling** for Three.js geometries and materials (LiDAR point clouds)
8. **Virtualized lists** for actor/sensor inventories with many items
9. **React.memo** + **useRef** for high-frequency telemetry displays
10. **Code splitting** — lazy load 3D renderers, chart libraries, map components

---

## 5. Required Infrastructure

### Server Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| GPU | NVIDIA GTX 1080 | NVIDIA RTX 3080+ |
| VRAM | 8 GB | 12+ GB |
| CPU | 8 cores | 16+ cores |
| RAM | 16 GB | 32+ GB |
| Storage | 100 GB SSD | 200+ GB NVMe |
| Network | 100 Mbps | 1 Gbps |
| OS | Ubuntu 22.04 | Ubuntu 22.04 |
| UE5 | Required (5.x fork) | Required |

### Software Stack

| Layer | Technology |
|-------|-----------|
| Simulation Engine | UE5 + CARLA Plugin |
| Pixel Streaming | UE5 Pixel Streaming Plugin + Signaling Server |
| Bridge/Middleware | Python (FastAPI + asyncio) or Node.js |
| WebSocket Server | Python `websockets` / Node `ws` / `socket.io` |
| REST API | FastAPI (Python) or Express (Node.js) |
| Frontend Framework | Vite + React 19 (TypeScript, client-side SPA) |
| UI Components | shadcn/ui v4 + Radix + Tailwind CSS v4 |
| 3D Rendering | Three.js (for LiDAR, point clouds, minimap) |
| State Management | Zustand |
| Charts | Recharts or lightweight D3 |
| Containerization | Docker + Docker Compose |

---

## 6. Architecture Decision Records

### ADR-1: Pixel Streaming for Main Viewport
**Decision:** Use UE5 Pixel Streaming for the primary 3D viewport.
**Rationale:** The user requirement is "identical rendering" — only streaming the actual UE5 output guarantees this. WebGL reconstruction would produce inferior visuals.
**Trade-off:** Higher bandwidth usage, but acceptable for LAN/cloud deployment.

### ADR-2: WebSocket Bridge for Sensor Data
**Decision:** Build a Python middleware that connects to CARLA's TCP streaming server and re-broadcasts data over WebSocket.
**Rationale:** CARLA's native streaming uses a custom TCP protocol with MessagePack serialization. Browsers cannot connect directly. A bridge translates and compresses the data.
**Implementation:** The bridge subscribes to CARLA sensors via the Python API (`sensor.listen(callback)`), compresses camera frames, and publishes via WebSocket.

### ADR-3: REST API for Command & Control
**Decision:** Expose simulation control (spawn, destroy, weather, map loading, etc.) via a REST API built with FastAPI.
**Rationale:** Command-response patterns map naturally to HTTP. REST is well-suited for non-streaming operations.

### ADR-4: React + shadcn for Frontend
**Decision:** Use Vite + React + shadcn/ui + Tailwind CSS (pure client-side SPA).
**Rationale:** Modern, performant, accessible component library. No SSR overhead for a real-time simulation dashboard. TypeScript ensures type safety for complex data structures. Zustand provides lightweight state management.

---

## 7. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| High bandwidth for multiple camera streams | Performance degradation | Adaptive quality, resolution presets, selective subscription |
| Pixel Streaming latency too high for vehicle control | Poor user experience | Provide latency indicator; for critical control, use direct Python API |
| LiDAR point cloud overwhelms browser | UI freeze | Web Workers, LOD, point budget limits, progressive rendering |
| UE5 Pixel Streaming plugin not in current CARLA fork | Blocker | Add plugin to `.uproject`; may require UE5 source build |
| Multiple simultaneous clients overload server | Server crash | Rate limiting, max client cap, load balancing with multiple instances |
| WebSocket connection drops | Data loss | Auto-reconnect with exponential backoff, last-known-state caching |

---

## 8. Conclusion

Building a CARLA web version is **fully feasible** with the following architecture:

1. **UE5 runs on the server** — this is non-negotiable for rendering fidelity
2. **Pixel Streaming** delivers the main 3D viewport to the browser as video
3. **A Python/Node bridge** translates CARLA's TCP sensor streams to WebSocket
4. **REST API** handles command & control (spawn, weather, scenarios, etc.)
5. **React + shadcn frontend** provides the UI with sensor panels, controls, and telemetry
6. **All CARLA features** (19 sensor types, traffic manager, weather, recording, scenarios) can be fully exposed through the web interface

The primary engineering challenges are **bandwidth optimization** for multi-sensor streaming and **latency minimization** for interactive control.
