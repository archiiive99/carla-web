# CARLA Web

React + Vite + Three.js front-end for the CARLA driving simulator. Renders the simulation
world client-side (single-source 3D architecture) and streams sensor data via WebSocket
from a FastAPI bridge.

## Architecture

```
┌─────────────────────┐      ┌─────────────────────────┐      ┌──────────────────┐
│  CARLA UE5 Server   │◄────►│  Bridge (FastAPI/uvicorn)│◄────►│  Browser (Vite)  │
│  (port 58338 RPC)   │      │  (port 58337 HTTP/WS)    │      │  (port 58336)    │
└─────────────────────┘      └─────────────────────────┘      └──────────────────┘
                                       │                              │
                                       │  /api REST + /ws binary      │
                                       │  (sensor data, actor state,  │
                                       │   weather, map, recording)   │
                                       └──────────────────────────────┘
```

Single Three.js scene. Every camera viewport (main 3D, chase-cam, FPV, birdseye, and
every sensor-cell RGB camera) is a `PerspectiveCamera` rendering the same shared scene
via `gl.setViewport` + `gl.setScissor` — no per-cell duplicate scenes, no server-side
RGB JPEG stream for the primary path. Non-visual sensor streams (LIDAR, RADAR, IMU,
GNSS, depth, segmentation, collision, lane-invasion, DVS) still come over WS in a
framed binary protocol.

## Quick start

```bash
# From repo root:
./start_streaming.sh                # Launches CARLA + Bridge + Frontend in tmux session "carla-web"
./start_streaming.sh --status       # Health check
./start_streaming.sh --kill         # Stop everything

# To develop the frontend only (against an already-running bridge):
cd carla-web
npm install        # first time
npx vite           # starts Vite dev server on :58336, proxies /api + /ws to :58337
```

## Directory structure

```
src/
├── components/
│   ├── actors/          # Actor list, properties, vehicle/sensor details
│   ├── controls/        # Simulation / Weather / Map / Spawn + VehicleControls (WASD HUD)
│   ├── layout/          # TopBar, StatusBar, Left/Right/Bottom resizable panels
│   ├── map/             # MiniMap + OpenDriveViewer
│   ├── scenario/        # RecordingControls
│   ├── sensors/         # SensorPanel + cell types (Camera/Lidar/Radar/Gnss/Imu/Seg/Collision/Lane)
│   ├── shared/          # CommandPalette, ConnectionOverlay, EventLog, PerformanceOverlay, TelemetryPanel
│   ├── ui/              # shadcn/ui primitives (Button, Card, Input, Dialog, Popover, etc.)
│   └── viewport/        # WorldCanvas (root Canvas), WorldScene, controllers, scene-environment,
│                        # scene-palette, city-environment, actor-rendering, carla-assets
├── contexts/            # WorkerProvider (shared Web Workers for WS + image decoding)
├── hooks/               # useSensorData, useSimulationStore bindings, etc.
├── lib/                 # carla-api, bridge-url, data-export, theme-colors, utils
├── stores/              # zustand stores (actor, sensor, simulation, performance, UI, viewport, event)
├── types/               # Shared TypeScript types (carla, ws, api)
├── workers/             # WS receiver worker + image decoder worker
├── routes/              # Top-level page components (SimulationPage, SettingsPage)
├── index.css            # Tailwind v4 + @theme inline semantic token layer
└── main.tsx             # React entry
```

Key architectural files:
- `components/viewport/WorldCanvas.tsx` — the single root `<Canvas>`, mounted once at layout root
- `components/viewport/WorldScene.tsx` — DOM rect that the main viewport compositor tracks
- `stores/viewportStore.ts` — registry of viewport rects (main + sensor cells)
- `components/viewport/scene-palette.ts` — source of truth for Three.js material colors
- `components/viewport/carla-assets/` — blueprint → glTF lookup + city geometry

## Design system

shadcn/ui + Tailwind CSS v4 with `@theme inline` semantic tokens in `index.css`.

- Radius scale: `rounded-sm` (6px) / `md` (8px) / `lg` (10px) / `xl` (14px) / `full` (pill)
- Color semantics: `primary`, `secondary`, `muted`, `accent`, `destructive`, `success`,
  `warning`, `info`, `overlay-bg`, `overlay-fg`, `chart-1..7`, `sidebar-*`
- Typography: body ≥ 14px, `text-2xs` (10px) / `text-3xs` (9px) for dense data
- Hit targets: shadcn native (`icon-xs` 24px / `icon-sm` 32px / `icon` 36px)

Full contract: `prompts/specs/ui-design-system-adherence.md`.

## Rendering parity

Ongoing work to match UE5's visual output in the browser. See `reports/dashboard.md` for
per-iteration PSNR / SSIM / ΔE numbers and `prompts/specs/rendering-100-percent-parity.md`
for the acceptance bar.

## Development conventions

- **Single-source architecture** — never add a second `<Canvas>` (exception: Lidar preview).
  Instead, add a `<View>` (or `useRegisterViewport`) that shares the root scene.
- **shadcn primitives only** — no ad-hoc styled `<button>` / `<div role="button">`.
- **Semantic tokens only** — `text-success` not `text-green-500`; `bg-card` not
  `bg-neutral-900`. Canvas `fillStyle` and Three.js material `color=` exempt (see
  `scene-palette.ts`).
- **WS protocol** is binary-framed — see `carla-web-bridge/src/ws/protocol.py` and
  `src/workers/ws-receiver.worker.ts` for the frame format.
- **TypeScript strict** with `erasableSyntaxOnly`.

## Scripts

```bash
npx tsc -p tsconfig.app.json --noEmit    # Type-check
npx vite build                            # Production build
npx vite                                  # Dev server (HMR)
npx playwright test                       # E2E (if configured)
```

## Contributing / known gaps

See `reports/iter-queue.md` for the live work queue, and the `prompts/specs/` specs for
agent-owned workstreams (A–E backend, rendering harness, UI adherence).

Stubs currently showing "not wired" badges in the UI: VehicleDetails Doors,
MapControls Map Layers, TrafficManagerPanel Per-Vehicle settings, RecordingControls
replay scrubber. These need bridge-side endpoint work before the UI can light up.
