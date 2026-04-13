# Prompt 06 — Main Viewport & Pixel Streaming Integration

## Context

Sensor rendering components are built (Prompt 05). Now integrate UE5 Pixel Streaming for the main 3D viewport that shows identical rendering quality to the native CARLA client.

Read before starting:
- `Docs/agents/carla_web_implementation_prompt.md` — MainViewport.tsx section, Pixel Streaming details
- `Docs/agents/carla_web_feasibility_study.md` — Pixel Streaming architecture, fallback strategy

---

## Task

Build the main 3D viewport with UE5 Pixel Streaming and a camera-based fallback.

### 1. Pixel Streaming Client (`src/components/viewport/PixelStreamingClient.tsx`)

Integrate UE5's Pixel Streaming JavaScript library:

- Download/include the Pixel Streaming frontend library from UE5 (typically `lib-pixelstreamingfrontend`)
- The signaling server URL is configurable (default: `ws://localhost:80`)
- Establish WebRTC connection via the signaling server
- Render the incoming video stream to a `<video>` element
- Forward mouse events (move, click, scroll) to UE5 for spectator camera control
- Forward keyboard events (WASD, arrow keys, QE for up/down) for spectator movement
- Handle connection lifecycle: connecting → connected → streaming → disconnected
- Auto-reconnect on disconnect (exponential backoff)

```typescript
interface PixelStreamingClientProps {
  signalingUrl: string
  onConnectionChange: (status: 'connecting' | 'connected' | 'streaming' | 'disconnected') => void
  onStats: (stats: { fps: number; bitrate: number; latency: number }) => void
}
```

### 2. Camera Fallback (`src/components/viewport/CameraFallback.tsx`)

If Pixel Streaming is not available (plugin not enabled, or connection fails):
- Spawn a high-resolution RGB camera (1920x1080, FOV 90) attached to the spectator actor
- Stream via the existing WebSocket sensor pipeline
- Display on a full-viewport `<canvas>` (same as CameraView but larger)
- Provide camera movement controls via keyboard → REST API calls to move spectator
- Show a warning banner: "Pixel Streaming unavailable — using camera fallback (reduced quality)"
- Lower FPS (20-30) and noticeable latency, but functional

### 3. Main Viewport (`src/components/viewport/MainViewport.tsx`)

The primary viewport component that fills the center panel:

```typescript
interface MainViewportProps {
  className?: string
}
```

Implementation:
- Try Pixel Streaming first; if unavailable after 5s timeout, fall back to camera mode
- Fill the entire available space (`w-full h-full`)
- Overlay HUD elements on top of the video/canvas using absolute positioning:
  - **Top-left:** Current weather icon + temperature feel
  - **Top-right:** FPS, bitrate, latency badges
  - **Bottom-left:** Speed (km/h), gear indicator, steering angle — only if following a vehicle
  - **Bottom-center:** Compass heading bar
  - **Bottom-right:** Coordinates (X, Y, Z) of spectator
- HUD elements use `pointer-events-none` (don't block video interaction)
- HUD text uses `font-mono`, `text-shadow` for readability over any background
- Show "Connecting to simulation..." skeleton with `Spinner` when not yet streaming

### 4. Viewport Overlay (`src/components/viewport/ViewportOverlay.tsx`)

The transparent HUD layer:
- All numeric values update via `useRef` (no React re-renders)
- Compass: thin horizontal bar with N/S/E/W markers, current heading indicator
- Speed: large monospace number (e.g., "73 km/h"), gear below it
- Coordinates: `X: 123.4  Y: 567.8  Z: 12.3` in small monospace
- All elements: semi-transparent dark background (`bg-black/40 backdrop-blur-sm rounded-md px-2 py-1`)
- Fade in/out on mouse activity (hide after 3s of no mouse movement over viewport, show on mouse enter)

### 5. Spectator Camera Controls

When Pixel Streaming is active:
- Mouse input is forwarded directly to UE5 (handled by Pixel Streaming library)
- No additional code needed

When using camera fallback:
- WASD: move spectator forward/back/left/right
- QE: move up/down
- Mouse drag: rotate spectator view (pitch/yaw)
- Mouse scroll: adjust movement speed
- Send spectator transform updates via REST API: `POST /api/actors/:spectator_id/transform`
- Throttle API calls to 20Hz max (every 50ms)
- Implement smooth interpolation client-side between API calls

### 6. Vehicle Follow Mode

When a vehicle is selected in the actor list:
- "Follow" button appears in viewport overlay
- Click "Follow" → spectator automatically tracks the vehicle (server-side: attach spectator to vehicle with offset)
- HUD shows vehicle telemetry (speed, gear, steering)
- Click "Free Camera" to detach and return to free movement
- API call: set spectator transform relative to vehicle each tick (or use server-side attachment)

### 7. UE5 Pixel Streaming Server Setup Guide

Create `Docs/agents/pixel_streaming_setup.md` with instructions for:
1. Enabling PixelStreamingPlugin in `Unreal/CarlaUnreal/CarlaUnreal.uproject`
2. Building CARLA with the plugin
3. Running CARLA with Pixel Streaming: `./CarlaUnreal.sh -PixelStreamingIP=0.0.0.0 -PixelStreamingPort=8888`
4. Running the signaling server (included with UE5)
5. Configuring the frontend to connect to the signaling server

### 8. Quality Checklist

- [ ] Pixel Streaming video displays in the viewport when available
- [ ] Camera fallback works when Pixel Streaming is unavailable
- [ ] Automatic fallback within 5 seconds
- [ ] HUD overlay shows FPS, coordinates, compass
- [ ] HUD elements don't block video interaction
- [ ] HUD auto-hides after inactivity
- [ ] Mouse/keyboard input forwarded to UE5 (Pixel Streaming mode)
- [ ] Spectator camera movement works (fallback mode)
- [ ] Vehicle follow mode works
- [ ] Viewport fills available space without overflow
- [ ] No performance impact from HUD overlay updates
- [ ] `npm run build` passes
