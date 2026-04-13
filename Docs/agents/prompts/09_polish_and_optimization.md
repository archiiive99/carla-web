# Prompt 09 — Performance Optimization, Testing & Polish

## Context

All features are implemented (Prompts 01-08). Now perform a comprehensive optimization pass, write tests, handle edge cases, and polish the entire application.

Read before starting:
- `Docs/agents/carla_web_implementation_prompt.md` — Performance requirements, quality targets, testing strategy
- `Docs/agents/web_development_principles.md` — Engineering principles, performance budgets

---

## Task

### 1. Performance Audit

Run and analyze:

**Bundle size audit:**
```bash
npm run build
# Check dist/assets/ file sizes
ls -lh dist/assets/*.js
```
- Initial JS bundle must be **<200KB gzipped**
- Three.js must NOT be in the initial bundle (verify lazy loading via separate chunk)
- Recharts must NOT be in the initial bundle
- Identify and eliminate any unused imports

**Runtime performance audit:**
- Open Chrome DevTools → Performance tab
- Record a 30-second session with 3 cameras + 1 LiDAR + telemetry active
- Main thread must stay **<16ms per frame** (60fps capable)
- Identify and fix any:
  - Unnecessary React re-renders (use React DevTools Profiler)
  - Main thread blocking from data processing
  - Memory leaks (growing heap over time)
  - Excessive garbage collection pauses

**Specific optimizations to verify:**

| Component | Requirement | How to verify |
|-----------|------------|---------------|
| CameraView | No React re-render on new frames | React Profiler shows 0 renders during streaming |
| LidarView | No new GPU allocations per frame | Three.js inspector shows stable geometry count |
| ActorList | Virtualized for 100+ actors | Scroll smoothly with 200 actors, DOM has <30 elements |
| IMU charts | Buffer + flush at 10Hz | Console.log shows data flush every 100ms, not every sample |
| TopBar metrics | useRef update, no state | React Profiler shows 0 renders for TopBar during streaming |
| StatusBar | useRef update, no state | Same as above |
| WebSocket | Binary frames only for sensor data | Network tab shows binary frames, no JSON for cameras/LiDAR |
| Workers | All sensor processing off main thread | Performance tab shows minimal main thread activity during streaming |

### 2. Memory Optimization

- **ImageBitmap cleanup:** Call `bitmap.close()` after drawing to canvas. Verify no ImageBitmap accumulation.
- **Float32Array reuse:** LiDAR processor worker must reuse pre-allocated arrays, not create new ones per frame.
- **Three.js disposal:** On LiDAR component unmount, call `geometry.dispose()`, `material.dispose()`, `renderer.dispose()`.
- **WebSocket buffer:** If send buffer exceeds limit, the bridge disconnects the client. Frontend should monitor `bufferedAmount`.
- **Event log:** Cap at 1000 events, remove oldest when exceeded.
- **Canvas:** Explicitly set canvas size to match container (avoid upscaling).

### 3. Error Handling & Edge Cases

**Connection:**
- CARLA server not running → show clear error in TopBar, disable all controls, retry connection
- Bridge not running → same
- WebSocket drops mid-stream → auto-reconnect, show temporary "Reconnecting..." toast, resume subscriptions
- Pixel Streaming drops → fall back to camera mode, show notification

**Data:**
- Sensor destroyed server-side → remove from sensor panel, show toast
- Actor destroyed server-side → remove from actor list, deselect if selected
- Map reload → clear all actors and sensors, show loading overlay
- Stale frame data (timestamp older than last received) → discard silently
- Malformed binary data → log warning, skip frame, don't crash

**UI:**
- Panel resized to 0 → treat as collapsed, show expand button
- Window resize → recalculate canvas sizes, Three.js renderer size
- Browser tab hidden → pause rendering (stop `requestAnimationFrame`), resume on visible
- Multiple tabs open → warn user (only one WebSocket connection should be active per bridge)

### 4. Accessibility

- All interactive elements are keyboard-navigable (Tab order)
- Focus rings visible on all focusable elements (shadcn handles this)
- Screen reader labels on icon-only buttons (`aria-label`)
- Color is never the only indicator of state (add text/icons alongside color)
- Reduced motion: respect `prefers-reduced-motion` — disable transitions/animations
- Minimum contrast ratio WCAG AA for all text

### 5. Testing

**Unit Tests (Vitest):**
```
src/__tests__/
├── lib/
│   ├── ws-protocol.test.ts       # Binary protocol encode/decode round-trip
│   ├── carla-api.test.ts         # API client with fetch mock
│   ├── color-maps.test.ts        # Depth/segmentation color mapping
│   └── sensor-registry.test.ts   # Sensor type → component mapping
├── stores/
│   ├── simulationStore.test.ts   # State transitions
│   ├── actorStore.test.ts        # Actor CRUD operations
│   └── sensorStore.test.ts       # Subscription management
└── utils/
    └── image-utils.test.ts       # Image conversion helpers
```

Write at minimum:
- Protocol parser: test every channel type (encode → decode → assert equality)
- Protocol parser: test malformed data (truncated buffer, wrong channel ID)
- Store: simulation state transitions (disconnected → connecting → connected)
- Store: actor spawn, select, destroy flow
- API client: verify correct URL construction and request body for each endpoint

**Component Tests (React Testing Library):**
```
src/__tests__/components/
├── SimulationControls.test.tsx   # Play/pause/step button behavior
├── WeatherControls.test.tsx      # Slider interaction, preset selection
├── SpawnPanel.test.tsx           # Form validation, submit behavior
├── ActorList.test.tsx            # Selection, context menu, filtering
└── EventLog.test.tsx             # Event display, filtering, scroll
```

**Performance Tests:**
- LiDAR render benchmark: measure time to update 200K points
- Image decode benchmark: measure time to decode 1080p JPEG to ImageBitmap
- WebSocket throughput: measure frames processed per second under load

**E2E Tests (Playwright):**
```
e2e/
├── connection.spec.ts            # Connect to mock bridge, verify UI state
├── sensor-panel.spec.ts          # Add sensor to grid, verify canvas renders
├── controls.spec.ts              # Play/pause, weather change
└── actor-management.spec.ts      # Spawn vehicle, select, destroy
```

Use a mock bridge server for E2E tests (simple Node.js WebSocket server that sends test data).

### 6. Documentation

**README.md** for `carla-web/`:
- Project description
- Prerequisites (Node.js 18+, CARLA server, Python bridge)
- Getting started (`npm install`, `npm run dev`)
- Architecture overview (brief)
- Configuration (environment variables, settings)
- Development commands

**README.md** for `carla-web-bridge/`:
- Project description
- Prerequisites (Python 3.10+, CARLA Python API, turbojpeg)
- Getting started (`pip install -r requirements.txt`, `uvicorn src.main:app`)
- API documentation (link to auto-generated FastAPI docs at `/docs`)
- Configuration (environment variables)
- Docker usage

### 7. Final Quality Targets

| Metric | Target | How to measure |
|--------|--------|---------------|
| Initial JS bundle | <200KB gzipped | `next build` output |
| Time to interactive | <3 seconds | Lighthouse |
| Main thread frame budget | <16ms | Chrome Performance tab |
| Camera feed FPS | 20-30 FPS | In-app FPS counter |
| LiDAR render FPS | 10-20 FPS (200K pts) | In-app FPS counter |
| Memory (10 sensors) | <500MB | Chrome Task Manager |
| WebSocket reconnect | <2 seconds | Manual disconnect test |
| Accessibility score | >90 | Lighthouse |
| Unit test coverage | >70% for lib/ | Vitest coverage report |
| E2E test pass rate | 100% | Playwright CI |

### 8. Quality Checklist

- [ ] Bundle size under 200KB gzipped (initial)
- [ ] No main thread blocking during sensor streaming
- [ ] No memory leaks over 5-minute session
- [ ] All Three.js resources properly disposed on unmount
- [ ] ImageBitmaps closed after canvas draw
- [ ] React Profiler shows zero unnecessary re-renders during streaming
- [ ] Auto-reconnect works for WebSocket and Pixel Streaming
- [ ] All error states show user-friendly messages
- [ ] Accessibility: keyboard navigation, screen reader labels, contrast
- [ ] Unit tests pass (>70% coverage on lib/)
- [ ] Component tests pass
- [ ] E2E tests pass against mock bridge
- [ ] README documentation complete for both frontend and bridge
- [ ] `npm run build` produces zero errors and zero warnings
- [ ] `npm run lint` passes
- [ ] `pip install && pytest` passes for bridge
