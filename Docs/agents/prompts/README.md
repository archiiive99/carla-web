# CARLA Web — Implementation Prompts

Sequential prompts for building the CARLA Web application. Execute in order — each prompt builds on the previous ones.

## Prompt Sequence

| # | Prompt | Description | Estimated Effort |
|---|--------|-------------|-----------------|
| 00 | [Migrate to Vite+React](00_migrate_nextjs_to_vite_react.md) | **MANDATORY FIRST** — Convert from Next.js to Vite + React SPA | Day 0 |
| 01 | [Project Setup](01_project_setup.md) | Vite + React + shadcn/ui initialization, theme, directory structure | Day 1-2 |
| 02 | [Layout & Panels](02_layout_and_panels.md) | Resizable panel layout, TopBar, StatusBar, Sidebar, keyboard shortcuts | Day 3-5 |
| 03 | [Backend Bridge](03_backend_bridge.md) | Python FastAPI bridge: REST API, WebSocket, CARLA client, image compression | Day 6-10 |
| 04 | [WebSocket & Stores](04_websocket_and_stores.md) | WebSocket client, Web Workers, Zustand stores, typed API, data pipeline | Day 11-14 |
| 05 | [Sensor Rendering](05_sensor_rendering.md) | All 19 sensor display components: cameras, LiDAR (Three.js), radar, IMU, GNSS | Day 15-20 |
| 06 | [Viewport & Pixel Streaming](06_viewport_and_pixel_streaming.md) | Main 3D viewport, UE5 Pixel Streaming, camera fallback, HUD overlay | Day 21-24 |
| 07 | [Controls & Actors](07_controls_and_actor_management.md) | Weather, spawn, actor details, traffic manager, vehicle control, recording | Day 25-32 |
| 08 | [Map & Advanced](08_map_and_advanced_features.md) | MiniMap, route editor, OpenDRIVE, detachable windows, data export, settings | Day 33-38 |
| 09 | [Polish & Optimization](09_polish_and_optimization.md) | Performance audit, memory optimization, testing, accessibility, documentation | Day 39-45 |

## Supporting Documents

| Document | Purpose |
|----------|---------|
| [carla_web_implementation_prompt.md](../carla_web_implementation_prompt.md) | Master prompt with full architecture, protocol specs, and requirements |
| [carla_web_feasibility_study.md](../carla_web_feasibility_study.md) | Technical analysis: UE5 dependency, rendering options, bandwidth |
| [shadcn_component_mapping.md](../shadcn_component_mapping.md) | Every UI element mapped to specific shadcn/ui components |
| [web_development_principles.md](../web_development_principles.md) | Engineering principles and coding standards |
| [agentic_coding_guidelines.md](../agentic_coding_guidelines.md) | AI agent workflow rules |
| [carla_web_architecture.md](../carla_web_architecture.md) | High-level architecture overview |

## Key References

- **shadcn/ui source:** `ui/` (project root) — v4 registry with 57 components, 28 blocks, 1087 examples
- **CARLA source:** `LibCarla/`, `Unreal/CarlaUnreal/`, `PythonAPI/` — simulator codebase
- **CARLA Python API examples:** `PythonAPI/examples/` — reference client implementations
