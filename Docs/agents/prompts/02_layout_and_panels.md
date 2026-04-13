# Prompt 02 — Resizable Layout & Panel System

## Context

The CARLA Web project has been initialized (Prompt 01). The shadcn/ui components are installed. Now build the main application layout.

Read before starting:
- `Docs/agents/carla_web_implementation_prompt.md` — Full architecture (see Layout section)
- `Docs/agents/shadcn_component_mapping.md` — Component mapping (sections 3.1, 3.2, 3.3, 3.4, 3.11)

Reference the shadcn source at `ui/apps/v4/registry/new-york-v4/ui/resizable.tsx` and `ui/apps/v4/registry/new-york-v4/ui/sidebar.tsx` for component APIs.

---

## Task

Build the complete panel layout system for the main simulation page.

### 1. Layout Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  TopBar (fixed height: 48px)                                     │
│  Connection status | Sim time | FPS | Map | Play/Pause/Step      │
├────────┬─────────────────────────────────────────┬───────────────┤
│ Left   │  Center                                 │  Right Panel  │
│ Panel  │  ┌─────────────────────────────────┐    │  (280px       │
│ (260px │  │  Main Viewport                  │    │  default,     │
│ default│  │  (fills remaining space)        │    │  collapsible) │
│ min:   │  │                                 │    │               │
│ 200px  │  └─────────────────────────────────┘    │  Properties   │
│ max:   │  ┌─────────────────────────────────┐    │  & Details    │
│ 400px) │  │  Bottom Panel (200px default,   │    │               │
│        │  │  min: 100px, collapsible)       │    │               │
│        │  │  Sensors | Telemetry | Events   │    │               │
│        │  └─────────────────────────────────┘    │               │
├────────┴─────────────────────────────────────────┴───────────────┤
│  StatusBar (fixed height: 28px)                                   │
│  Latency | Bandwidth | Tick rate | Sync mode                     │
└──────────────────────────────────────────────────────────────────┘
```

### 2. Implement Components

**`src/components/layout/TopBar.tsx`:**
- Fixed height 48px, `border-b border-border`
- Left section: "CARLA Web" text + connection `Badge` (red "Disconnected" default)
- Center section: simulation time (monospace), current tick, map name `Badge`
- Right section: Play `Button`, Pause `Button`, Step `Button`, speed `Select` dropdown, Settings `Button` (gear icon)
- All buttons use shadcn `Button` with `variant="outline"` and `size="icon"` or `size="sm"`
- Keyboard shortcut hints in `Tooltip` for Play (Space), Step (N)

**`src/components/layout/StatusBar.tsx`:**
- Fixed height 28px, `border-t border-border`, `text-xs font-mono`
- Items: Latency (ms), Bandwidth (KB/s), Tick rate (Hz), Sync mode badge, FPS
- Each metric as a labeled span: `Latency: --ms`
- Use green/yellow/red color coding for latency thresholds (<50ms green, <100ms yellow, >100ms red)

**`src/components/layout/LeftPanel.tsx`:**
- Use shadcn `Sidebar` component (reference `ui/apps/v4/registry/new-york-v4/ui/sidebar.tsx`)
- Use `SidebarProvider` and `useSidebar` hook for collapse state
- Header: "Actors" title + count badge + collapse button
- Search input with search icon (shadcn `Input`)
- Collapsible groups using `SidebarGroup` + `Collapsible`:
  - Vehicles (icon: Car)
  - Walkers (icon: PersonStanding)
  - Sensors (icon: Camera)
  - Traffic Lights (icon: CircleDot)
  - Other (icon: Box)
- Each actor item: `SidebarMenuItem` with type icon, truncated name/type_id, and ID badge
- Footer: "Spawn Actor" `Button` (full width)
- Placeholder data: show 3 example vehicles, 2 walkers, 1 sensor (static mock data)

**`src/components/layout/RightPanel.tsx`:**
- Collapsible panel on the right
- Header: "Properties" title + collapse button
- Content: placeholder text "Select an actor to view properties"
- When an actor is selected (later): show `Accordion` sections for Transform, Velocity, Control, Physics, Lights

**`src/components/layout/BottomPanel.tsx`:**
- Use shadcn `Tabs` with three tabs: "Sensors", "Telemetry", "Events"
- Each tab content is a placeholder area
- Sensors tab: grid layout ready for sensor cards
- Telemetry tab: placeholder for charts
- Events tab: placeholder for event log with `ScrollArea`
- Panel header with tab bar and a minimize `Button`

**`src/components/layout/ResizableLayout.tsx`:**
- The master layout component that composes everything
- Use shadcn `ResizablePanelGroup` and `ResizablePanel`
- Outer: horizontal group (Left | Center+Bottom | Right)
- Inner (center): vertical group (Viewport | Bottom Panel)
- Handle drag to resize panels
- Support collapse: double-click handle or toggle button collapses panel to 0
- Persist panel sizes to `localStorage`

**`src/routes/SimulationPage.tsx`:**
- Compose: TopBar + ResizableLayout + StatusBar
- Full viewport height: `h-screen flex flex-col`
- TopBar and StatusBar are fixed; ResizableLayout fills remaining space with `flex-1`

### 3. Keyboard Shortcuts

Create `src/hooks/useKeyboardShortcuts.ts`:
- Register in the main page
- Space → toggle play/pause (placeholder action, log to console)
- N → step forward (placeholder)
- B → toggle left sidebar
- Escape → deselect actor
- Use `useEffect` with `keydown` listener, check `event.target` to ignore when focused on inputs

### 4. Performance Requirements

- Panel resize must be smooth 60fps (shadcn Resizable handles this via CSS)
- Sidebar collapse/expand should animate with `transition-all duration-200`
- No re-renders of viewport content when resizing panels (use CSS-only resize where possible)
- TopBar metrics (time, FPS) will update frequently — use `useRef` + direct DOM update pattern, not state

### 5. Quality Checklist

- [ ] All panels render correctly in dark mode
- [ ] Panels are resizable via drag handles
- [ ] Panels can be collapsed and expanded
- [ ] Panel sizes persist across page reloads (localStorage)
- [ ] Keyboard shortcuts work (Space, N, B, Escape)
- [ ] Layout fills the viewport exactly (no scroll, no overflow)
- [ ] `npm run build` passes
- [ ] Responsive: panels stack vertically on narrow viewports (<768px)
