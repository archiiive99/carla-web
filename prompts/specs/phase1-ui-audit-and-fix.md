# Phase 1: UI Audit & shadcn/ui Compliance

## Overview

This phase audits the entire frontend codebase for shadcn/ui compliance and fixes all violations. The codebase already uses shadcn extensively, so this is primarily a verification and cleanup pass.

**Estimated scope**: ~20 files to audit, ~5-10 files to modify.

---

## Pre-Audit: Fix the Camera Feed First

**BEFORE doing any UI audit work**, verify that the camera feed actually renders in the browser. If the browser shows "Waiting for bridge camera..." or a black canvas, you MUST fix this first. See `prompts/10-self-evolving-guide.md` section "CRITICAL RULE #3" for diagnostic steps.

Take a Playwright screenshot:
```bash
cd /data1/song99/carla/carla-web
npx playwright screenshot http://127.0.0.1:58336 /tmp/carla-before-audit.png
```

If the screenshot shows "Waiting for bridge camera..." — stop and fix the camera subscription flow before proceeding.

---

## Audit Methodology

### Step 1: Automated Scan for Raw HTML Elements

Run these grep commands from `/data1/song99/carla/carla-web/`:

```bash
# Raw interactive HTML elements that should use shadcn (exclude ui/ directory)
echo "=== Raw <button> ==="
grep -rn '<button' --include='*.tsx' src/ | grep -v 'src/components/ui/' | grep -v 'node_modules'

echo "=== Raw <input ==="
grep -rn '<input ' --include='*.tsx' src/ | grep -v 'src/components/ui/' | grep -v 'node_modules'

echo "=== Raw <select> ==="
grep -rn '<select' --include='*.tsx' src/ | grep -v 'src/components/ui/' | grep -v 'node_modules'

echo "=== Raw <table> ==="
grep -rn '<table' --include='*.tsx' src/ | grep -v 'src/components/ui/' | grep -v 'node_modules'

echo "=== Raw <dialog> ==="
grep -rn '<dialog' --include='*.tsx' src/ | grep -v 'src/components/ui/' | grep -v 'node_modules'

echo "=== Raw <textarea> ==="
grep -rn '<textarea' --include='*.tsx' src/ | grep -v 'src/components/ui/' | grep -v 'node_modules'

echo "=== Inline styles (potential Tailwind violations) ==="
grep -rn 'style={{' --include='*.tsx' src/components/ | grep -v 'src/components/ui/'

echo "=== Non-Lucide icon imports ==="
grep -rn "from.*icon\|from.*Icon\|FontAwesome\|heroicons\|material-icons" --include='*.tsx' --include='*.ts' src/ | grep -v 'lucide'
```

For each violation found, note the file, line number, and what it should be replaced with.

### Step 2: Fix Each Violation

**Replacement rules:**

| Raw HTML | shadcn Replacement | Import |
|----------|-------------------|--------|
| `<button>` | `<Button>` | `@/components/ui/button` |
| `<input>` | `<Input>` | `@/components/ui/input` |
| `<select>` | `<Select>` | `@/components/ui/select` |
| `<table>` | `<Table>` | `@/components/ui/table` |
| `<dialog>` | `<Dialog>` | `@/components/ui/dialog` |
| `<textarea>` | `<Textarea>` | `@/components/ui/textarea` |
| `<input type="checkbox">` | `<Checkbox>` | `@/components/ui/checkbox` |
| `<input type="range">` | `<Slider>` | `@/components/ui/slider` |
| `style={{color: "red"}}` | `className="text-red-500"` | — |
| `style={{display: "flex"}}` | `className="flex"` | — |

**Exceptions (DO NOT replace):**
- `<canvas>` — required for 2D rendering, no shadcn equivalent
- `<svg>` inside StatusBar sparkline — performance optimization (direct DOM updates via refs)
- `<video>` — for pixel streaming, no shadcn equivalent
- `<header>`, `<footer>`, `<main>`, `<nav>`, `<section>`, `<article>` — semantic HTML, fine to keep
- `style={{}}` for truly dynamic values like `transform`, `width/height` of canvas, grid template — only convert static values to Tailwind

### Step 3: Dark Mode Default

**File**: `/data1/song99/carla/carla-web/index.html`

The CSS variables for dark mode are defined in `src/index.css` under `.dark {}`, but the `<html>` element may not have the `dark` class by default.

**Check:**
```bash
grep -n 'class=' /data1/song99/carla/carla-web/index.html
```

**If `class="dark"` is missing**, add it:
```html
<html lang="en" class="dark">
```

**Also check** `src/stores/uiStore.ts` — the `theme` state should default to `"dark"`, and there should be a `useEffect` that syncs the theme to `document.documentElement.classList`.

If the theme sync effect doesn't exist, add it to the root `App.tsx` or a dedicated `ThemeProvider`:
```typescript
useEffect(() => {
  const root = document.documentElement
  if (theme === "dark") {
    root.classList.add("dark")
  } else {
    root.classList.remove("dark")
  }
}, [theme])
```

### Step 4: Icon Audit

```bash
# Find all icon imports
grep -rn "from.*lucide\|from.*icon\|from.*Icon" --include='*.tsx' --include='*.ts' src/ | grep -v 'node_modules' | grep -v 'src/components/ui/'
```

Every icon should come from `lucide-react`. If you find icons from other packages (heroicons, react-icons, @mui/icons-material, etc.), replace them with the Lucide equivalent.

Common Lucide icons used in this project:
```typescript
import {
  Play, Pause, Square, SkipForward,        // simulation controls
  Camera, Eye, Map, Settings, Activity,      // navigation
  Wifi, WifiOff, RefreshCw,                  // connection
  Plus, Trash2, Search, X,                   // actions
  Sun, Cloud, CloudRain, Thermometer,        // weather
  Gauge, Timer, BarChart3,                   // metrics
  Maximize, Minimize, Columns, Grid3x3,     // layout
  ChevronLeft, ChevronRight, ChevronDown,   // navigation
  Info, AlertTriangle, CheckCircle,          // status
} from "lucide-react"
```

### Step 5: Verify Dark Mode Renders Correctly

After applying the `dark` class, take a Playwright screenshot and verify:
- Background is dark (not white)
- Text is light (readable on dark background)
- Cards have dark backgrounds with subtle borders
- Badges are visible
- No contrast issues (text on similarly-colored background)

```bash
cd /data1/song99/carla/carla-web
npx playwright screenshot http://127.0.0.1:58336 /tmp/carla-dark-mode.png
```

Open the screenshot and visually inspect every visible panel.

---

## Files to Audit (complete list)

### Layout Components
- [ ] `src/components/layout/TopBar.tsx`
- [ ] `src/components/layout/LeftPanel.tsx`
- [ ] `src/components/layout/RightPanel.tsx`
- [ ] `src/components/layout/BottomPanel.tsx`
- [ ] `src/components/layout/StatusBar.tsx`
- [ ] `src/components/layout/ResizableLayout.tsx`

### Control Components
- [ ] `src/components/controls/SimulationControls.tsx`
- [ ] `src/components/controls/SpawnPanel.tsx`
- [ ] `src/components/controls/WeatherControls.tsx`
- [ ] `src/components/controls/MapControls.tsx`
- [ ] `src/components/controls/VehicleControls.tsx`

### Sensor Components
- [ ] `src/components/sensors/CameraView.tsx`
- [ ] `src/components/sensors/SensorPanel.tsx`
- [ ] `src/components/sensors/LidarScene.tsx`
- [ ] `src/components/sensors/DepthView.tsx`
- [ ] `src/components/sensors/SegmentationView.tsx`
- [ ] `src/components/sensors/RadarView.tsx`
- [ ] `src/components/sensors/ImuChart.tsx`
- [ ] `src/components/sensors/GnssView.tsx`
- [ ] `src/components/sensors/CollisionLog.tsx`
- [ ] `src/components/sensors/LaneInvasionLog.tsx`

### Actor Components
- [ ] `src/components/actors/ActorDetails.tsx`
- [ ] `src/components/actors/VehicleDetails.tsx`
- [ ] `src/components/actors/SensorDetails.tsx`
- [ ] `src/components/actors/TrafficManagerPanel.tsx`

### Viewport Components
- [ ] `src/components/viewport/MainViewport.tsx`

### Shared Components
- [ ] `src/components/shared/CommandPalette.tsx`
- [ ] `src/components/shared/ErrorBoundary.tsx`
- [ ] `src/components/shared/EventLog.tsx`

### Routes
- [ ] `src/routes/SimulationPage.tsx`
- [ ] `src/routes/SettingsPage.tsx`

### Map Components
- [ ] `src/components/map/MiniMap.tsx`
- [ ] `src/components/map/OpenDriveViewer.tsx`

---

## Acceptance Criteria

1. **Zero raw interactive HTML elements** outside of `src/components/ui/`:
   ```bash
   # This must return no results:
   grep -rn '<button\|<input \|<select\|<table\|<dialog\|<textarea' --include='*.tsx' src/ | grep -v 'src/components/ui/' | grep -v 'node_modules'
   ```

2. **Dark mode is the default** — Playwright screenshot shows dark background

3. **All icons are from lucide-react** — no other icon library imports

4. **No regressions** — all existing functionality still works:
   - Camera feed renders (NOT "Waiting for...")
   - Actor list populates
   - Simulation controls work
   - WebSocket connection maintains

5. **Playwright verification**: Take a full-page screenshot after all changes and visually confirm everything looks correct in dark mode.
