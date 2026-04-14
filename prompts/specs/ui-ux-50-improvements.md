# UI/UX 50 Improvements — Comprehensive Enhancement List

Every item below is a concrete, implementable improvement. Each one must be verified with Playwright screenshots after implementation. All UI must use shadcn/ui components + Tailwind CSS + Lucide icons. No exceptions.

---

## LAYOUT & STRUCTURE (1-10)

### 1. Left Panel Actor List Overflow
**File**: `src/components/layout/LeftPanel.tsx`
**Problem**: Actor list extends to 5000+ px height, overflows viewport
**Fix**: Wrap actor list in `<ScrollArea className="flex-1 overflow-hidden">`. The panel must never exceed viewport height. Add `max-h-[calc(100vh-8rem)]` to constrain.

### 2. Resizable Panel Default Proportions
**File**: `src/components/layout/ResizableLayout.tsx`
**Problem**: Panel sizes are not optimized — viewport area too small
**Fix**: Set defaults — Left: 14%, Center: 58%, Right: 28%. Bottom panel: 28% of remaining height. All panels must have `minSize={8}` to prevent collapse to zero.

### 3. Panel Collapse Buttons
**Files**: `LeftPanel.tsx`, `RightPanel.tsx`, `BottomPanel.tsx`
**Problem**: No quick way to collapse/expand side panels to maximize viewport
**Fix**: Add a collapse toggle `Button` (chevron icon) at the edge of each panel. When collapsed, panel shrinks to a thin strip (~24px) with just the expand button. Use `Tooltip` to label each collapsed panel.

### 4. TopBar Responsive Overflow
**File**: `src/components/layout/TopBar.tsx`
**Problem**: Controls wrap or clip on narrower screens
**Fix**: Group secondary controls into a `DropdownMenu` overflow button (`MoreHorizontal` icon) when viewport width < 1400px. Primary controls (play/pause, connection status, map name) always visible.

### 5. Bottom Panel Tab Icons
**File**: `src/components/layout/BottomPanel.tsx`
**Problem**: Tab labels take too much space
**Fix**: Show icon + label on desktop (`Camera` + "Sensors"), icon-only on tablet. Use `useMediaQuery` hook. Add `Badge` with count next to "Sensors" and "Events" tabs.

### 6. Viewport Fills Available Space
**File**: `src/components/viewport/MainViewport.tsx`
**Problem**: Viewport has gaps or doesn't fill its container fully
**Fix**: Use `className="h-full w-full"` with no padding. The Three.js Canvas or camera canvas must stretch to fill 100% of the viewport container. No border, no margin.

### 7. Status Bar Compact Layout
**File**: `src/components/layout/StatusBar.tsx`
**Problem**: Status bar items may wrap or overflow
**Fix**: Use `flex-nowrap overflow-hidden` with `gap-3`. Truncate long map names with `truncate` class. Use `font-mono text-[10px]` for numeric values. Total height: exactly 24px.

### 8. Settings Page Navigation
**File**: `src/routes/SettingsPage.tsx`
**Problem**: Settings page may feel disconnected
**Fix**: Add a sticky back button `<Button variant="ghost" size="sm">` at top. Use `Card` sections with clear `CardTitle` headers. Add breadcrumb: "CARLA Web → Settings".

### 9. Fullscreen Mode
**File**: `src/components/viewport/MainViewport.tsx`
**Problem**: No proper fullscreen for the viewport
**Fix**: Double-click viewport → toggle browser fullscreen (`document.documentElement.requestFullscreen()`). Show overlay hint "Press Esc to exit fullscreen". Hide all panels in fullscreen.

### 10. Mobile/Tablet Layout
**File**: `src/components/layout/ResizableLayout.tsx`
**Problem**: Layout breaks on small screens
**Fix**: Below 1024px: collapse left+right panels by default, bottom panel becomes a pull-up `Sheet`. Below 768px: single column, viewport on top, controls in bottom `Sheet`.

---

## CAMERA & VIEWPORT (11-20)

### 11. Camera Canvas Aspect Ratio
**File**: `src/components/sensors/CameraView.tsx`
**Problem**: Canvas stretched to container size, distorting the image
**Fix**: Set `canvas.width` = actual frame width, `canvas.height` = actual frame height. Use CSS `object-fit: contain` on the canvas element. Container uses `aspect-ratio: 16/9` for consistent sizing.

### 12. Camera Resolution Badge
**File**: `src/components/sensors/CameraView.tsx`
**Fix**: Show `Badge` with `{width}x{height}` resolution in top-left corner of the camera card. Update dynamically when frame size changes.

### 13. Camera FPS Counter
**File**: `src/components/sensors/CameraView.tsx`
**Fix**: Show `Badge` with real-time FPS in top-right corner. Color: green >20, yellow >10, red ≤10. Use `font-mono text-[10px]`.

### 14. Camera Latency Indicator
**File**: `src/components/sensors/CameraView.tsx`
**Fix**: Calculate latency = `Date.now() - (frame.timestamp * 1000)`. Show as `Badge` next to FPS: "42ms". Color: green <50ms, yellow <100ms, red ≥100ms.

### 15. Three.js Viewport Mouse Controls
**File**: `src/components/viewport/CameraController.tsx`
**Must support in "orbit" mode**:
- Left click + drag → orbit rotation
- Right click + drag → panning
- Scroll wheel → zoom in/out
- Double click on actor → focus camera on that actor
- Middle mouse drag → pan
Use `OrbitControls` from `@react-three/drei` with `enableDamping={true} dampingFactor={0.1}`.

### 16. Three.js Camera Mode Overlay
**File**: `src/components/viewport/MainViewport.tsx`
**Fix**: Show current camera mode name in a subtle overlay: `<Badge variant="outline" className="absolute top-2 left-2 bg-background/60 backdrop-blur text-[10px]">Follow Camera</Badge>`

### 17. Three.js Actor Click Selection
**File**: `src/components/viewport/ActorRenderer.tsx`
**Fix**: Click on an actor mesh in 3D view → selects it in actorStore → highlights in yellow/gold → shows details in RightPanel. Use R3F `onClick` event on mesh group. Show selection ring (flat circle) under selected actor.

### 18. Three.js Actor Hover Tooltip
**File**: `src/components/viewport/ActorRenderer.tsx`
**Fix**: Hover over actor → show floating label with type + ID. Use `@react-three/drei` `<Html>` component. Appear on hover, disappear on leave. Don't show for distant actors (> 200m).

### 19. Camera View Context Menu
**File**: `src/components/sensors/CameraView.tsx`
**Fix**: Right-click on camera canvas → shadcn `ContextMenu` with:
- Save as PNG
- Save as JPEG
- Copy to Clipboard
- Toggle Fullscreen
- Switch Quality (Low/Medium/High)

### 20. Multi-View Camera Grid
**File**: `src/components/sensors/SensorPanel.tsx`
**Fix**: In Three.js mode, each grid cell can show a different camera angle without server cost. Preset buttons: "Front", "Rear", "Left", "Right", "Bird's Eye", "Interior". Each cell renders the shared scene from a different Three.js camera.

---

## CONTROLS & INTERACTION (21-30)

### 21. WASD Driving — Visual Feedback
**File**: `src/components/shared/DrivingHUD.tsx` (new)
**Fix**: When any WASD key is held, show a driving HUD at bottom-center:
- Current speed (km/h) in large `font-mono` text
- WASD key state indicator (pressed keys highlighted)
- Throttle bar (green), Brake bar (red), Steering indicator
- Gear badge: D (drive) or R (reverse)
- Wrap in `Card className="bg-background/60 backdrop-blur-md"`

### 22. Autopilot Toggle Button
**File**: `src/components/layout/TopBar.tsx` or viewport overlay
**Fix**: Prominent toggle button — `<Button variant={autopilot ? "default" : "outline"}>`. Shows `Bot` icon when autopilot active, `User` icon when manual. Pressing WASD auto-disables autopilot. Pressing T re-enables it.

### 23. Weather Quick Presets Bar
**File**: `src/components/controls/WeatherControls.tsx`
**Fix**: Row of 5 quick-select buttons: ☀️ Clear, ☁️ Cloudy, 🌧️ Rain, 🌙 Night, 🌫️ Fog. One click applies the preset. Current preset highlighted. Below: expandable sliders for fine-tuning.

### 24. Map Selector Dropdown
**File**: `src/components/controls/MapControls.tsx`
**Fix**: shadcn `Select` showing available maps. Current map shown as `Badge` in TopBar. On change: `AlertDialog` confirmation ("This will reset the simulation. Continue?"), then loading spinner during map load.

### 25. Speed Control Slider
**File**: `src/components/controls/SimulationControls.tsx`
**Fix**: `Slider` for simulation speed: 0.5x, 1x, 2x, 5x, 10x. Show current speed as `Badge`. Position next to play/pause buttons.

### 26. Actor Spawn Quick Actions
**File**: `src/components/layout/LeftPanel.tsx`
**Fix**: At top of actor list, add quick spawn buttons:
- `+ Vehicle` → spawns random vehicle with autopilot at random spawn point
- `+ Walker` → spawns random walker
- `+ 10 NPCs` → batch spawn 10 vehicles
Each button uses `Button variant="outline" size="sm"` with `Plus` icon.

### 27. Actor Destroy Confirmation
**File**: `src/components/actors/ActorDetails.tsx`
**Fix**: "Destroy" button should trigger `AlertDialog`: "Destroy actor #171? This cannot be undone." with "Cancel" and "Destroy" buttons. "Destroy All" requires typing "destroy" to confirm.

### 28. Vehicle Control Sliders
**File**: `src/components/actors/VehicleDetails.tsx`
**Fix**: When a vehicle is selected in the right panel:
- Throttle: `Slider` 0-100%
- Brake: `Slider` 0-100%
- Steer: `Slider` -100% to +100% (centered at 0)
- Handbrake: `Switch`
- Autopilot: `Switch`
Sliders send control updates on change (debounced 100ms).

### 29. Keyboard Shortcuts Dialog — Complete
**File**: `src/components/shared/KeyboardShortcuts.tsx` (new)
**Fix**: Press `?` → open `Dialog` with all shortcuts in a `Table`:
```
Space     Play/Pause
N         Step frame
W/A/S/D   Drive vehicle
1/2/3/4   Camera modes
P         Performance overlay
B         Toggle left panel
R         Toggle right panel
S         Toggle sensor panel
F         Fullscreen viewport
T         Toggle autopilot
?         This dialog
Ctrl+K    Command palette
Esc       Close/Deselect
```

### 30. Command Palette Enhancement
**File**: `src/components/shared/CommandPalette.tsx`
**Fix**: Add scenario commands:
- "Clear Weather" → ClearNoon preset
- "Rainy Night" → HardRainNight
- "Spawn 20 NPCs" → batch spawn
- "Destroy All Actors" → confirm + destroy
- "Reset Camera" → follow mode on ego
All commands must actually execute, no disabled items.

---

## VISUAL POLISH (31-40)

### 31. Dark Mode Consistency
**All component files**
**Fix**: Audit every component for hardcoded colors. Replace:
- `bg-black` → `bg-background`
- `text-white` → `text-foreground`
- `text-gray-*` → `text-muted-foreground`
- `border-gray-*` → `border-border`
- Hardcoded hex colors → CSS variable tokens

### 32. Card Styling Consistency
**All card-containing components**
**Fix**: Every data panel uses `Card` with consistent pattern:
```tsx
<Card className="h-full">
  <CardHeader className="p-3 pb-0">
    <CardTitle className="text-xs font-medium flex items-center justify-between">
      Title
      <Badge variant="outline" className="font-mono text-[10px]">value</Badge>
    </CardTitle>
  </CardHeader>
  <CardContent className="p-3 pt-2">
    {/* content */}
  </CardContent>
</Card>
```
No inconsistent padding, no mixed card styles.

### 33. Empty State Design
**All list/grid components**
**Fix**: When a list is empty (no actors, no sensors, no events), show a centered empty state:
```tsx
<div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
  <Ghost className="h-8 w-8 mb-2 opacity-50" />
  <p className="text-xs">No actors in the scene</p>
  <Button variant="outline" size="sm" className="mt-2">Spawn Vehicle</Button>
</div>
```

### 34. Loading Skeleton States
**CameraView, SensorPanel, LeftPanel, ActorDetails**
**Fix**: Before data loads, show `Skeleton` placeholders:
- Camera: `<Skeleton className="w-full aspect-video rounded" />`
- Actor list: 5 rows of `<Skeleton className="h-6 w-full" />`
- Actor details: field placeholders
- 3D viewport: centered `Spinner` on dark background

### 35. Toast Notification Consistency
**All API-calling components**
**Fix**: Every API call follows the toast pattern:
- Success: `toast.success("Vehicle spawned")`
- Error: `toast.error("Spawn failed", { description: error.message })`
- Loading: `const id = toast.loading("Loading map..."); ... toast.success("Done", { id })`
Never silently fail. Never show raw error stacks.

### 36. Connection Status Animation
**File**: `src/components/layout/TopBar.tsx`
**Fix**: Connection badge should pulse green when connected, pulse yellow when reconnecting, solid red when disconnected. Use `animate-pulse` class conditionally. Add a subtle connection quality indicator (signal bars icon based on latency).

### 37. Actor Type Icons
**File**: `src/components/layout/LeftPanel.tsx`
**Fix**: Each actor in the list shows an icon by type:
- Vehicle: `Car` icon
- Walker: `PersonStanding` icon
- Sensor: `Camera`/`Radar`/`Navigation` icon by sensor type
- Traffic Light: `TrafficCone` icon
Use Lucide icons, `h-3 w-3` size, `text-muted-foreground`.

### 38. Numeric Readout Formatting
**All components showing numeric data**
**Fix**: Use consistent formatting:
- Coordinates: 2 decimal places, `font-mono text-xs`
- Speed: integer, "km/h" suffix
- FPS: integer
- Latency: integer, "ms" suffix
- Bandwidth: auto-scale (KB/s or MB/s), 1 decimal
Create a `formatValue(value, unit)` utility in `src/lib/format.ts`.

### 39. Scrollbar Styling
**Global: `src/index.css`**
**Fix**: Style scrollbars for dark mode:
```css
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: hsl(var(--muted)); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: hsl(var(--muted-foreground)); }
```
Or use shadcn `ScrollArea` everywhere to get consistent styled scrollbars.

### 40. Focus Ring Styling
**Global**
**Fix**: Ensure all focusable elements (buttons, inputs, tabs) have visible focus rings in dark mode. shadcn handles this, but verify with keyboard navigation (Tab through all controls).

---

## DATA & FEEDBACK (41-50)

### 41. Telemetry Tab — Real Charts
**File**: `src/components/shared/TelemetryPanel.tsx` (new)
**Fix**: Replace placeholder with real Recharts area charts:
- FPS over time (60 data points, rolling)
- Latency over time
- Bandwidth over time
Each in a shadcn `Card` with current + peak values as `Badge`.

### 42. Performance Overlay HUD
**File**: `src/components/shared/PerformanceOverlay.tsx` (new)
**Fix**: Toggle with P key. Shows compact stats card floating over viewport:
- Render FPS, Simulation FPS
- Network latency, WS bandwidth
- Active sensors count
- Frame drop count
Use `Card className="bg-background/70 backdrop-blur-sm absolute top-2 right-2 z-30"`.

### 43. Actor Count Summary
**File**: `src/components/layout/TopBar.tsx` or `StatusBar.tsx`
**Fix**: Show actor count breakdown: `Vehicles: 12 | Walkers: 5 | Sensors: 3` as compact badges in the status bar.

### 44. Event Log with Timestamps
**File**: `src/components/shared/EventLog.tsx`
**Fix**: Show collision and lane invasion events in a `Table`:
- Timestamp (HH:MM:SS.ms)
- Event type badge (Collision=red, Lane=yellow)
- Details (other actor ID, impulse magnitude)
- Auto-scroll to latest
- "Clear" button to reset log
Max 500 entries with virtual scrolling.

### 45. Sensor Subscription Status
**File**: `src/components/sensors/SensorPanel.tsx`
**Fix**: Each sensor cell shows subscription status:
- Green dot: subscribed and receiving data
- Yellow dot: subscribed but no data yet
- Gray dot: not subscribed
Small indicator in top-right corner of each cell.

### 46. Map Minimap Enhancement
**File**: `src/components/map/MiniMap.tsx`
**Fix**: Show a top-down 2D minimap in the "Map" bottom tab:
- Road network lines from topology
- Colored dots for actors (green=ego, blue=vehicles, orange=walkers)
- Camera cone showing current view direction
- Pan by dragging, zoom with scroll
- Click actor dot → select in store

### 47. Route Visualization
**File**: `src/components/map/RouteEditor.tsx`
**Fix**: Show planned route as a colored line on the minimap and 3D viewport. When using the navigation API, display the computed route as a highlighted path.

### 48. Sensor Config Panel
**File**: `src/components/actors/SensorDetails.tsx`
**Fix**: When a sensor is selected, show its full configuration:
- Type, parent actor, transform
- All attributes (FOV, resolution, tick rate, etc.)
- Subscribe/Unsubscribe toggle (`Switch`)
- Destroy button
Each attribute in a `Table` row with `font-mono` values.

### 49. Responsive Sensor Grid
**File**: `src/components/sensors/SensorPanel.tsx`
**Fix**: Grid auto-adjusts columns by container width:
- <600px: 1 column
- 600-1000px: 2 columns
- >1000px: 3 columns
Plus explicit preset buttons: 1x1, 2x1, 2x2, 3x2. Use CSS grid with `auto-fill` and `minmax(280px, 1fr)`.

### 50. Data Export Menu
**File**: `src/components/shared/DataExportMenu.tsx` (new)
**Fix**: Add to TopBar or as a keyboard shortcut (Ctrl+E). `DropdownMenu` with:
- Screenshot Current View (PNG)
- Export Camera Frame (JPEG)
- Export Sensor Data (CSV)
- Export Actor Positions (JSON)
- Export LiDAR Point Cloud (PLY)
Each option triggers the appropriate export function from `lib/data-export.ts`.
