# Phase 5: UX Polish — Professional Dashboard Quality

## Overview

This phase transforms the functional dashboard into a polished, professional tool. Focus areas: telemetry visualization, performance monitoring HUD, comprehensive keyboard shortcuts, responsive layout, connection state UX, and loading states.

**Estimated scope**: 5-8 new components, 10+ existing files to modify.

---

## 5-1: Telemetry Tab (BottomPanel)

**Current state**: The "Telemetry" tab in BottomPanel is a **placeholder** — it shows nothing.

**File to create**: `src/components/shared/TelemetryPanel.tsx`
**Insert into**: `src/components/layout/BottomPanel.tsx` — replace the placeholder TabsContent for "telemetry"

**Data source**: `performanceStore.ts` already tracks: fps, latency, bandwidth, droppedFrames, peakFps, peakBandwidth, peakLatency, fpsHistory (last 60 entries), connectedSince, totalFramesReceived, sensorFps

**Layout:**

```
┌──────────────────────────────────────────────────────────────────────┐
│ ┌─ FPS ─────────────┐ ┌─ Latency ──────────┐ ┌─ Bandwidth ────────┐│
│ │ [area chart 60pts] │ │ [area chart 60pts] │ │ [area chart 60pts] ││
│ │ Current: 28        │ │ Current: 42ms      │ │ Current: 1.2 MB/s  ││
│ │ Peak: 32           │ │ Peak: 120ms        │ │ Peak: 1.8 MB/s     ││
│ └────────────────────┘ └────────────────────┘ └────────────────────┘│
│                                                                      │
│ Sensors: 3  │  Total Frames: 14,320  │  Dropped: 2 (0.01%)          │
│ Clients: 1  │  Uptime: 00:12:45      │  CARLA: 0.10.0               │
└──────────────────────────────────────────────────────────────────────┘
```

**Implementation**: Use shadcn `Card` for each chart box, and shadcn `Chart` component (Recharts `AreaChart`) for the sparklines. If shadcn Chart is complex, a simple canvas-based sparkline is also acceptable.

**Playwright verification**: Take a screenshot of the Telemetry tab and verify the charts show data, not empty rectangles.

---

## 5-2: Performance Overlay HUD

**File**: `src/components/shared/PerformanceOverlay.tsx` (new)
**Toggle**: Press `P` key to show/hide
**Position**: Absolute top-right of viewport, z-index above 3D scene

**Content** (shadcn `Card` with `bg-background/80 backdrop-blur`):

```
┌─ Performance ─┐
│ FPS:     28    │  (green/yellow/red based on value)
│ Latency: 42ms │
│ BW:   1.2MB/s │
│ Sensors:  3   │
│ Dropped:  0   │
└────────────────┘
```

Color coding:
- FPS: >24 green, >15 yellow, ≤15 red
- Latency: <50ms green, <100ms yellow, ≥100ms red

---

## 5-3: Keyboard Shortcuts — Complete Set

**File**: `src/hooks/useKeyboardShortcuts.ts` (extend)

**Current shortcuts** (already implemented):
- `Space` → Play/Pause
- `N` → Step
- `B` → Toggle left panel
- `Escape` → Deselect actor
- `Ctrl+K` / `Cmd+K` → Command palette

**Add these:**
- `P` → Toggle performance overlay
- `F` → Toggle fullscreen for current focused panel
- `1` → Camera mode: Follow
- `2` → Camera mode: Bird's Eye
- `3` → Camera mode: Free Orbit
- `4` → Camera mode: First Person
- `S` → Toggle sensor/bottom panel
- `R` → Toggle right panel
- `?` → Open keyboard shortcuts help dialog
- `W` → Quick weather toggle (cycle: Clear → Cloudy → Rain → Night)

**Important**: Only trigger shortcuts when `e.target === document.body` (not when user is typing in an input/textarea). Check `if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return`.

**Shortcuts Help Dialog**:

When `?` is pressed, open a `Dialog` showing all shortcuts in a `Table`:

```tsx
<Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
  <DialogContent className="max-w-lg">
    <DialogHeader>
      <DialogTitle>Keyboard Shortcuts</DialogTitle>
    </DialogHeader>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24">Key</TableHead>
          <TableHead>Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow><TableCell><Kbd>Space</Kbd></TableCell><TableCell>Play / Pause simulation</TableCell></TableRow>
        <TableRow><TableCell><Kbd>N</Kbd></TableCell><TableCell>Step one frame</TableCell></TableRow>
        <TableRow><TableCell><Kbd>1</Kbd></TableCell><TableCell>Follow camera</TableCell></TableRow>
        <TableRow><TableCell><Kbd>2</Kbd></TableCell><TableCell>Bird's eye view</TableCell></TableRow>
        <TableRow><TableCell><Kbd>3</Kbd></TableCell><TableCell>Free orbit camera</TableCell></TableRow>
        <TableRow><TableCell><Kbd>4</Kbd></TableCell><TableCell>First person view</TableCell></TableRow>
        <TableRow><TableCell><Kbd>P</Kbd></TableCell><TableCell>Toggle performance overlay</TableCell></TableRow>
        <TableRow><TableCell><Kbd>B</Kbd></TableCell><TableCell>Toggle left panel</TableCell></TableRow>
        <TableRow><TableCell><Kbd>R</Kbd></TableCell><TableCell>Toggle right panel</TableCell></TableRow>
        <TableRow><TableCell><Kbd>S</Kbd></TableCell><TableCell>Toggle sensor panel</TableCell></TableRow>
        <TableRow><TableCell><Kbd>F</Kbd></TableCell><TableCell>Fullscreen panel</TableCell></TableRow>
        <TableRow><TableCell><Kbd>?</Kbd></TableCell><TableCell>Show this dialog</TableCell></TableRow>
        <TableRow><TableCell><Kbd>Esc</Kbd></TableCell><TableCell>Deselect / Close dialog</TableCell></TableRow>
        <TableRow><TableCell><Kbd>Ctrl+K</Kbd></TableCell><TableCell>Command palette</TableCell></TableRow>
      </TableBody>
    </Table>
  </DialogContent>
</Dialog>
```

---

## 5-4: Connection State UX

**Current**: TopBar shows a colored Badge (green/yellow/red/gray).

**Enhance with these states:**

### State: Connected
- TopBar Badge: green "Connected"
- No overlay
- All controls enabled

### State: Reconnecting
- TopBar Badge: yellow "Reconnecting..."
- Sonner toast: `toast.warning("Connection lost. Reconnecting...")`
- Controls still enabled (optimistic) but API calls may fail

### State: Disconnected (>10 seconds)
- TopBar Badge: red "Disconnected"
- StatusBar shows elapsed disconnection time
- Toast: `toast.error("CARLA bridge unreachable")`

### State: Disconnected (>30 seconds)
- Full-screen overlay with reconnection UI:

```tsx
{status === "disconnected" && disconnectedDuration > 30_000 && (
  <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm">
    <Card className="w-96 shadow-xl">
      <CardContent className="p-8 text-center">
        <WifiOff className="h-16 w-16 mx-auto mb-6 text-muted-foreground animate-pulse" />
        <h2 className="text-xl font-semibold mb-2">Connection Lost</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Cannot reach the CARLA bridge at<br />
          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{bridgeUrl}</code>
        </p>
        <div className="flex gap-3 justify-center">
          <Button onClick={retry} variant="default">
            <RefreshCw className="h-4 w-4 mr-2" /> Retry Connection
          </Button>
          <Button onClick={() => navigate("/settings")} variant="outline">
            <Settings className="h-4 w-4 mr-2" /> Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
)}
```

### State: Reconnected
- Toast: `toast.success("Reconnected to CARLA bridge")`
- Remove overlay immediately

---

## 5-5: Loading Skeleton States

For each major section, show Skeleton loading when data hasn't arrived yet:

**LeftPanel (actor list):**
```tsx
{actors.size === 0 && connectionStatus === "connected" && (
  <div className="space-y-2 p-3">
    <Skeleton className="h-8 w-full" />
    <Skeleton className="h-6 w-3/4" />
    <Skeleton className="h-6 w-1/2" />
    <Skeleton className="h-6 w-2/3" />
    <Skeleton className="h-6 w-5/6" />
  </div>
)}
```

**Camera feed (before first frame):**
```tsx
{!hasReceivedFirstFrame && (
  <div className="flex flex-col items-center justify-center h-full gap-3">
    <Skeleton className="w-4/5 aspect-video rounded-lg" />
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Spinner className="h-3 w-3" />
      Connecting to camera feed...
    </div>
  </div>
)}
```

**3D viewport (scene loading):**
```tsx
<Suspense fallback={
  <div className="flex items-center justify-center h-full bg-background">
    <Spinner className="h-8 w-8" />
    <span className="ml-3 text-sm text-muted-foreground">Loading 3D scene...</span>
  </div>
}>
  <Canvas>...</Canvas>
</Suspense>
```

---

## 5-6: Toast Notification Patterns

Standardize all toast notifications across the app:

```typescript
// Success (short operations)
toast.success("Vehicle spawned", { description: "Tesla Model 3 with autopilot" })

// Error
toast.error("Failed to spawn vehicle", { description: error.message })

// Warning
toast.warning("High latency detected", { description: "Frame delivery >100ms" })

// Loading → Success/Error (long operations like map loading)
const id = toast.loading("Loading map Town03...")
try {
  await carlaApi.loadMap("Town03_Opt")
  toast.success("Map loaded: Town03", { id })
} catch (e) {
  toast.error("Map load failed", { id, description: e.message })
}

// Connection events
toast.info("CARLA bridge connected")
toast.warning("Connection lost. Reconnecting...")
toast.success("Reconnected to CARLA bridge")
```

---

## Playwright Verification

```typescript
test("keyboard shortcuts work", async ({ page }) => {
  await page.goto("http://127.0.0.1:58336")
  await page.waitForTimeout(3000)
  
  // Press ? to open shortcuts dialog
  await page.keyboard.press("?")
  await page.waitForTimeout(500)
  const dialog = page.locator("text=Keyboard Shortcuts")
  expect(await dialog.count()).toBeGreaterThan(0)
  await page.screenshot({ path: "/tmp/carla-shortcuts-dialog.png" })
  
  // Press Escape to close
  await page.keyboard.press("Escape")
  await page.waitForTimeout(500)
  
  // Press P to toggle performance overlay
  await page.keyboard.press("p")
  await page.waitForTimeout(500)
  await page.screenshot({ path: "/tmp/carla-perf-overlay.png" })
  // Verify overlay is visible in screenshot
  
  // Press Space to toggle play/pause
  await page.keyboard.press("Space")
  await page.waitForTimeout(1000)
  await page.screenshot({ path: "/tmp/carla-space-toggle.png" })
})

test("connection loss shows overlay", async ({ page }) => {
  await page.goto("http://127.0.0.1:58336")
  await page.waitForTimeout(5000)
  
  // The bridge is running so we can't easily kill it for this test.
  // Instead, check that the connected state shows correctly:
  const connectedBadge = page.locator("text=/[Cc]onnected/")
  expect(await connectedBadge.count()).toBeGreaterThan(0)
})
```

---

## Acceptance Criteria

1. Telemetry tab shows live charts (FPS, latency, bandwidth) — not blank
2. Performance overlay toggles with P key — shows real data
3. All keyboard shortcuts work (Space, 1-4, P, ?, B, R, S, Esc, Ctrl+K)
4. Shortcuts help dialog opens with ? and shows all shortcuts
5. Connection loss shows appropriate UI (badge change, toast, overlay after 30s)
6. Reconnection shows success toast and clears overlay
7. Loading skeletons appear before data loads
8. All API calls show success/error toasts
9. **All verified with Playwright screenshots**
