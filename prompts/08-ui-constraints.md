# UI Constraints — MANDATORY

This document defines hard rules for all frontend code. Violating these rules is a build failure.

---

## Stack (DO NOT CHANGE)

| Layer | Tool | Version |
|-------|------|---------|
| Framework | React 19 | latest |
| Language | TypeScript | 5.9 |
| Build | Vite | latest |
| CSS | Tailwind CSS v4 | `@import "tailwindcss"` |
| UI Library | **shadcn/ui** | `base-vega` style |
| Icons | **Lucide React** | via `lucide-react` |
| Font | Inter Variable | `@fontsource-variable/inter` |
| Monospace | JetBrains Mono | for code/data |
| Toast | Sonner | `@/components/ui/sonner` |
| State | Zustand | |
| 3D | Three.js + React-Three-Fiber | |
| Charts | Recharts | wrapped via shadcn chart |
| Routing | React Router | |

---

## shadcn/ui Rules

### MUST use shadcn components for ALL UI elements

44 components are already installed at `src/components/ui/`:

```
accordion, alert, alert-dialog, aspect-ratio, badge, breadcrumb,
button, calendar, card, chart, checkbox, collapsible, command,
context-menu, dialog, dropdown-menu, field, hover-card, input-group,
input, kbd, label, menubar, navigation-menu, popover, progress,
radio-group, resizable, scroll-area, select, separator, sheet,
sidebar, skeleton, slider, sonner, spinner, switch, table, tabs,
textarea, toggle-group, toggle, tooltip
```

### DO:
- `import { Button } from "@/components/ui/button"`
- `import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"`
- `import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"`
- `import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"`
- `import { Sidebar, SidebarContent, SidebarGroup } from "@/components/ui/sidebar"`
- Use `Resizable` panels for layout
- Use `ScrollArea` for scrollable regions
- Use `Skeleton` for loading states
- Use `Sonner` toast for notifications
- Use `Dialog` / `AlertDialog` for modals
- Use `DropdownMenu` for action menus
- Use `Tooltip` for hover hints

### DO NOT:
- Write raw `<button>`, `<input>`, `<select>`, `<table>` — use shadcn equivalents
- Install Material UI, Ant Design, Chakra, or any other component library
- Write custom modal/dialog/dropdown from scratch
- Use `alert()`, `confirm()`, `prompt()` — use Dialog/AlertDialog/Sonner
- Create custom toggle/switch/checkbox — shadcn has them all
- Write custom CSS classes for things shadcn handles (cards, badges, etc.)

### Adding new shadcn components:
```bash
cd carla-web
npx shadcn@latest add <component-name>
```

---

## Tailwind CSS Rules

### Theme: neutral base, oklch colors, dark mode support

Configuration is in `components.json`:
```json
{
  "style": "base-vega",
  "tailwind": {
    "baseColor": "neutral",
    "cssVariables": true
  }
}
```

### DO:
- Use Tailwind utility classes: `className="flex items-center gap-2 p-4"`
- Use CSS variables: `bg-background`, `text-foreground`, `border-border`
- Use semantic colors: `bg-primary`, `text-muted-foreground`, `bg-destructive`
- Use `dark:` variant for dark mode overrides when needed
- Use `cn()` utility from `@/lib/utils` for conditional classes

### DO NOT:
- Write inline `style={{}}` except for dynamic values (canvas size, transforms)
- Create `.css` or `.module.css` files — Tailwind only
- Use arbitrary color values like `bg-[#ff0000]` — use theme tokens
- Override shadcn component styles with `!important`

---

## Layout Pattern

```tsx
// Main layout: Sidebar + Content with Resizable panels
import { Sidebar } from "@/components/ui/sidebar"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable"

<div className="flex h-screen">
  <Sidebar>
    {/* Navigation, controls */}
  </Sidebar>
  <main className="flex-1">
    <ResizablePanelGroup direction="horizontal">
      <ResizablePanel>
        {/* 3D Viewport or Camera Feed */}
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel>
        {/* Sensor data, actor list */}
      </ResizablePanel>
    </ResizablePanelGroup>
  </main>
</div>
```

---

## Component Patterns

### Cards for data panels:
```tsx
<Card>
  <CardHeader>
    <CardTitle className="text-sm font-medium">Sensor Data</CardTitle>
  </CardHeader>
  <CardContent>
    {/* content */}
  </CardContent>
</Card>
```

### Tabs for switching views:
```tsx
<Tabs defaultValue="camera">
  <TabsList>
    <TabsTrigger value="camera">Camera</TabsTrigger>
    <TabsTrigger value="lidar">LiDAR</TabsTrigger>
    <TabsTrigger value="map">Map</TabsTrigger>
  </TabsList>
  <TabsContent value="camera">{/* camera canvas */}</TabsContent>
  <TabsContent value="lidar">{/* point cloud */}</TabsContent>
  <TabsContent value="map">{/* minimap */}</TabsContent>
</Tabs>
```

### Status indicators with Badge:
```tsx
<Badge variant={connected ? "default" : "destructive"}>
  {connected ? "Connected" : "Disconnected"}
</Badge>
```

### Data display with Table:
```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Actor</TableHead>
      <TableHead>Type</TableHead>
      <TableHead>Position</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {actors.map(a => (
      <TableRow key={a.id}>
        <TableCell>{a.id}</TableCell>
        <TableCell><Badge variant="outline">{a.type}</Badge></TableCell>
        <TableCell className="font-mono text-xs">{a.position}</TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

---

## Dark Mode

- Default: dark mode (CARLA dashboard aesthetic)
- CSS variables already defined in `src/index.css` under `.dark {}`
- Add `className="dark"` to `<html>` element or use a theme toggle
- All shadcn components automatically adapt to dark mode via CSS variables

---

## Icons: Lucide only

```tsx
import { Camera, Activity, Map, Settings, Play, Pause, Square } from "lucide-react"

<Button variant="outline" size="icon">
  <Play className="h-4 w-4" />
</Button>
```

DO NOT use: Font Awesome, Heroicons, Material Icons, or SVG strings.

---

## File Organization

```
src/components/
├── ui/              # shadcn primitives (DO NOT EDIT MANUALLY — use npx shadcn add)
├── sensors/         # Camera, LiDAR, Radar viewer components
├── viewport/        # Three.js 3D scene
├── actors/          # Actor list, vehicle controls
├── controls/        # Simulation controls (play/pause, weather)
├── layout/          # Page layout, header, sidebar
├── map/             # Minimap
├── scenario/        # Recording, scenario management
└── shared/          # Shared composite components (use shadcn primitives inside)
```

- `ui/` is auto-generated by shadcn CLI. Do not hand-edit these files.
- All other component folders should compose from `ui/` primitives.

---

## Summary: The One Rule

> **Every visible UI element must be built from shadcn/ui components + Tailwind utilities.**
> If shadcn has a component for it, use it. No exceptions.
