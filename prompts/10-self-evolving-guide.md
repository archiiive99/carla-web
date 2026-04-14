# Self-Evolving Development Guide

## THIS IS A LARGE-SCALE, LONG-RUNNING TASK

This is NOT a quick fix. This is NOT a 30-minute job. This is a continuous, open-ended development effort to build a **production-quality CARLA web dashboard** from an existing codebase that has many unfinished and broken parts. You will implement dozens of features, fix hundreds of issues, refactor components, add new functionality, and iterate indefinitely. Treat this as your full-time job. There is no "done" state.

The codebase already has a skeleton — stores, workers, components, API routes — but many parts are placeholder, broken, or incomplete. Your job is to make every single feature actually work, look professional, and be stable.

---

## CRITICAL RULE #1: HOT RELOAD ONLY

**NEVER kill or restart the streaming stack.** The stack is already running with hot reload enabled:

- **Bridge** (`uvicorn --reload --reload-dir src`): any save to `carla-web-bridge/src/` triggers automatic reload within ~1-2 seconds
- **Frontend** (Vite HMR): any save to `carla-web/src/` triggers hot module replacement within <500ms — the browser updates without full page reload
- **CARLA server**: persistent UE5 process, never needs restart for code changes

Your workflow on every change is:
```
Edit file → Save → Wait 1-2 seconds → Verify the change in browser → Next edit
```

**NEVER run any of these commands:**
- `./start_streaming.sh --kill` or `./start_streaming.sh`
- `kill`, `pkill`, `killall`, or any process management
- `npm run dev`, `npx vite`, `uvicorn` (they are already running)
- `systemctl`, `service`, or any service management
- Any command that would restart, stop, or interfere with the running processes

**If you see an import error, crash, or reload failure in the terminal:**
- It means YOUR code edit introduced a syntax error, missing import, or type error
- Fix the code, save again — the reload will retry automatically
- Do NOT restart anything

**The ONLY exception** — installing a new package:
```bash
# npm packages: install without stopping dev server — Vite picks it up automatically
cd /data1/song99/carla/carla-web && npm install <package-name>

# pip packages: install in the bridge venv — uvicorn picks it up on next reload
cd /data1/song99/carla/carla-web-bridge && source .venv/bin/activate && pip install <package-name>
```

---

## CRITICAL RULE #2: YOU MUST VISUALLY VERIFY EVERY CHANGE WITH PLAYWRIGHT

**This is non-negotiable.** Do NOT assume your change works because the code looks correct. Do NOT assume it works because `curl /health` returns OK. Do NOT assume it works because there are no TypeScript errors. You MUST verify with your own eyes through Playwright that the browser renders the correct result.

### Why This Matters

The previous developer declared the system "working" while the browser was showing **"Waiting for bridge camera..."** — a clear sign that the camera feed was NOT actually rendering. Health checks passed, WebSocket connected, but the actual user-facing feature was broken. This is unacceptable.

### How to Verify

**For every change that affects the UI, you MUST:**

1. **Take a screenshot with Playwright** and visually inspect it:
```bash
cd /data1/song99/carla/carla-web
npx playwright test --headed  # or use the Playwright API directly
```

2. **Or use a quick Playwright script** to screenshot and check:
```typescript
// test-visual.ts — run with: npx tsx test-visual.ts
import { chromium } from "playwright"

async function verify() {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.goto("http://127.0.0.1:58336")
  
  // Wait for the page to be fully loaded
  await page.waitForTimeout(5000)
  
  // Screenshot the full page
  await page.screenshot({ path: "/tmp/carla-web-full.png", fullPage: true })
  
  // Check if camera feed is rendering (not just "Waiting for...")
  const waitingText = await page.locator("text=Waiting").count()
  if (waitingText > 0) {
    console.error("FAIL: Camera feed is still showing 'Waiting for...' text")
    console.error("The camera feed is NOT rendering. Fix it.")
  }
  
  // Check if canvas has actual pixel data (not blank)
  const canvases = await page.locator("canvas").all()
  for (const canvas of canvases) {
    const box = await canvas.boundingBox()
    if (box && box.width > 100 && box.height > 100) {
      // Sample pixels to check if the canvas has real content
      const pixels = await canvas.evaluate((el: HTMLCanvasElement) => {
        const ctx = el.getContext("2d")
        if (!ctx) return { r: 0, g: 0, b: 0 }
        const data = ctx.getImageData(el.width / 2, el.height / 2, 1, 1).data
        return { r: data[0], g: data[1], b: data[2] }
      })
      
      // If all pixels are black (0,0,0), the canvas is likely blank
      if (pixels.r === 0 && pixels.g === 0 && pixels.b === 0) {
        console.error("FAIL: Canvas exists but is rendering black pixels")
        console.error("The camera feed is not receiving data or not drawing frames.")
      } else {
        console.log(`OK: Canvas has real content — pixel sample: (${pixels.r}, ${pixels.g}, ${pixels.b})`)
      }
    }
  }
  
  // Check for console errors
  page.on("console", msg => {
    if (msg.type() === "error") {
      console.error("Browser console error:", msg.text())
    }
  })
  
  // Check WebSocket connection
  const wsConnected = await page.evaluate(() => {
    // Look for connection status indicators in the DOM
    const badges = document.querySelectorAll("[data-state], .badge")
    for (const badge of badges) {
      if (badge.textContent?.toLowerCase().includes("connected")) return true
    }
    return false
  })
  console.log(`WebSocket connected: ${wsConnected}`)
  
  await browser.close()
}

verify().catch(console.error)
```

3. **For camera feed specifically**, check that:
   - The canvas element exists and is visible
   - The canvas is NOT blank (all-black pixels)
   - The canvas pixel values CHANGE between frames (live feed, not frozen)
   - There is NO "Waiting for..." overlay text visible
   - The FPS counter shows a non-zero value

4. **For 3D viewport**, check that:
   - The Three.js canvas renders (not blank)
   - Actor meshes are visible (colored boxes/capsules)
   - Actors are MOVING (compare two screenshots taken 2 seconds apart)

5. **For control panels**, check that:
   - Buttons are clickable and trigger API calls
   - Sliders update values
   - Dropdowns open and show options
   - Toast notifications appear on success/error

### When to Skip Visual Verification

You may skip Playwright testing ONLY for:
- Pure TypeScript type changes that don't affect runtime
- Backend-only changes that you can verify with `curl`
- Comment or documentation changes

For EVERYTHING else — Playwright screenshot + visual inspection is mandatory.

---

## CRITICAL RULE #3: DIAGNOSE THE ACTUAL CAMERA FEED ISSUE

Before starting any improvement work, you MUST first fix the camera feed if it's showing "Waiting for bridge camera...". This is the most critical user-facing feature.

### Diagnostic Steps

1. **Check if the bridge has a camera sensor:**
```bash
curl -s http://127.0.0.1:58337/api/realtime/session | python3 -m json.tool
```
Expected: `"session_ready": true, "default_camera_id": <number>`

If `session_ready` is false: the bridge failed to spawn a vehicle + camera. Check bridge logs.

2. **Check if the WebSocket is sending camera frames:**
```python
import asyncio, json, struct, websockets

async def test():
    resp = __import__("urllib.request").request.urlopen("http://127.0.0.1:58337/api/realtime/session")
    session = json.loads(resp.read())
    camera_id = session.get("default_camera_id")
    if not camera_id:
        print("ERROR: No camera sensor. session_ready =", session.get("session_ready"))
        return
    
    async with websockets.connect("ws://127.0.0.1:58337/ws") as ws:
        await ws.send(json.dumps({"action": "subscribe", "sensor_id": camera_id}))
        print(f"Subscribed to camera {camera_id}, waiting for frames...")
        
        for i in range(5):
            data = await asyncio.wait_for(ws.recv(), timeout=10)
            if isinstance(data, bytes) and len(data) > 5:
                channel = data[0]
                if channel == 0x01:  # Camera
                    jpeg_size = len(data) - 29  # 5 header + 24 payload header
                    is_jpeg = data[29:31] == b"\xff\xd8"
                    print(f"  Frame {i}: {len(data)} bytes, JPEG valid: {is_jpeg}, JPEG size: {jpeg_size}")
                elif channel == 0x10:  # World tick
                    print(f"  WorldTick frame: {len(data)} bytes")
        print("OK: Camera frames are being sent")

asyncio.run(test())
```

3. **Check if the frontend is subscribing to the camera:**
Open browser DevTools → Network → WS tab → look for the subscribe message being sent. If no subscribe message is sent, the frontend doesn't know the camera sensor ID.

4. **Check if the frontend is receiving and decoding frames:**
Open browser DevTools → Console → look for any errors from the ws-receiver worker or image-decoder worker.

### Common Camera Feed Failures

| Symptom | Root Cause | Fix |
|---------|-----------|-----|
| "Waiting for bridge camera..." | Frontend not subscribing | Frontend must call `/api/realtime/session`, get `default_camera_id`, send subscribe message |
| Canvas exists but black | ImageBitmap decode failing | Check that JPEG bytes are valid, check createImageBitmap call |
| Canvas shows single frozen frame | `bitmap.close()` not called, or animation loop not running | Ensure requestAnimationFrame loop is active |
| No canvas at all | Component not rendering | Check React rendering, check sensor store subscriptions |
| Frames in WS inspector but no canvas update | Worker → main thread communication broken | Check postMessage/onmessage chain |

---

## Health Check (passive, non-destructive)

Before each improvement cycle, run a quick passive check. Do NOT restart anything based on these results — just use them to understand the current state.

```bash
# Bridge alive and connected to CARLA?
curl -sf http://127.0.0.1:58337/health | python3 -m json.tool

# Default session with vehicle + camera?
curl -sf http://127.0.0.1:58337/api/realtime/session | python3 -m json.tool

# Frontend serving?
curl -sf -o /dev/null http://127.0.0.1:58336 && echo "frontend: OK" || echo "frontend: DOWN"
```

If the bridge shows `carla_connected: false`, read the bridge tmux pane logs:
```bash
tmux capture-pane -t carla-web -p -S -100
```

The error is likely a code bug from a recent edit. Fix the code, save, let it auto-reload.

---

## Development Phases (detailed specs in prompts/specs/)

Each phase has a dedicated spec document with exact file paths, component interfaces, API calls, implementation code, and acceptance criteria. **You MUST read the full spec before starting each phase.**

| Phase | Spec File | Summary |
|-------|-----------|---------|
| **0** | **`prompts/specs/phase0-camera-feed-must-work.md`** | **BLOCKER: Camera feed must show real live frames. Do not proceed until Playwright confirms pixels are non-black and changing.** |
| 1 | `prompts/specs/phase1-ui-audit-and-fix.md` | shadcn compliance audit, dark mode default, raw HTML replacement |
| 2 | `prompts/specs/phase2-sensor-views.md` | All 14 sensor type visualizations — verify/implement each one |
| 3 | `prompts/specs/phase3-3d-viewport.md` | Three.js world scene with actor meshes, 4 camera modes, ground, lighting |
| 4 | `prompts/specs/phase4-control-panels.md` | Weather, map, actor, traffic, recording control panels — verify and complete |
| 5 | `prompts/specs/phase5-ux-polish.md` | Telemetry tab, performance HUD, keyboard shortcuts, responsive layout, connection UX |
| 6 | `prompts/specs/phase6-advanced.md` | Recording/replay, data export, multi-camera grid, scenarios, WebSocket optimization |

**Work order**: Phase 0 (camera MUST work) → 1 → 2 → 3 → 4 → 5 → 6 → restart from Phase 1 finding deeper improvements.

**Phase 0 is a hard blocker.** If the camera feed shows "Waiting for bridge camera..." or renders black pixels, you MUST fix it before moving on. Use Playwright to verify real frames are rendering. Do not trust curl health checks alone — they can pass while the browser shows nothing.

**Before starting any phase**, fix the camera feed issue if it exists. A dashboard that can't show a camera feed is fundamentally broken.

---

## How to Work on Each Phase

### Each improvement cycle:

1. **Read**: Read the full phase spec document carefully
2. **Pick**: Choose the next unfinished item from the spec
3. **Read existing code**: Always read the file before editing it. Understand what exists.
4. **Implement**: Make the minimal changes needed. Save after each file.
5. **Wait**: 1-2 seconds for hot reload
6. **Verify with Playwright**: Take a screenshot, inspect it, check for the expected result
7. **Fix if broken**: If the screenshot shows something wrong, fix it immediately
8. **Commit**: `git add <specific-files> && git commit -m "feat: <description>"`
9. **Next**: Move to the next item immediately. Do not pause. Do not wait.

### Quality rules:

- Every UI element → shadcn/ui component (see `prompts/08-ui-constraints.md`)
- Every icon → `lucide-react` package
- Every style → Tailwind CSS utility class
- Every color → CSS variable token (`bg-primary`, `text-muted-foreground`, etc.)
- No `any` types in TypeScript — use proper types from `types/carla.ts`, `types/ws.ts`, `types/api.ts`
- No `console.log` left in committed code — use proper error boundaries and toast notifications
- No dead code, unused imports, or commented-out blocks
- All API calls must have error handling with `toast.error()` from Sonner
- All async operations must show loading state (Button disabled + Spinner, or Skeleton)

### When you break something:

1. Check the error message (browser console via Playwright, or terminal pane logs)
2. The error is almost always in YOUR most recent edit
3. Fix the specific line that caused the error
4. Save → auto-reload → verify with Playwright screenshot
5. Do NOT restart any service. Ever.

---

## File Ownership

**You CAN freely edit:**
- `carla-web/src/**/*` — all frontend source code
- `carla-web-bridge/src/**/*` — all backend source code
- `prompts/**/*` — documentation (if you need to update specs as you learn)

**You should NOT manually edit:**
- `carla-web/src/components/ui/*` — these are auto-generated by shadcn CLI. To add a new shadcn component: `cd carla-web && npx shadcn@latest add <component-name>`
- `Unreal/**/*` — UE5 project source
- `LibCarla/**/*` — C++ core library

---

## Key File Paths

| What | Path |
|------|------|
| Frontend root | `/data1/song99/carla/carla-web/` |
| Frontend source | `/data1/song99/carla/carla-web/src/` |
| shadcn UI components | `/data1/song99/carla/carla-web/src/components/ui/` |
| Zustand stores | `/data1/song99/carla/carla-web/src/stores/` |
| WebSocket protocol | `/data1/song99/carla/carla-web/src/lib/ws-protocol.ts` |
| Channel + frame types | `/data1/song99/carla/carla-web/src/types/ws.ts` |
| CARLA types | `/data1/song99/carla/carla-web/src/types/carla.ts` |
| API types | `/data1/song99/carla/carla-web/src/types/api.ts` |
| REST API client | `/data1/song99/carla/carla-web/src/lib/carla-api.ts` |
| Sensor registry | `/data1/song99/carla/carla-web/src/lib/sensor-registry.ts` |
| Web Workers | `/data1/song99/carla/carla-web/src/workers/` |
| Worker context | `/data1/song99/carla/carla-web/src/contexts/WorkerContext.tsx` |
| Sensor data hooks | `/data1/song99/carla/carla-web/src/hooks/useSensorData.ts` |
| Bridge root | `/data1/song99/carla/carla-web-bridge/` |
| Bridge source | `/data1/song99/carla/carla-web-bridge/src/` |
| Bridge config | `/data1/song99/carla/carla-web-bridge/src/config.py` |
| Binary protocol | `/data1/song99/carla/carla-web-bridge/src/ws/protocol.py` |
| Channel IDs | `/data1/song99/carla/carla-web-bridge/src/ws/channels.py` |
| Protocol spec doc | `/data1/song99/carla/prompts/03-binary-protocol.md` |
| UI constraint rules | `/data1/song99/carla/prompts/08-ui-constraints.md` |

---

## Verification Checklist (run after each major change)

```bash
# 1. Bridge health
curl -sf http://127.0.0.1:58337/health

# 2. Session with camera
curl -sf http://127.0.0.1:58337/api/realtime/session

# 3. Playwright visual test (THE MOST IMPORTANT ONE)
cd /data1/song99/carla/carla-web && npx playwright test
# OR: take a screenshot manually and inspect it

# 4. Check for TypeScript errors
cd /data1/song99/carla/carla-web && npx tsc --noEmit 2>&1 | head -20

# 5. Check bridge logs for Python errors
tmux capture-pane -t carla-web -p -S -30 | grep -i "error\|traceback\|exception"
```

**The Playwright visual test is the most important one.** If the screenshot looks wrong, nothing else matters.
