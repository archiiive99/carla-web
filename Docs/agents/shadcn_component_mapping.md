# shadcn/ui Component Mapping for CARLA Web

This document maps every CARLA Web UI element to specific shadcn/ui components from the local repository at `/ui/`. The shadcn/ui v4 registry (new-york-v4 style) provides 57 base UI components, 28 block templates, 80+ chart variants, and 24 color themes. **Every UI element in CARLA Web must be built from these components — no custom primitives.**

---

## 1. Local Repository Reference

| Path | Contents |
|------|----------|
| `ui/apps/v4/registry/new-york-v4/ui/` | 57 base UI components |
| `ui/apps/v4/registry/new-york-v4/blocks/` | 28 pre-built block templates |
| `ui/apps/v4/registry/new-york-v4/examples/` | 1,087 example implementations |
| `ui/apps/v4/registry/new-york-v4/hooks/` | Utility hooks (`use-mobile.ts`, etc.) |
| `ui/apps/v4/registry/new-york-v4/lib/` | Utility functions (`utils.ts` with `cn()`) |
| `ui/apps/v4/registry/themes.ts` | 24 color theme definitions (OKLch format) |
| `ui/apps/v4/registry/styles/` | 5 style variants (vega, nova, lyra, maia, mira) |
| `ui/apps/v4/registry/base-colors.ts` | 7 base color themes (neutral, stone, zinc, mauve, olive, mist, taupe) |
| `ui/templates/vite-app/` | Vite + React starter template |

---

## 2. Theme & Style Configuration

### Recommended Configuration for CARLA Web

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york-v4",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/index.css",
    "baseColor": "zinc",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

**IMPORTANT:** `rsc: false` — this is a Vite + React project, NOT Next.js. No server components.
```

### Theme Selection

**Base color: `zinc`** — neutral, professional, perfect for simulation/monitoring UIs. Dark mode as default.

**Accent colors:**
- **Primary:** `blue` — interactive elements, selected states, primary actions
- **Destructive:** `red` — errors, disconnected state, destroy actions
- **Chart colors:** Use `--chart-1` through `--chart-5` CSS variables for sensor data visualizations

**Style variant: `vega`** — clean and modern, best suited for data-dense dashboards.

### CSS Variables (from themes.ts)

The theme system uses OKLch color space. Key variables:
```css
:root {
  --background: oklch(...);
  --foreground: oklch(...);
  --primary: oklch(...);
  --primary-foreground: oklch(...);
  --secondary: oklch(...);
  --accent: oklch(...);
  --destructive: oklch(...);
  --border: oklch(...);
  --input: oklch(...);
  --ring: oklch(...);
  --sidebar: oklch(...);
  --sidebar-foreground: oklch(...);
  --chart-1: oklch(...);
  --chart-2: oklch(...);
  --chart-3: oklch(...);
  --chart-4: oklch(...);
  --chart-5: oklch(...);
  --radius: 0.625rem;
}
```

---

## 3. Component Mapping by CARLA Web Feature

### 3.1 Top Bar / Header

| UI Element | shadcn Component | Registry Path |
|-----------|-----------------|---------------|
| Top bar container | — (plain div with flex) | — |
| Connection status badge | `Badge` | `ui/badge.tsx` |
| Simulation time display | — (monospace `<span>` with `font-mono`) | — |
| Play/Pause button | `Button` (variant: `outline`, icon-only) | `ui/button.tsx` |
| Step button | `Button` (variant: `outline`) | `ui/button.tsx` |
| Speed selector | `Select` | `ui/select.tsx` |
| Map name display | `Badge` (variant: `secondary`) | `ui/badge.tsx` |
| FPS indicator | — (monospace readout) | — |
| Settings gear | `Button` (variant: `ghost`, icon-only) | `ui/button.tsx` |

### 3.2 Left Panel — Actor List & Spawn Tools

| UI Element | shadcn Component | Registry Path |
|-----------|-----------------|---------------|
| Panel container | `Sidebar` | `ui/sidebar.tsx` |
| Panel header | `SidebarHeader` | `ui/sidebar.tsx` |
| Search actors | `Input` (with search icon) | `ui/input.tsx` |
| Actor type groups | `Collapsible` or `SidebarGroup` | `ui/collapsible.tsx`, `ui/sidebar.tsx` |
| Actor list items | `SidebarMenuItem` + `SidebarMenuButton` | `ui/sidebar.tsx` |
| Actor count badge | `Badge` (variant: `secondary`, size: `sm`) | `ui/badge.tsx` |
| Right-click context menu | `ContextMenu` | `ui/context-menu.tsx` |
| Spawn button | `Button` (variant: `default`) | `ui/button.tsx` |
| Spawn dialog | `Dialog` or `Sheet` (side panel) | `ui/dialog.tsx`, `ui/sheet.tsx` |
| Blueprint selector | `Command` (searchable combobox) | `ui/command.tsx` |
| Position inputs (X/Y/Z) | `Input` (type: `number`) in `InputGroup` | `ui/input.tsx`, `ui/input-group.tsx` |
| Sensor parent selector | `Select` | `ui/select.tsx` |
| Tab navigation (Vehicle/Walker/Sensor) | `Tabs` | `ui/tabs.tsx` |

### 3.3 Right Panel — Properties & Sensor Config

| UI Element | shadcn Component | Registry Path |
|-----------|-----------------|---------------|
| Panel container | `Sheet` (side: `right`) or custom panel | `ui/sheet.tsx` |
| Property sections | `Accordion` | `ui/accordion.tsx` |
| Property labels | `Label` | `ui/label.tsx` |
| Transform display | `Input` (type: `number`, `font-mono`) | `ui/input.tsx` |
| Velocity readout | — (monospace `useRef` readout) | — |
| Toggle switches (physics, collision, gravity) | `Switch` | `ui/switch.tsx` |
| Autopilot toggle | `Switch` with `Label` | `ui/switch.tsx`, `ui/label.tsx` |
| Light state toggles | `Toggle` in `ToggleGroup` | `ui/toggle.tsx`, `ui/toggle-group.tsx` |
| Door controls | `Button` group | `ui/button.tsx` |
| Sensor attribute form | `Form` (React Hook Form) | `ui/form.tsx` |
| Resolution selector | `Select` | `ui/select.tsx` |
| FOV/range sliders | `Slider` | `ui/slider.tsx` |
| Apply changes button | `Button` | `ui/button.tsx` |
| Destroy actor button | `Button` (variant: `destructive`) | `ui/button.tsx` |
| Confirmation dialog | `AlertDialog` | `ui/alert-dialog.tsx` |

### 3.4 Bottom Panel — Sensor Views & Telemetry

| UI Element | shadcn Component | Registry Path |
|-----------|-----------------|---------------|
| Panel container | `Resizable` (vertical split) | `ui/resizable.tsx` |
| Tab bar (Sensors/Telemetry/Events) | `Tabs` | `ui/tabs.tsx` |
| Sensor grid | CSS Grid (not a shadcn component) | — |
| Individual sensor card | `Card` | `ui/card.tsx` |
| Sensor card header | `CardHeader` + `CardTitle` | `ui/card.tsx` |
| Sensor actions (detach, maximize, close) | `Button` (variant: `ghost`, size: `icon`) | `ui/button.tsx` |
| Camera feed | `<canvas>` inside `Card` | — |
| LiDAR view | Three.js `<Canvas>` inside `Card` | — |
| IMU charts | `Chart` (line chart) | `ui/chart.tsx` |
| GNSS display | `Card` with map embed | `ui/card.tsx` |
| Event log | `ScrollArea` with virtualized list | `ui/scroll-area.tsx` |
| Event items | Custom list items with `Badge` for type | `ui/badge.tsx` |
| Empty state | `EmptyState` | `ui/empty-state.tsx` |

### 3.5 Weather Controls

| UI Element | shadcn Component | Registry Path |
|-----------|-----------------|---------------|
| Weather panel | `Popover` or `Sheet` | `ui/popover.tsx`, `ui/sheet.tsx` |
| Preset selector | `Select` or `Command` | `ui/select.tsx`, `ui/command.tsx` |
| Sun altitude slider | `Slider` | `ui/slider.tsx` |
| Sun azimuth slider | `Slider` | `ui/slider.tsx` |
| Cloudiness slider | `Slider` | `ui/slider.tsx` |
| Precipitation slider | `Slider` | `ui/slider.tsx` |
| Fog density slider | `Slider` | `ui/slider.tsx` |
| Wind intensity slider | `Slider` | `ui/slider.tsx` |
| All other weather params | `Slider` with `Label` | `ui/slider.tsx`, `ui/label.tsx` |
| Current value display | Monospace inline readout | — |
| Advanced section toggle | `Collapsible` | `ui/collapsible.tsx` |

### 3.6 Traffic Manager Panel

| UI Element | shadcn Component | Registry Path |
|-----------|-----------------|---------------|
| TM panel | `Sheet` or `Dialog` (wide) | `ui/sheet.tsx` |
| Global settings section | `Card` | `ui/card.tsx` |
| Global speed slider | `Slider` | `ui/slider.tsx` |
| Per-vehicle table | `Table` | `ui/table.tsx` |
| Speed input per vehicle | `Input` (type: `number`) | `ui/input.tsx` |
| Ignore percentages | `Slider` (multiple) | `ui/slider.tsx` |
| Auto lane change toggle | `Switch` | `ui/switch.tsx` |
| Route button | `Button` | `ui/button.tsx` |

### 3.7 Charts & Data Visualization

All chart components are built on top of shadcn's `Chart` component (`ui/chart.tsx`) which wraps Recharts with theme-aware styling.

| Chart Type | CARLA Use Case | shadcn Example Reference |
|-----------|---------------|-------------------------|
| Line Chart | IMU accelerometer/gyroscope time series | `examples/chart-line-*` |
| Area Chart | Speed over time, bandwidth usage | `examples/chart-area-*` |
| Bar Chart | Sensor frame rates, latency breakdown | `examples/chart-bar-*` |
| Radial Chart | Radar detection display | `examples/chart-radial-*` |
| Pie Chart | Actor type distribution | `examples/chart-pie-*` |
| Tooltip | All charts: custom data tooltips | `examples/chart-tooltip-*` |

**Chart setup:**
```tsx
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Line, LineChart, XAxis, YAxis } from "recharts"
```

### 3.8 Simulation Controls

| UI Element | shadcn Component | Registry Path |
|-----------|-----------------|---------------|
| Play button | `Button` (with Play icon) | `ui/button.tsx` |
| Pause button | `Button` (with Pause icon) | `ui/button.tsx` |
| Step forward button | `Button` (with SkipForward icon) | `ui/button.tsx` |
| Speed dropdown | `DropdownMenu` | `ui/dropdown-menu.tsx` |
| Sync mode toggle | `Switch` with `Label` | `ui/switch.tsx` |
| Rendering mode toggle | `Switch` | `ui/switch.tsx` |
| Map selector | `Command` (searchable) | `ui/command.tsx` |
| Reload map | `Button` (variant: `outline`) | `ui/button.tsx` |
| Settings dialog | `Dialog` with `Tabs` | `ui/dialog.tsx`, `ui/tabs.tsx` |

### 3.9 Recording & Replay

| UI Element | shadcn Component | Registry Path |
|-----------|-----------------|---------------|
| Record button | `Button` (custom red style when active) | `ui/button.tsx` |
| Recording list | `ScrollArea` with items | `ui/scroll-area.tsx` |
| Replay transport bar | `Slider` (seek) + `Button` group | `ui/slider.tsx`, `ui/button.tsx` |
| Playback speed | `Select` | `ui/select.tsx` |
| Camera selector | `Select` | `ui/select.tsx` |

### 3.10 Status Bar

| UI Element | shadcn Component | Registry Path |
|-----------|-----------------|---------------|
| Status bar container | — (plain div, `border-t`) | — |
| Latency badge | `Badge` (variant based on value) | `ui/badge.tsx` |
| Bandwidth readout | — (monospace span) | — |
| Tick rate display | — (monospace span) | — |
| Sync mode indicator | `Badge` | `ui/badge.tsx` |

### 3.11 Resizable Layout

| UI Element | shadcn Component | Registry Path |
|-----------|-----------------|---------------|
| Horizontal split (left-center-right) | `ResizablePanelGroup` (direction: `horizontal`) | `ui/resizable.tsx` |
| Vertical split (center-bottom) | `ResizablePanelGroup` (direction: `vertical`) | `ui/resizable.tsx` |
| Individual panels | `ResizablePanel` | `ui/resizable.tsx` |
| Drag handles | `ResizableHandle` | `ui/resizable.tsx` |

### 3.12 Sidebar Navigation (from block templates)

Use the sidebar block templates as a starting foundation:

| Block Template | Use Case | Registry Path |
|---------------|----------|---------------|
| `sidebar-01` | Basic sidebar with navigation | `blocks/sidebar-01/` |
| `sidebar-07` | Sidebar with collapsible sections | `blocks/sidebar-07/` |
| `sidebar-10` | Sidebar with secondary navigation | `blocks/sidebar-10/` |
| `sidebar-15` | Floating sidebar variant | `blocks/sidebar-15/` |

### 3.13 Notifications & Feedback

| UI Element | shadcn Component | Registry Path |
|-----------|-----------------|---------------|
| Toast notifications | `Sonner` (toast library) | `ui/sonner.tsx` |
| Loading skeletons | `Skeleton` | `ui/skeleton.tsx` |
| Loading spinner | `Spinner` | `ui/spinner.tsx` |
| Progress bars | `Progress` | `ui/progress.tsx` |
| Confirmation dialogs | `AlertDialog` | `ui/alert-dialog.tsx` |
| Tooltips | `Tooltip` | `ui/tooltip.tsx` |
| Hover cards (actor preview) | `HoverCard` | `ui/hover-card.tsx` |

### 3.14 Keyboard Shortcuts

| UI Element | shadcn Component | Registry Path |
|-----------|-----------------|---------------|
| Shortcut display | `Kbd` (keyboard) | `ui/keyboard.tsx` |
| Command palette | `Command` (Cmd+K) | `ui/command.tsx` |
| Shortcut hints in menus | `DropdownMenuShortcut` | `ui/dropdown-menu.tsx` |

---

## 4. Block Templates to Use as Starting Points

These pre-built blocks from the shadcn registry should be used as foundations:

| Block | CARLA Web Usage | Registry Path |
|-------|----------------|---------------|
| `sidebar-07` | Left panel with collapsible actor groups | `blocks/sidebar-07/` |
| `dashboard-01` | Overall layout inspiration | `blocks/dashboard-01/` |
| `login-01` | Connection/settings page | `blocks/login-01/` |

---

## 5. Icons — Lucide React

All icons come from `lucide-react`. Key icons for CARLA Web:

| Icon | Usage |
|------|-------|
| `Play`, `Pause`, `SkipForward`, `Square` | Simulation transport |
| `Sun`, `Cloud`, `CloudRain`, `Wind`, `Droplets` | Weather controls |
| `Car`, `PersonStanding`, `Camera`, `Radar`, `Navigation` | Actor types |
| `Settings`, `Sliders`, `LayoutDashboard` | Navigation |
| `Wifi`, `WifiOff`, `Signal` | Connection status |
| `Maximize2`, `Minimize2`, `ExternalLink` | Panel controls |
| `Trash2`, `Plus`, `X`, `ChevronDown`, `ChevronRight` | Actions |
| `Activity`, `Gauge`, `Clock`, `Map` | Telemetry |
| `Circle` (with color), `CircleDot` | Recording |
| `Keyboard` | Shortcuts |

---

## 6. Component Installation Commands

Using the shadcn CLI from the local repo:

```bash
# Core layout components
npx shadcn@latest add button badge card tabs accordion collapsible dialog sheet

# Form components
npx shadcn@latest add input label select slider switch toggle toggle-group form field

# Data display
npx shadcn@latest add table scroll-area skeleton spinner progress chart

# Navigation
npx shadcn@latest add sidebar command dropdown-menu context-menu menubar navigation-menu breadcrumb

# Feedback
npx shadcn@latest add alert alert-dialog sonner tooltip hover-card popover

# Layout
npx shadcn@latest add resizable separator aspect-ratio

# Misc
npx shadcn@latest add calendar checkbox radio-group
```

---

## 7. Custom Components (Not from shadcn)

These components have no shadcn equivalent and must be built custom, but should use shadcn primitives internally:

| Component | Built With |
|-----------|-----------|
| `MainViewport` (Pixel Streaming video) | `<video>` element, shadcn `Card` wrapper |
| `CameraView` (sensor canvas) | `<canvas>`, shadcn `Card` + `CardHeader` |
| `LidarView` (Three.js point cloud) | `@react-three/fiber` Canvas, shadcn `Card` wrapper |
| `RadarView` (polar plot) | `<canvas>` 2D, shadcn `Card` wrapper |
| `MiniMap` (2D actor positions) | `<canvas>` or SVG, custom zoom/pan |
| `OpenDriveViewer` (road network) | SVG or `<canvas>`, custom renderer |
| `NumericReadout` (high-perf display) | Raw DOM via `useRef`, `font-mono` class |
| `RouteEditor` (waypoint placement) | Canvas with click handlers |

All custom components MUST be wrapped in shadcn `Card` containers for visual consistency and use the theme's CSS variables for colors.
