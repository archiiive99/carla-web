# Prompt 08 — MiniMap, Route Editor, OpenDRIVE & Advanced Features

## Context

Core controls and actor management are built (Prompt 07). Now implement the remaining advanced features: minimap, route planning, OpenDRIVE viewer, data export, and detachable windows.

Read before starting:
- `Docs/agents/carla_web_implementation_prompt.md` — Feature checklist (remaining items)
- `Docs/agents/shadcn_component_mapping.md` — Section 3.10 (Map components)

---

## Task

### 1. MiniMap (`src/components/map/MiniMap.tsx`)

2D top-down view of all actor positions:

- Use `<canvas>` with Canvas 2D context (lightweight, no Three.js)
- Fills a resizable panel (can be placed in bottom panel or as a floating overlay)
- Coordinate system: CARLA uses left-handed, X-forward, Y-right — map to screen X-right, Y-down
- Auto-scale to fit all actors with 20% padding
- Draw:
  - Road network as gray polylines (from OpenDRIVE topology if loaded)
  - Vehicles as colored arrows (direction = heading): blue=ego/selected, green=NPC, orange=autopilot
  - Walkers as small yellow dots
  - Sensors as small cyan triangles (pointing in sensor direction)
  - Traffic lights as colored circles (red/yellow/green matching state)
  - Selected actor: highlighted ring, larger
  - Spectator position: white crosshair
- Interactions:
  - Pan: click + drag
  - Zoom: scroll wheel (min zoom: 10m viewport, max: full map)
  - Click on actor: select it (sync with actorStore)
  - Right-click: context menu with "Teleport spectator here", "Spawn vehicle here"
- Update actor positions from telemetry-aggregator worker at 10Hz
- Use `requestAnimationFrame` for smooth rendering
- Show scale bar in corner (e.g., "50m")

### 2. Route Editor (`src/components/map/RouteEditor.tsx`)

Visual waypoint placement for vehicle routes:

- Overlay on the MiniMap (toggle mode: "View" vs "Edit Route")
- In edit mode:
  - Click on map to place waypoint (numbered marker)
  - Drag waypoint to reposition
  - Right-click waypoint to delete
  - Double-click to finish route
  - Show connecting lines between waypoints
- Show the planned route returned from `POST /api/map/route` as a highlighted path
- Display road options at each segment (LaneFollow, TurnLeft, TurnRight, etc.) as small labels
- "Apply Route" `Button` → sends route to Traffic Manager for the selected vehicle
- "Clear Route" `Button`
- Export route as JSON

### 3. OpenDRIVE Viewer (`src/components/map/OpenDriveViewer.tsx`)

Road network visualization from OpenDRIVE data:

- Fetch topology from `GET /api/map/topology` (returns waypoint pairs forming road segments)
- Render road segments as polylines on a `<canvas>` or SVG
- Color by road type: highway=wide gray, city=medium gray, junction=amber
- Show lane markings: solid white, dashed white, solid yellow, double yellow
- Intersections/junctions: highlighted areas
- Toggle layers: roads, lane markings, junctions, spawn points
- Pan and zoom (same controls as MiniMap)
- Can be displayed as a tab in the bottom panel or in a separate dialog

### 4. Detachable Sensor Windows

Allow sensor views to be "popped out" into separate browser windows:

- Right-click sensor view → "Detach to window"
- Use `window.open()` to create a new browser window
- The new window renders only the sensor view component (full window)
- Communicate between main window and detached window via `BroadcastChannel`:
  - Main → Detached: sensor data frames, subscription status
  - Detached → Main: close notification
- When detached window closes, re-attach sensor view to the grid
- Store detached window references in `uiStore`
- Handle edge case: main page reload while windows are detached (detached windows should close or show "disconnected")

### 5. Data Export

Add export capabilities for sensor data:

**Snapshot export (single frame):**
- Right-click camera view → "Save frame as PNG" → `canvas.toBlob()` → download
- Right-click LiDAR view → "Save point cloud as PLY" → generate PLY file from current Float32Array
- Export all sensor data for current frame as a ZIP file

**Continuous export (recording):**
- "Export" button in sensor panel header
- Select sensors to export
- Select format: images as JPEG/PNG, LiDAR as PLY/PCD, telemetry as CSV
- Export to a downloadable archive
- This is client-side only (saves what the browser receives)

### 6. Event Log Panel (`src/components/shared/EventLog.tsx`)

Unified event log in the bottom panel "Events" tab:

- Chronological list of all events:
  - Collision events (from collision sensor)
  - Lane invasion events
  - Actor spawn/destroy events
  - Connection events (connected, disconnected, reconnected)
  - Weather changes
  - Map loads
- Each event: timestamp, type `Badge`, description text
- Use shadcn `ScrollArea` with auto-scroll to bottom (toggle: "Auto-scroll" `Switch`)
- Filter by event type: `ToggleGroup` at the top
- Clear button
- Virtualized list for performance (>100 events)
- Export as CSV or JSON

### 7. Settings Page (`src/app/settings/page.tsx`)

Connection and application settings:

- **Connection:** Bridge URL input, Pixel Streaming signaling URL input, test connection button
- **Performance:** Target FPS selector, max point budget for LiDAR, JPEG quality preference, enable/disable adaptive quality
- **UI:** Theme (dark/light), panel layout reset, keyboard shortcut customization
- **About:** CARLA server version, bridge version, client version
- Use shadcn `Form` with `Field` components
- Settings persist to `localStorage`

### 8. Layout Persistence

Save and restore the complete layout state:
- Panel sizes (from ResizablePanelGroup)
- Panel open/closed state
- Bottom panel active tab
- Sensor grid layout (which sensors in which positions)
- Theme preference
- Connection URLs
- Store in `localStorage` under key `carla-web-layout`
- "Reset Layout" button in Settings

### 9. Responsive Behavior

For viewports < 768px width:
- Stack panels vertically instead of side-by-side
- Left and right panels become bottom sheets (swipe up)
- Sensor grid collapses to 1 column
- TopBar condenses: hide labels, show only icons
- Use shadcn's `useMobile` hook (from `ui/apps/v4/registry/new-york-v4/hooks/use-mobile.ts`)

### 10. Quality Checklist

- [ ] MiniMap shows all actors with correct positions and colors
- [ ] MiniMap pan/zoom works smoothly
- [ ] Click on MiniMap actor selects it
- [ ] Route editor allows waypoint placement and route planning
- [ ] OpenDRIVE viewer renders road network
- [ ] Sensor windows can be detached and re-attached
- [ ] Data export works (PNG for cameras, PLY for LiDAR)
- [ ] Event log displays all event types with filtering
- [ ] Settings page saves and restores all preferences
- [ ] Layout persistence works across page reloads
- [ ] Responsive layout works on narrow viewports
- [ ] `npm run build` passes
