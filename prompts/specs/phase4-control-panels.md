# Phase 4: Control Panels — Full Simulation Control from Browser

## Overview

The codebase already has most control components built. This phase verifies each one actually works end-to-end (button click → API call → CARLA responds → UI updates), and fixes or completes anything that's broken or placeholder.

**Estimated scope**: 10+ existing components to verify, ~3-5 to substantially fix.

---

## What Already Exists

| Component | File | Location | Bridge API |
|-----------|------|----------|------------|
| SimulationControls | `controls/SimulationControls.tsx` | TopBar | `POST /api/simulation/{play,pause,step}` |
| SpawnPanel | `controls/SpawnPanel.tsx` | Dialog | `POST /api/actors/spawn/{vehicle,walker,sensor}` |
| WeatherControls | `controls/WeatherControls.tsx` | TopBar | `POST /api/world/weather` |
| MapControls | `controls/MapControls.tsx` | TopBar | `POST /api/world/load` |
| VehicleControls | `controls/VehicleControls.tsx` | RightPanel | `POST /api/actors/{id}/control` |
| RecordingControls | `scenario/RecordingControls.tsx` | TopBar | `POST /api/recording/*` |
| TrafficManagerPanel | `actors/TrafficManagerPanel.tsx` | Dialog | `POST /api/traffic/*` |
| ActorDetails | `actors/ActorDetails.tsx` | RightPanel | `GET /api/actors/{id}` |
| LeftPanel (actor list) | `layout/LeftPanel.tsx` | Sidebar | `GET /api/actors` |
| CommandPalette | `shared/CommandPalette.tsx` | Dialog (Ctrl+K) | Various |

---

## Verification Process for Each Component

For EACH component in the table above:

### Step 1: Read the Component Code
Read the file completely. Understand:
- What shadcn components it uses
- What API calls it makes
- What store state it reads/writes
- What error handling it has

### Step 2: Test the Happy Path with Playwright
```typescript
// Example: test simulation play/pause
test("simulation play/pause works", async ({ page }) => {
  await page.goto("http://127.0.0.1:58336")
  await page.waitForTimeout(3000)
  
  // Find and click the Play button
  const playBtn = page.locator("button").filter({ hasText: /play/i }).first()
  await playBtn.click()
  await page.waitForTimeout(1000)
  
  // Verify: the simulation status should reflect "playing"
  // Take screenshot to confirm visual state change
  await page.screenshot({ path: "/tmp/carla-play.png" })
  
  // Find and click Pause
  const pauseBtn = page.locator("button").filter({ hasText: /pause/i }).first()
  await pauseBtn.click()
  await page.waitForTimeout(1000)
  
  await page.screenshot({ path: "/tmp/carla-pause.png" })
})
```

### Step 3: Test Error Handling
- What happens when the bridge is unreachable?
- What happens when CARLA is disconnected?
- Does the UI show a toast error? Or does it silently fail?

### Step 4: Verify shadcn Compliance
- All buttons use `<Button>` from shadcn
- All inputs use `<Input>`, `<Slider>`, `<Select>`, `<Switch>` from shadcn
- All modals use `<Dialog>` or `<AlertDialog>` from shadcn
- All dropdowns use `<DropdownMenu>` or `<Select>` from shadcn
- Loading states use `<Spinner>` or disabled Button
- Errors show via `toast.error()` from Sonner

---

## Specific Component Specs

### 4-1: SimulationControls

**Expected UI elements:**
- Play button (green highlight when simulation is running)
- Pause button (yellow highlight when paused)
- Step button (disabled when not in sync mode)
- Speed selector: `Select` with options 0.5x, 1x, 2x, 5x, 10x
- Sync mode toggle: `Switch` + `Label`

**API calls:**
```
POST /api/simulation/play    → starts simulation
POST /api/simulation/pause   → pauses simulation
POST /api/simulation/step    → advances one frame (sync mode only)
POST /api/simulation/settings → { sync_mode: bool, fixed_delta: float }
```

**Verify with curl:**
```bash
# Play
curl -X POST http://127.0.0.1:58337/api/simulation/play
# Pause
curl -X POST http://127.0.0.1:58337/api/simulation/pause
# Step
curl -X POST http://127.0.0.1:58337/api/simulation/step
# Check status
curl http://127.0.0.1:58337/api/simulation/status
```

### 4-2: WeatherControls

**Expected UI elements:**
- Preset buttons: at least ClearNoon, Rain, Night, Sunset (quick presets)
- Sliders for: cloudiness, precipitation, wind, sun_altitude, sun_azimuth, fog_density, fog_distance, wetness
- Each slider: `Slider` component + current value `Badge`
- Apply button or live-update on slider change

**API calls:**
```
GET  /api/world/weather          → current weather params
POST /api/world/weather          → { preset: "HardRainNoon" } or { params: { cloudiness: 50, ... } }
GET  /api/world/weather/presets  → list of preset names
```

**22 available presets**: ClearNoon, CloudyNoon, WetNoon, WetCloudyNoon, MidRainyNoon, HardRainNoon, SoftRainNoon, ClearSunset, CloudySunset, WetSunset, WetCloudySunset, MidRainSunset, HardRainSunset, SoftRainSunset, ClearNight, CloudyNight, WetNight, WetCloudyNight, SoftRainNight, MidRainyNight, HardRainNight, DustStorm

**Playwright verification:**
```typescript
test("weather change affects camera feed", async ({ page }) => {
  await page.goto("http://127.0.0.1:58336")
  await page.waitForTimeout(5000)
  
  // Screenshot before weather change
  await page.screenshot({ path: "/tmp/carla-weather-before.png" })
  
  // Change weather to heavy rain via API
  await fetch("http://127.0.0.1:58337/api/world/weather", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ preset: "HardRainNoon" })
  })
  
  await page.waitForTimeout(3000)
  
  // Screenshot after — should look different (darker, rain effects)
  await page.screenshot({ path: "/tmp/carla-weather-after.png" })
  
  // The two screenshots should be visually different
})
```

### 4-3: MapControls

**Expected UI:**
- Current map name in `Badge`
- Map selector `Select` dropdown with available maps
- Load button with `AlertDialog` confirmation ("Loading a new map will destroy all actors. Continue?")
- Loading state: `Spinner` during map load (can take 10-30 seconds)

**API:**
```
GET  /api/world/maps     → { maps: ["Town01", "Town01_Opt", "Town02", ...] }
POST /api/world/load     → { map_name: "Town03_Opt" }  // 30s timeout
```

### 4-4: SpawnPanel

**Expected UI:**
- Tabs: Vehicles / Walkers / Sensors
- Vehicle tab: Blueprint `Select` (filterable `Command` search), transform inputs, autopilot `Checkbox`, Spawn `Button`
- Walker tab: Blueprint `Select`, transform inputs, Spawn `Button`
- Sensor tab: Type `Select`, parent actor `Select`, transform inputs, auto-subscribe `Checkbox`, Spawn `Button`
- Batch spawn: "Spawn 10 vehicles" button
- Random spawn point option

**API:**
```
GET  /api/blueprints/vehicles → list of vehicle blueprints
GET  /api/blueprints/walkers  → list of walker blueprints
GET  /api/blueprints/sensors  → list of sensor blueprints
POST /api/actors/spawn/vehicle → { blueprint: "vehicle.tesla.model3", autopilot: true }
POST /api/actors/spawn/walker  → { blueprint: "walker.pedestrian.0001" }
POST /api/actors/spawn/sensor  → { type: "sensor.camera.rgb", parent_id: 171, ... }
```

### 4-5: ActorDetails + VehicleControls

**Expected UI when a vehicle is selected in LeftPanel:**
- Actor info: ID, type_id, type classification
- Transform: position (x,y,z) + rotation (pitch,yaw,roll) in `font-mono`
- Velocity: (vx,vy,vz) + speed in km/h
- Vehicle controls:
  - Throttle `Slider` (0 to 1)
  - Brake `Slider` (0 to 1)
  - Steer `Slider` (-1 to 1)
  - Hand brake `Switch`
  - Reverse `Switch`
  - Autopilot `Switch`
- Destroy `Button` (variant="destructive")

**API:**
```
GET    /api/actors/{id}          → actor details
POST   /api/actors/{id}/control  → { throttle: 0.5, steer: 0.1, brake: 0 }
POST   /api/actors/{id}/autopilot → { enabled: true }
DELETE /api/actors/{id}          → destroy actor
```

### 4-6: CommandPalette

**Verify all items work:**
- Simulation: Play, Pause, Step → API calls
- Weather presets → weather API
- Navigation: Settings (link to /settings), Spawn Vehicle (open SpawnPanel)
- Any disabled items → enable them or provide clear "not available" reason

---

## Error Handling Pattern

**Every API call in every component MUST follow this pattern:**

```typescript
import { toast } from "sonner"

async function handlePlay() {
  try {
    await carlaApi.play()
    toast.success("Simulation playing")
  } catch (error) {
    toast.error("Failed to start simulation", { 
      description: error instanceof Error ? error.message : "Unknown error" 
    })
  }
}

// For long operations:
async function handleLoadMap(mapName: string) {
  const toastId = toast.loading(`Loading map ${mapName}...`)
  try {
    await carlaApi.loadMap(mapName)
    toast.success(`Map ${mapName} loaded`, { id: toastId })
  } catch (error) {
    toast.error("Map load failed", { 
      id: toastId,
      description: error instanceof Error ? error.message : "Unknown error" 
    })
  }
}
```

---

## Acceptance Criteria

1. Play/Pause/Step buttons work and UI reflects state change
2. Weather presets change the CARLA weather (visible in camera feed — Playwright verify)
3. Map selector lists available maps and can load a new map
4. Vehicle spawn works — new vehicle appears in actor list and 3D viewport
5. Vehicle controls (throttle/steer/brake) affect the selected vehicle
6. Autopilot toggle works
7. Actor destroy removes from list and 3D viewport
8. All error cases show toast notifications (not silent failures)
9. All components use shadcn UI primitives
10. **All verified with Playwright — not just code review**
