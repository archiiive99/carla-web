# Phase 6: Advanced Features — Power User Capabilities

## Overview

This phase adds professional features: recording/replay with timeline, data export, multi-camera grid layouts, scenario presets, WebSocket optimization, and persistent settings.

**Estimated scope**: 6-10 new/modified components, ~500-800 lines of code.

---

## 6-1: Recording & Replay Controls

**Current**: `scenario/RecordingControls.tsx` exists but needs verification.

**Bridge API** (all implemented):
```
POST /api/recording/start   → { filename: "recording_001" }
POST /api/recording/stop
GET  /api/recording/files    → list of recording files
POST /api/replay/start       → { filename: "recording_001", start_time: 0, duration: 0, camera_id: 0 }
POST /api/replay/stop
```

**UI spec** (use shadcn components):

```tsx
<Card>
  <CardHeader>
    <CardTitle className="text-sm">Recording</CardTitle>
  </CardHeader>
  <CardContent className="space-y-3">
    {/* Record controls */}
    <div className="flex items-center gap-2">
      <Button 
        variant={isRecording ? "destructive" : "outline"} 
        size="sm"
        onClick={startRecording}
      >
        <Circle className={cn("h-3 w-3 mr-1", isRecording && "animate-pulse fill-current")} />
        {isRecording ? "Recording..." : "Record"}
      </Button>
      <Button variant="outline" size="sm" onClick={stopRecording} disabled={!isRecording}>
        <Square className="h-3 w-3 mr-1" /> Stop
      </Button>
      <Badge variant="outline">{recordingStatus}</Badge>
    </div>
    
    {/* Recording file list */}
    <ScrollArea className="h-32">
      <Table>
        <TableBody>
          {recordings.map(r => (
            <TableRow key={r}>
              <TableCell className="font-mono text-xs">{r}</TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="icon" onClick={() => replay(r)}>
                  <Play className="h-3 w-3" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
    
    {/* Replay controls (when replaying) */}
    {isReplaying && (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={stopReplay}>
            <Square className="h-3 w-3 mr-1" /> Stop Replay
          </Button>
          <Badge variant="secondary">Replaying</Badge>
        </div>
        <Slider value={[replayPosition]} max={replayDuration} onValueChange={seekReplay} />
        <div className="flex justify-between text-xs text-muted-foreground font-mono">
          <span>{formatTime(replayPosition)}</span>
          <span>{formatTime(replayDuration)}</span>
        </div>
      </div>
    )}
  </CardContent>
</Card>
```

---

## 6-2: Data Export

**Already exists**: `lib/data-export.ts` has `saveCanvasAsPng`, `saveCanvasAsJpeg`, `copyCanvasToClipboard`.

**Extend with:**

```typescript
// Add to data-export.ts:

export function saveLidarAsPly(positions: Float32Array, colors: Float32Array, pointCount: number) {
  const header = `ply\nformat ascii 1.0\nelement vertex ${pointCount}\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n`
  let body = ""
  for (let i = 0; i < pointCount; i++) {
    const x = positions[i * 3]
    const y = positions[i * 3 + 1]
    const z = positions[i * 3 + 2]
    const r = Math.floor(colors[i * 3] * 255)
    const g = Math.floor(colors[i * 3 + 1] * 255)
    const b = Math.floor(colors[i * 3 + 2] * 255)
    body += `${x} ${y} ${z} ${r} ${g} ${b}\n`
  }
  downloadFile(header + body, "lidar_cloud.ply", "application/octet-stream")
}

export function saveImuAsCsv(buffer: Array<{accel: Vec3, gyro: Vec3, compass: number, timestamp: number}>) {
  const header = "timestamp,accel_x,accel_y,accel_z,gyro_x,gyro_y,gyro_z,compass\n"
  const rows = buffer.map(s => 
    `${s.timestamp},${s.accel.x},${s.accel.y},${s.accel.z},${s.gyro.x},${s.gyro.y},${s.gyro.z},${s.compass}`
  ).join("\n")
  downloadFile(header + rows, "imu_data.csv", "text/csv")
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
```

**Add export options to sensor ContextMenus:**
```tsx
<ContextMenu>
  <ContextMenuContent>
    <ContextMenuItem onClick={saveAsPng}>
      <Image className="h-4 w-4 mr-2" /> Save as PNG
    </ContextMenuItem>
    <ContextMenuItem onClick={saveAsJpeg}>
      <Image className="h-4 w-4 mr-2" /> Save as JPEG
    </ContextMenuItem>
    <ContextMenuItem onClick={copyToClipboard}>
      <Copy className="h-4 w-4 mr-2" /> Copy to Clipboard
    </ContextMenuItem>
    <ContextMenuSeparator />
    <ContextMenuItem onClick={exportData}>
      <Download className="h-4 w-4 mr-2" /> Export Data (CSV/PLY)
    </ContextMenuItem>
  </ContextMenuContent>
</ContextMenu>
```

---

## 6-3: Sensor Grid Layout Presets

**Current**: SensorPanel supports 1x1 to 3x3 grids.

**Add quick preset buttons:**

```tsx
const gridPresets = [
  { id: "1x1", label: "Single", cols: 1, rows: 1, icon: Square },
  { id: "2x1", label: "Side by Side", cols: 2, rows: 1, icon: Columns },
  { id: "2x2", label: "Quad", cols: 2, rows: 2, icon: Grid2x2 },
  { id: "3x2", label: "Six Pack", cols: 3, rows: 2, icon: LayoutGrid },
]

// Toolbar at top of SensorPanel:
<div className="flex items-center gap-1 p-2 border-b">
  {gridPresets.map(p => (
    <Tooltip key={p.id}>
      <TooltipTrigger asChild>
        <Button
          variant={currentGrid === p.id ? "default" : "outline"}
          size="icon"
          className="h-7 w-7"
          onClick={() => setGridLayout(p.id)}
        >
          <p.icon className="h-3.5 w-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{p.label}</TooltipContent>
    </Tooltip>
  ))}
</div>
```

---

## 6-4: Scenario Presets

**Add to CommandPalette** (Ctrl+K) under a "Scenarios" group:

```typescript
const scenarios = [
  {
    name: "Highway Cruise",
    description: "Town04, clear weather, ego + 20 NPC vehicles on highway",
    execute: async () => {
      const id = toast.loading("Setting up Highway Cruise...")
      await carlaApi.loadMap("Town04_Opt")
      await carlaApi.setWeatherPreset("ClearNoon")
      for (let i = 0; i < 20; i++) {
        await carlaApi.spawnVehicle({ blueprint: "vehicle.tesla.model3", autopilot: true })
      }
      toast.success("Highway Cruise ready", { id })
    }
  },
  {
    name: "Rainy Night",
    description: "Current map, heavy rain at night",
    execute: async () => {
      await carlaApi.setWeatherPreset("HardRainNight")
      toast.success("Weather set to Heavy Rain Night")
    }
  },
  {
    name: "Crowded Intersection",
    description: "Town03, 10 vehicles + 20 pedestrians",
    execute: async () => {
      const id = toast.loading("Setting up intersection scenario...")
      await carlaApi.loadMap("Town03_Opt")
      await carlaApi.setWeatherPreset("ClearNoon")
      for (let i = 0; i < 10; i++) {
        await carlaApi.spawnVehicle({ autopilot: true })
      }
      for (let i = 0; i < 20; i++) {
        await carlaApi.spawnWalker({})
      }
      toast.success("Intersection scenario ready", { id })
    }
  },
  {
    name: "Clean Slate",
    description: "Destroy all actors, reset weather to clear",
    execute: async () => {
      await carlaApi.destroyAll()
      await carlaApi.setWeatherPreset("ClearNoon")
      toast.success("Clean slate — all actors destroyed, weather cleared")
    }
  },
  {
    name: "Stress Test",
    description: "Spawn 50 vehicles + 50 pedestrians for performance testing",
    execute: async () => {
      const id = toast.loading("Spawning 100 actors...")
      for (let i = 0; i < 50; i++) {
        await carlaApi.spawnVehicle({ autopilot: true })
      }
      for (let i = 0; i < 50; i++) {
        await carlaApi.spawnWalker({})
      }
      toast.success("100 actors spawned", { id })
    }
  },
]
```

---

## 6-5: WebSocket Backpressure Optimization

**Problem**: If browser can't decode frames fast enough, memory grows unbounded.

**Fix in `workers/ws-receiver.worker.ts`:**

```typescript
// Track pending frames per sensor
const pendingFrames = new Map<number, number>()
const MAX_PENDING = 3

// When receiving a camera frame:
function handleCameraFrame(sensorId: number, payload: ArrayBuffer) {
  const pending = pendingFrames.get(sensorId) ?? 0
  
  if (pending >= MAX_PENDING) {
    // Drop this frame — browser is falling behind
    droppedFrames++
    return
  }
  
  pendingFrames.set(sensorId, pending + 1)
  
  // Send to image decoder
  imagePort.postMessage({ sensorId, payload }, [payload])
}

// When image decoder returns the decoded bitmap:
// (in the message handler that receives decoded bitmaps)
function handleDecodedFrame(sensorId: number) {
  const pending = pendingFrames.get(sensorId) ?? 0
  pendingFrames.set(sensorId, Math.max(0, pending - 1))
}
```

**Also add adaptive quality request**: If client FPS drops below 15, send a stats message requesting the bridge to increase frame_skip:

```typescript
// In the periodic stats message (every 1s):
if (currentFps < 15 && currentFps > 0) {
  const requestedSkip = Math.ceil(20 / currentFps) - 1
  ws.send(JSON.stringify({
    action: "stats",
    client_fps: currentFps,
    request_frame_skip: requestedSkip
  }))
}
```

---

## 6-6: Persistent Settings

**Current**: `uiStore.ts` already uses Zustand `persist` middleware for panel toggles and theme.

**Extend** to persist:
- Camera mode (follow/birdseye/orbit/fpv)
- Sensor grid layout (1x1, 2x2, etc.)
- Performance overlay visibility
- Bridge URL
- Bottom panel active tab

```typescript
// In uiStore.ts, add to the persisted state:
persist(
  (set) => ({
    // ... existing state ...
    cameraMode: "follow" as CameraMode,
    setCameraMode: (mode: CameraMode) => set({ cameraMode: mode }),
    showPerfOverlay: false,
    setShowPerfOverlay: (show: boolean) => set({ showPerfOverlay: show }),
  }),
  {
    name: "carla-ui-state",  // localStorage key
    partialize: (state) => ({
      leftPanelOpen: state.leftPanelOpen,
      rightPanelOpen: state.rightPanelOpen,
      bottomPanelOpen: state.bottomPanelOpen,
      bottomPanelTab: state.bottomPanelTab,
      theme: state.theme,
      cameraMode: state.cameraMode,
      sensorGridLayout: state.sensorGridLayout,
      showPerfOverlay: state.showPerfOverlay,
    })
  }
)
```

**Verification**: Change a setting → refresh the page → setting should persist.

---

## Playwright Verification

```typescript
test("recording controls work", async ({ page }) => {
  await page.goto("http://127.0.0.1:58336")
  await page.waitForTimeout(3000)
  
  // Find recording controls (may be in TopBar or a panel)
  // Start recording, wait, stop, verify toast appears
  // This depends on exact UI layout
})

test("command palette scenarios", async ({ page }) => {
  await page.goto("http://127.0.0.1:58336")
  await page.waitForTimeout(3000)
  
  // Open command palette
  await page.keyboard.press("Control+k")
  await page.waitForTimeout(500)
  
  // Search for "rain"
  await page.keyboard.type("rain")
  await page.waitForTimeout(500)
  await page.screenshot({ path: "/tmp/carla-cmd-rain.png" })
  
  // Select the "Rainy Night" scenario
  await page.keyboard.press("Enter")
  await page.waitForTimeout(5000)
  
  // The camera feed should now show a rainy scene
  await page.screenshot({ path: "/tmp/carla-rainy-night.png" })
  // Visually verify the scene looks rainy/dark
})

test("settings persist across reload", async ({ page }) => {
  await page.goto("http://127.0.0.1:58336")
  await page.waitForTimeout(3000)
  
  // Press P to show performance overlay
  await page.keyboard.press("p")
  await page.waitForTimeout(500)
  
  // Reload the page
  await page.reload()
  await page.waitForTimeout(3000)
  
  // Performance overlay should still be visible
  await page.screenshot({ path: "/tmp/carla-persist-check.png" })
})
```

---

## Acceptance Criteria

1. Recording: can start/stop recording, file appears in list
2. Replay: can play back a recording with timeline scrubber
3. Export: right-click camera → Save PNG works, file downloads
4. Grid presets: can switch between 1x1, 2x1, 2x2, 3x2 layouts
5. Scenarios: Ctrl+K → type scenario name → select → executes correctly
6. Backpressure: under heavy load, frames are dropped gracefully (no memory growth)
7. Settings persist: refresh page → layout/theme/camera mode restored
8. **All verified with Playwright screenshots**
