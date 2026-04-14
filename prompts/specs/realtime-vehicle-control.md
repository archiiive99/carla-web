# Real-Time Vehicle Control — WASD Keyboard Driving

## Problem Statement

The CARLA web dashboard must support real-time vehicle control from the browser. The user presses WASD keys and the ego vehicle moves immediately in the CARLA simulation. This is NOT a single-frame-at-a-time renderer — it is a live, continuous simulation running at 20+ FPS with real-time physics.

**Current state**: The ego vehicle is on autopilot. There is no keyboard input → vehicle control pipeline. The user cannot drive the car.

**Required state**: User holds W → car accelerates forward. User holds A/D → car steers left/right. User holds S → car brakes/reverses. This must feel responsive (< 100ms input-to-visual-feedback latency).

---

## Architecture for Real-Time Control

```
Browser keyboard event (keydown/keyup)
  → Frontend captures WASD state (which keys are held)
  → Every 50ms (20Hz), send current control state to bridge
  → Bridge receives control command
  → Bridge calls carla_vehicle.apply_control(VehicleControl)
  → CARLA physics engine moves the vehicle
  → Camera sensor captures new frame
  → Frame sent back to browser via WebSocket
  → User sees the car moving
```

Total round-trip should be < 150ms (50ms input tick + 50ms CARLA tick + 50ms frame delivery).

---

## Implementation

### Part 1: Frontend Keyboard Input Handler

**File**: `src/hooks/useVehicleKeyboard.ts` (new)

This hook captures WASD + Space (handbrake) key state and sends control commands to the bridge.

```typescript
import { useEffect, useRef, useCallback } from "react"
import { carlaApi } from "@/lib/carla-api"
import { useActorStore } from "@/stores/actorStore"
import { useSimulationStore } from "@/stores/simulationStore"

interface KeyState {
  forward: boolean   // W
  backward: boolean  // S
  left: boolean      // A
  right: boolean     // D
  brake: boolean     // Space
}

export function useVehicleKeyboard() {
  const keys = useRef<KeyState>({
    forward: false, backward: false, left: false, right: false, brake: false,
  })
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const activeRef = useRef(false)
  
  const getEgoId = useCallback(() => {
    // Get ego vehicle ID from actor store or realtime session
    const store = useActorStore.getState()
    return store.egoVehicleId ?? null
  }, [])
  
  const sendControl = useCallback(async () => {
    const egoId = getEgoId()
    if (!egoId) return
    if (useSimulationStore.getState().connectionStatus !== "connected") return
    
    const k = keys.current
    
    // Convert key state to CARLA VehicleControl
    const throttle = k.forward ? 0.7 : 0.0    // 70% throttle (not 100% for controllability)
    const brake = k.backward ? 0.5 : (k.brake ? 1.0 : 0.0)
    const steer = k.left ? -0.5 : (k.right ? 0.5 : 0.0)  // -1 to 1
    const reverse = k.backward && !k.forward
    const hand_brake = k.brake
    
    try {
      await carlaApi.applyControl(egoId, {
        throttle,
        steer,
        brake,
        hand_brake,
        reverse,
      })
    } catch {
      // Silently ignore — don't spam errors during driving
    }
  }, [getEgoId])
  
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      
      switch (e.key.toLowerCase()) {
        case "w": keys.current.forward = true; break
        case "s": keys.current.backward = true; break
        case "a": keys.current.left = true; break
        case "d": keys.current.right = true; break
        case " ": keys.current.brake = true; e.preventDefault(); break
        default: return
      }
      
      // Start sending controls when any drive key is pressed
      if (!activeRef.current) {
        activeRef.current = true
        // Disable autopilot when user starts driving
        const egoId = getEgoId()
        if (egoId) {
          carlaApi.setAutopilot(egoId, false).catch(() => {})
        }
        // Send controls at 20Hz
        intervalRef.current = setInterval(sendControl, 50)
      }
    }
    
    const onKeyUp = (e: KeyboardEvent) => {
      switch (e.key.toLowerCase()) {
        case "w": keys.current.forward = false; break
        case "s": keys.current.backward = false; break
        case "a": keys.current.left = false; break
        case "d": keys.current.right = false; break
        case " ": keys.current.brake = false; break
        default: return
      }
      
      // Stop sending when all keys are released
      const k = keys.current
      if (!k.forward && !k.backward && !k.left && !k.right && !k.brake) {
        // Send one final zero-control to stop the car
        sendControl()
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
        activeRef.current = false
      }
    }
    
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [sendControl, getEgoId])
}
```

**Activate in SimulationPage.tsx:**
```typescript
import { useVehicleKeyboard } from "@/hooks/useVehicleKeyboard"

export default function SimulationPage() {
  useVehicleKeyboard()  // Add this line
  // ... rest of component
}
```

### Part 2: Visual Feedback — Driving HUD

**File**: `src/components/shared/DrivingHUD.tsx` (new)

Show current control state as a visual overlay on the viewport:

```typescript
// Shows: speedometer, throttle/brake bars, steering indicator, gear (D/R)
// Position: bottom-center of viewport, semi-transparent
// Use shadcn Card with bg-background/60 backdrop-blur

<div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
  <Card className="bg-background/60 backdrop-blur-md border-border/50">
    <CardContent className="p-3 flex items-center gap-4">
      {/* Speed */}
      <div className="text-center">
        <div className="text-2xl font-mono font-bold">{speed}</div>
        <div className="text-[10px] text-muted-foreground">km/h</div>
      </div>
      
      <Separator orientation="vertical" className="h-8" />
      
      {/* WASD indicator */}
      <div className="grid grid-cols-3 gap-0.5 text-[10px]">
        <div />
        <Kbd className={cn("w-5 h-5 flex items-center justify-center", forward && "bg-green-500/30")}>W</Kbd>
        <div />
        <Kbd className={cn("w-5 h-5 flex items-center justify-center", left && "bg-blue-500/30")}>A</Kbd>
        <Kbd className={cn("w-5 h-5 flex items-center justify-center", backward && "bg-red-500/30")}>S</Kbd>
        <Kbd className={cn("w-5 h-5 flex items-center justify-center", right && "bg-blue-500/30")}>D</Kbd>
      </div>
      
      <Separator orientation="vertical" className="h-8" />
      
      {/* Throttle/Brake bars */}
      <div className="space-y-1 w-20">
        <div className="flex items-center gap-1">
          <span className="text-[9px] w-4">T</span>
          <Progress value={throttle * 100} className="h-1.5 [&>div]:bg-green-500" />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] w-4">B</span>
          <Progress value={brake * 100} className="h-1.5 [&>div]:bg-red-500" />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] w-4">S</span>
          <Slider value={[steer * 50 + 50]} min={0} max={100} className="h-1.5" disabled />
        </div>
      </div>
      
      {/* Gear */}
      <Badge variant={reverse ? "destructive" : "secondary"} className="font-mono">
        {reverse ? "R" : "D"}
      </Badge>
    </CardContent>
  </Card>
</div>
```

### Part 3: Bridge — Ensure Control Endpoint is Fast

**File**: `carla-web-bridge/src/routes/actors.py`

The existing `POST /api/actors/{id}/control` endpoint must be fast (< 20ms). It already uses `asyncio.to_thread` for the CARLA call. Verify it doesn't have unnecessary overhead.

The critical path is:
```python
@router.post("/{actor_id}/control")
async def apply_control(actor_id: int, control: VehicleControl):
    # This must complete in < 20ms
    actor = world.get_actor(actor_id)
    carla_control = carla.VehicleControl(
        throttle=control.throttle,
        steer=control.steer,
        brake=control.brake,
        hand_brake=control.hand_brake,
        reverse=control.reverse,
    )
    actor.apply_control(carla_control)
    return {"status": "ok"}
```

### Part 4: Autopilot Toggle

When the user starts pressing WASD, autopilot must be disabled automatically. When the user presses a "Toggle Autopilot" button (or key like `P`), autopilot re-enables and WASD is ignored.

Add to the TopBar or viewport overlay:
```tsx
<Button 
  variant={autopilotOn ? "default" : "outline"} 
  size="sm"
  onClick={toggleAutopilot}
>
  <Bot className="h-3 w-3 mr-1" />
  {autopilotOn ? "Autopilot ON" : "Manual"}
</Button>
```

### Part 5: WebSocket-Based Control (Optional Optimization)

If the REST API approach has too much latency (>100ms per round trip), switch to WebSocket-based control:

Add a new channel to the binary protocol:
```python
# In channels.py:
VEHICLE_CONTROL = 0xE0  # Client → Server
```

The frontend sends control commands as binary frames over the existing WebSocket connection, avoiding HTTP overhead. The bridge receives them in `ws_broadcaster.py` and applies them.

This is optional — try REST first. If latency is acceptable, keep REST for simplicity.

---

## Simulation Mode

**CARLA must be running in asynchronous mode** for real-time driving. In synchronous mode, the simulation only advances when `world.tick()` is called, which makes driving feel choppy.

Check current mode:
```bash
curl -s http://127.0.0.1:58337/api/simulation/status | python3 -c "import sys,json;d=json.load(sys.stdin);print('sync_mode:', d.get('sync_mode'))"
```

If `sync_mode: true`, switch to async:
```bash
curl -X POST http://127.0.0.1:58337/api/simulation/settings -H 'Content-Type: application/json' -d '{"sync_mode": false}'
```

The default should be async mode for the web dashboard.

---

## Performance Requirements

- **Input-to-visual latency**: < 150ms total
  - Keyboard → REST API call: < 10ms
  - REST API → CARLA apply_control: < 20ms  
  - CARLA physics tick: ~50ms (20Hz)
  - Camera capture + JPEG encode: ~30ms
  - WebSocket delivery + decode: ~30ms
- **Control send rate**: 20Hz (every 50ms)
- **Camera feed rate**: 20Hz (matching sensor_tick=0.05)
- **No frame skipping** during manual driving — every frame matters for responsiveness

---

## If Performance is Unacceptable

If the total latency exceeds 200ms and driving feels sluggish:

1. **Reduce camera resolution** temporarily: 640x360 instead of 1280x720
2. **Increase JPEG compression**: quality=60 instead of 85
3. **Use WebSocket control** instead of REST API (saves ~20ms per command)
4. **Skip world tick broadcast** during manual driving (saves bandwidth)
5. **Reduce sensor_tick**: "0.033" (30 FPS) instead of "0.05" (20 FPS)

If even with all optimizations the system cannot deliver < 200ms latency, the rendering backend approach (UE5 offscreen → JPEG → WebSocket) may be fundamentally too slow. In that case, consider:
- **UE5 Pixel Streaming** (WebRTC, hardware H.264 encoding, ~50ms latency)
- **Three.js browser rendering** (no server rendering needed, see `prompts/09-plan-b-threejs-renderer.md`)

---

## Verification

### Playwright test for driving:
```typescript
test("WASD drives the vehicle", async ({ page }) => {
  await page.goto("http://localhost:58336")
  await page.waitForTimeout(10000)
  
  // Get initial vehicle position
  const pos1 = await page.evaluate(async () => {
    const r = await fetch("/api/realtime/session")
    const s = await r.json()
    const r2 = await fetch(`/api/actors/${s.default_vehicle_id}`)
    const a = await r2.json()
    return a.transform.location
  })
  
  // Hold W for 3 seconds
  await page.keyboard.down("w")
  await page.waitForTimeout(3000)
  await page.keyboard.up("w")
  await page.waitForTimeout(500)
  
  // Get final position
  const pos2 = await page.evaluate(async () => {
    const r = await fetch("/api/realtime/session")
    const s = await r.json()
    const r2 = await fetch(`/api/actors/${s.default_vehicle_id}`)
    const a = await r2.json()
    return a.transform.location
  })
  
  // Vehicle should have moved significantly
  const dist = Math.sqrt(
    (pos2.x - pos1.x) ** 2 + (pos2.y - pos1.y) ** 2 + (pos2.z - pos1.z) ** 2
  )
  console.log(`Vehicle moved ${dist.toFixed(1)} meters`)
  expect(dist).toBeGreaterThan(5) // Should move at least 5m in 3s
})
```

---

## Key Controls Summary

| Key | Action |
|-----|--------|
| W | Throttle (accelerate forward) |
| S | Brake / Reverse |
| A | Steer left |
| D | Steer right |
| Space | Handbrake |
| T | Toggle autopilot (when implemented) |
| 1-4 | Camera mode (follow/bird/orbit/fpv) |
