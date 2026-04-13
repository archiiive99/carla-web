# Prompt 07 — Simulation Controls, Weather, Actor Management & Traffic

## Context

Viewport (Prompt 06) and sensor rendering (Prompt 05) are built. Now implement all control panels and actor management UI.

Read before starting:
- `Docs/agents/carla_web_implementation_prompt.md` — Full feature checklist, component details
- `Docs/agents/shadcn_component_mapping.md` — Sections 3.2, 3.3, 3.5, 3.6, 3.8, 3.9

Reference shadcn source: `ui/apps/v4/registry/new-york-v4/ui/slider.tsx`, `ui/apps/v4/registry/new-york-v4/ui/form.tsx`, `ui/apps/v4/registry/new-york-v4/ui/command.tsx`, `ui/apps/v4/registry/new-york-v4/ui/accordion.tsx`, `ui/apps/v4/registry/new-york-v4/examples/` for component usage patterns.

---

## Task

Build all control panels, spawn UI, actor management, and traffic manager interface.

### 1. Simulation Controls (`src/components/controls/SimulationControls.tsx`)

Integrated into the TopBar. Implement:
- **Play** button (green accent when running): calls `simulationStore.play()`
- **Pause** button (yellow accent when paused): calls `simulationStore.pause()`
- **Step** button (outline): calls `simulationStore.step()`, disabled when running
- **Speed selector** (`Select`): options 0.5x, 1x, 2x, 5x, 10x — adjusts tick rate
- **Sync mode toggle** (`Switch` with `Label`): toggle synchronous/asynchronous mode
- All buttons show keyboard shortcut hints in `Tooltip` (Space, N)
- Disable all controls when disconnected
- Show `Spinner` during pending operations (map load, etc.)

### 2. Weather Controls (`src/components/controls/WeatherControls.tsx`)

Accessible via a weather button in TopBar that opens a `Popover` or `Sheet`:

**Preset section:**
- `Select` dropdown with all 22 CARLA weather presets grouped by time of day:
  - Noon: ClearNoon, CloudyNoon, WetNoon, WetCloudyNoon, MidRainyNoon, HardRainNoon, SoftRainNoon
  - Sunset: ClearSunset, CloudySunset, WetSunset, WetCloudySunset, MidRainSunset, HardRainSunset, SoftRainSunset
  - Night: ClearNight, CloudyNight, WetNight, WetCloudyNight, SoftRainNight, MidRainyNight, HardRainNight
  - Special: DustStorm
- Selecting a preset calls `simulationStore.setWeatherPreset(name)`

**Advanced section** (inside `Collapsible`, collapsed by default):
All parameters as labeled `Slider` components with numeric readout:

| Parameter | Range | Step | Unit |
|-----------|-------|------|------|
| Sun Altitude | -90 to 90 | 1 | degrees |
| Sun Azimuth | 0 to 360 | 1 | degrees |
| Cloudiness | 0 to 100 | 1 | % |
| Precipitation | 0 to 100 | 1 | % |
| Precipitation Deposits | 0 to 100 | 1 | % |
| Wind Intensity | 0 to 100 | 1 | % |
| Fog Density | 0 to 100 | 1 | % |
| Fog Distance | 0 to 500 | 5 | m |
| Fog Falloff | 0 to 5 | 0.1 | — |
| Wetness | 0 to 100 | 1 | % |
| Dust Storm | 0 to 100 | 1 | % |
| Scattering Intensity | 0 to 5 | 0.1 | — |
| Mie Scattering Scale | 0 to 5 | 0.1 | — |
| Rayleigh Scattering Scale | 0 to 5 | 0.1 | — |

- Each slider: debounced 300ms before calling API
- Show current value next to slider in monospace
- "Reset to preset" button at the bottom

### 3. Spawn Panel (`src/components/controls/SpawnPanel.tsx`)

Opens as a `Dialog` from the "Spawn Actor" button in the left panel:

**Tabs:** Vehicles | Walkers | Sensors | Props

**Vehicle tab:**
- Blueprint selector: shadcn `Command` (searchable combobox)
  - Load blueprints from `GET /api/blueprints/vehicles`
  - Show blueprint ID (e.g., "vehicle.tesla.model3") with optional thumbnail
  - Filter by make/type
- Spawn position:
  - Option A: "Random spawn point" `Button` (picks from `GET /api/world/spawn-points`)
  - Option B: Manual coordinates (`Input` x3 for X, Y, Z)
- Color: random or specific (if blueprint supports it)
- Autopilot: `Checkbox` to enable immediately
- "Spawn" `Button` (variant: `default`) → calls `actorStore.spawnVehicle()`
- Show toast (`Sonner`) on success/failure

**Walker tab:**
- Same pattern: blueprint selector, position, spawn button
- AI controller: `Checkbox` to enable pedestrian AI

**Sensor tab:**
- Sensor type selector: `Select` grouped by category (Cameras, LiDAR, Radar, IMU, GNSS, Events)
- Parent actor: `Select` showing all existing vehicles/walkers
- Transform relative to parent: X, Y, Z position + pitch, yaw, roll rotation inputs
- Sensor-specific attributes: dynamically generated `Form` based on sensor type:
  - Cameras: `image_size_x`, `image_size_y`, `fov`, `shutter_speed`, etc.
  - LiDAR: `channels`, `range`, `points_per_second`, `rotation_frequency`, `upper_fov`, `lower_fov`
  - Radar: `horizontal_fov`, `vertical_fov`, `range`, `points_per_second`
- Auto-subscribe: `Checkbox` to immediately subscribe to sensor feed after spawn
- "Spawn & Attach" `Button`

### 4. Actor Details — Right Panel (`src/components/actors/ActorDetails.tsx`)

When an actor is selected in the left panel, populate the right panel:

**Common sections (all actors):**
- Header: actor type icon + type_id + ID badge
- Transform section (`Accordion` item): position X/Y/Z, rotation P/Y/R as readonly `Input` fields (monospace)
- Velocity section: speed (km/h), velocity vector, angular velocity — all `NumericReadout`
- Bounding box: extent X/Y/Z display
- Actions: "Teleport Spectator Here" `Button`, "Destroy" `Button` (variant: `destructive` with `AlertDialog` confirmation)

**Vehicle-specific (`src/components/actors/VehicleDetails.tsx`):**
- Control section: throttle/steer/brake sliders (readonly, showing current state) or writable for manual control
- Autopilot toggle: `Switch`
- Lights section: `ToggleGroup` for Position, LowBeam, HighBeam, Brake, LeftBlinker, RightBlinker, Reverse, Fog, Interior
- Doors section: Open/Close `Button` for each door (FL, FR, RL, RR, All)
- Gear display: current gear number + reverse indicator
- Physics section (in `Collapsible`): mass, drag, center of mass — advanced editing via `Dialog`

**Sensor-specific (`src/components/actors/SensorDetails.tsx`):**
- Sensor type and parent actor display
- Configuration: all sensor attributes as editable `Input`/`Select`/`Slider` fields
- Subscribe/Unsubscribe toggle `Button`
- "Open in Sensor Panel" `Button`

### 5. Traffic Manager Panel (`src/components/actors/TrafficManagerPanel.tsx`)

Accessible via a "Traffic" button in the left panel or a `Sheet`:

**Global settings:**
- Global speed difference: `Slider` (-50% to +50%)
- Hybrid physics mode: `Switch`
- Hybrid physics radius: `Slider` (0-200m)
- Sync mode: `Switch`
- Seed: `Input` (number)

**Per-vehicle settings table:**
Use shadcn `Table`:
- Columns: Vehicle ID | Type | Speed % | Auto Lane | Ignore Lights % | Ignore Signs % | Ignore Walkers % | Actions
- Each row: editable inline (`Input` in table cell) or click to expand
- Batch actions: "Set all to autopilot", "Reset all to defaults"

### 6. Vehicle Control via Keyboard (`src/components/controls/VehicleControls.tsx`)

When a vehicle is selected and "Manual Control" is toggled on:
- W/Up: throttle (0→1 on press, 0 on release, linear ramp)
- S/Down: brake
- A/Left: steer left (-1)
- D/Right: steer right (+1)
- Space: handbrake
- R: toggle reverse
- Send `VehicleControl` to API at 20Hz (every 50ms) while keys are held
- Show active key indicators on screen (highlight pressed keys)
- Disable when focus is in an input field

### 7. Map Controls

Integrated into simulation controls or a separate `Dialog`:
- Map selector: `Command` (searchable) with available maps from `GET /api/world/maps`
- "Load Map" `Button` with loading state (map loading can take 10-30 seconds)
- Map layer toggles: `Checkbox` list for each map layer (Buildings, Foliage, Props, etc.)
- Show current map name in TopBar

### 8. Recording Controls (`src/components/scenario/RecordingControls.tsx`)

Panel in a `Popover` or `Sheet`:
- **Record:** `Button` that turns red with pulsing dot when active. Filename `Input`.
- **Recordings list:** `ScrollArea` with file list from `GET /api/recording/files`
- **Replay transport:**
  - Play/Pause `Button`
  - Seek `Slider` (0 to duration)
  - Speed `Select` (0.5x, 1x, 2x, 5x)
  - Camera selector `Select` (available actor IDs)
  - "Stop Replay" `Button`

### 9. Command Palette (`src/components/shared/CommandPalette.tsx`)

Global command palette triggered by Cmd+K (or Ctrl+K):
- Use shadcn `Command` component as a full-screen dialog
- Search across: actors (by type/ID), actions (play, pause, spawn, weather presets), settings
- Recent commands at the top
- Keyboard navigation (up/down arrows, Enter to execute)
- Categories: "Simulation", "Actors", "Weather", "Sensors", "Navigation"

### 10. Quality Checklist

- [ ] Play/Pause/Step controls work and reflect actual simulation state
- [ ] Weather presets apply correctly via API
- [ ] All 15+ weather parameter sliders work with debounced API calls
- [ ] Vehicle spawn dialog works (blueprint search, position, autopilot)
- [ ] Walker spawn dialog works
- [ ] Sensor spawn dialog generates correct attribute form per sensor type
- [ ] Actor details panel shows correct data for selected actor
- [ ] Vehicle lights toggle group works
- [ ] Traffic Manager table displays and edits per-vehicle settings
- [ ] Keyboard vehicle control sends commands at 20Hz
- [ ] Map loading works with loading state indicator
- [ ] Recording start/stop works
- [ ] Replay transport controls work
- [ ] Command palette (Cmd+K) works with search
- [ ] All dialogs are accessible (keyboard navigation, focus trapping)
- [ ] All destructive actions (destroy actor, reload map) have confirmation dialogs
- [ ] `npm run build` passes
