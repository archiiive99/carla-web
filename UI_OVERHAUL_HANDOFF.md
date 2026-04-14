# CARLA Web UI/UX Overhaul — Handoff

> Context for the next agent continuing this work. The previous agent operated for 36 iterations
> against a **stale copy** of the repo at `/home/song99/carla/carla-web/` instead of the live one
> at `/data1/song99/carla/carla-web/`. All code changes described below exist on `/home/song99/...`
> only and must be ported, re-derived, or discarded. Read the "Porting" section before touching
> code.

---

## 0. Critical Path Problem (Read First)

There are **two separate copies** of this repo on the filesystem, not symlinks:

| Path | State | Size comparison example |
|---|---|---|
| `/home/song99/carla/carla-web/` | **Stale** — where the previous agent edited for 36 iterations | `LeftPanel.tsx` = 11055 bytes |
| `/data1/song99/carla/carla-web/` | **Live** — where the user works and where `start_streaming.sh` launches | `LeftPanel.tsx` = 14893 bytes |

The primary working-directory hint in CLAUDE.md pointed to `/home/song99/carla`, which misled the
agent. **All user commands, launches, and new edits must target `/data1/song99/carla/`.** The
`/home/song99/carla/` copy can be deleted or ignored.

The active launch script is `/data1/song99/carla/start_streaming.sh` (tmux session: `carla-web`,
ports: Frontend 58336, Bridge 58337, CARLA 58338 on GPU 2).

### Porting strategy options

1. **Port via git diff** — if both copies share a git history baseline:
   ```bash
   cd /home/song99/carla/carla-web
   git diff --no-color > /tmp/overhaul.patch
   cd /data1/song99/carla/carla-web
   git apply --3way /tmp/overhaul.patch   # may need --reject for conflicts
   ```
   The copies diverge (the `/data1` one is newer), so expect conflicts. Apply selectively.

2. **Re-derive** — use this document as a spec and re-apply the changes cleanly on `/data1`. The
   mandate and per-iteration list below give enough structure to do this without reading the agent's
   diff.

3. **Discard** — if the `/data1` copy has already made independent progress on the same regions,
   start fresh using this document as background only.

---

## 1. The Mandate (quoted in full — this is the north star)

> You are not a cosmetic patcher. You are redesigning the interface. Every pixel on screen is up
> for revision, including code that has not been touched in months or years. Legacy is not sacred —
> if an old button, panel, layout, or control contradicts the design system you are producing, it
> gets rewritten, moved, resized, merged, or deleted.

### §3 — Design principles (in priority order)

- **§3.1 REMOVE BEFORE YOU ADD.** Every change asks: can this be achieved by deleting something
  instead of adding?
- **§3.2 ONE GRID, ONE RHYTHM.** Single spacing scale, single type scale, single radius scale,
  single semantic palette. Create scales if missing.
- **§3.3 SIBLINGS MATCH.** Buttons in same row = same height. Icons in same toolbar = same size.
  Widths equal or follow one documented rule.
- **§3.4 HIERARCHY VISIBLE.** Primary = strong fill; secondary = outlined/ghost; destructive =
  red and isolated from primary.
- **§3.5 GROUPING REFLECTS MEANING.** Canonical failure: `[Spawn] [Traffic] [Destroy All]` —
  Traffic (behavior) interleaved between lifecycle actions. Correct: `[Spawn][Destroy All] |
  [Traffic]`.
- **§3.6 TYPOGRAPHY.** Body text ≥14px (text-sm) with comfortable line-height. ≤2–3 weights per
  view. Tabular nums on numeric columns.
- **§3.7 COLOR IS SEMANTIC.** Each color has one meaning. No raw palette (`text-green-500`).
- **§3.8 WHITESPACE IS A CONTROL.** Don't pack edge-to-edge. Density only for data tables /
  telemetry.
- **§3.9 MOTION.** <200ms, eased, user-initiated only.
- **§3.10 ACCESSIBILITY.** Focus states on every interactive element; 40×40px hit targets;
  WCAG AA contrast; aria-labels on icon-only buttons; no color-only signals.

### §7 — Failure recovery

When a violation surfaces, don't patch one instance — **sweep the whole surface for the same
class of violation and fix them all**. Update the audit so the class isn't missed again.

---

## 2. Tech stack

- **Framework:** React 19 + Vite + TypeScript (strict), `erasableSyntaxOnly` enabled
- **Styling:** Tailwind CSS v4 with `@theme inline` (file: `src/index.css`)
- **Primitives:** shadcn/ui components copied to `src/components/ui/` + Base UI React
- **Icons:** lucide-react
- **3D:** three.js + R3F (react-three-fiber)
- **State:** zustand (`src/stores/`)
- **Layout:** react-resizable-panels
- **Routing:** react-router-dom (two routes: `SimulationPage`, `SettingsPage`)

### Critical Tailwind v4 + Vite caveat

When adding tokens to `@theme inline`, HMR may not re-register them reliably. If `getPropertyValue`
on a new `--color-X` returns empty at runtime (even though the source CSS declares it), the Tailwind
JIT cache is stale. **Restart the dev server**:
```bash
./start_streaming.sh --kill && ./start_streaming.sh
```
Symptom caught in the previous run: `bg-success/10 text-success` resolved to a red color instead of
green because `--color-success` was undefined. After dev server restart, it resolved correctly.

---

## 3. Current state of the design system (as it existed on `/home/song99`)

### Semantic color tokens (added to `@theme inline`, both `:root` light and `.dark`)

```css
--color-success: var(--success);
--color-success-foreground: var(--success-foreground);
--color-warning: var(--warning);
--color-warning-foreground: var(--warning-foreground);
--color-info: var(--info);
--color-info-foreground: var(--info-foreground);
--color-overlay-bg: var(--overlay-bg);    /* always oklch(0 0 0) — 3D viewport is always dark */
--color-overlay-fg: var(--overlay-fg);    /* always oklch(1 0 0) */
```

Light-mode values:
```css
--success: oklch(0.62 0.17 149);
--success-foreground: oklch(0.985 0 0);
--warning: oklch(0.72 0.16 85);
--warning-foreground: oklch(0.2 0.02 85);
--info: oklch(0.6 0.18 250);
--info-foreground: oklch(0.985 0 0);
--overlay-bg: oklch(0 0 0);
--overlay-fg: oklch(1 0 0);
```

Dark-mode values:
```css
--success: oklch(0.72 0.18 149);
--success-foreground: oklch(0.16 0 0);
--warning: oklch(0.82 0.17 85);
--warning-foreground: oklch(0.16 0.02 85);
--info: oklch(0.7 0.18 250);
--info-foreground: oklch(0.16 0 0);
--overlay-bg: oklch(0 0 0);
--overlay-fg: oklch(1 0 0);
--ring: oklch(0.72 0.016 285.938);          /* bumped from 0.552 for focus visibility */
--sidebar-ring: oklch(0.72 0.016 285.938);  /* bumped to match */
```

### Chart palette (replaced shadcn's default grayscale with 7 categorical hues)

```css
/* Light */
--chart-1: oklch(0.63 0.22 25);    /* red */
--chart-2: oklch(0.78 0.15 85);    /* amber */
--chart-3: oklch(0.65 0.17 145);   /* green */
--chart-4: oklch(0.58 0.2 250);    /* blue */
--chart-5: oklch(0.6 0.2 300);     /* purple */
--chart-6: oklch(0.7 0.13 200);    /* cyan */
--chart-7: oklch(0.68 0.18 20);    /* warm-red */

/* Dark (slightly lighter L for dark-bg contrast) */
--chart-1: oklch(0.7 0.22 25);
--chart-2: oklch(0.82 0.17 85);
--chart-3: oklch(0.72 0.17 145);
--chart-4: oklch(0.68 0.2 250);
--chart-5: oklch(0.68 0.22 300);
--chart-6: oklch(0.75 0.13 200);
--chart-7: oklch(0.74 0.2 20);
```

Previously `--chart-1..5` were all monochrome grays — `ImuChart` X/Y/Z axes were indistinguishable
because of that. Redefining fixes the ImuChart rendering as a side effect.

### Text scale

Added micro-step:
```css
--text-2xs: 0.625rem;          /* 10px */
--text-2xs--line-height: 1rem;
```
Replaces ~67 sites that used `text-[10px]`.

### Component variant extensions

Add `xs` size to SelectTrigger (`src/components/ui/select.tsx`) — ensures `data-[size=xs]:h-6`,
tighter padding, smaller chevron:
```
data-[size=xs]:h-6 data-[size=xs]:py-0.5 data-[size=xs]:pr-1.5 data-[size=xs]:pl-2 data-[size=xs]:text-xs
data-[size=xs]:[&_svg:not([class*='size-'])]:size-3
```

Add `xs` size to Toggle (`src/components/ui/toggle.tsx`):
```
xs: "h-6 min-w-6 px-2 text-xs"
```

---

## 4. Structural rework (iteration-level summary, 36 iterations)

Each iteration produced a concrete fix with §6 deliverable format (audit, proposed changes table,
§4 delete/consolidate/clarify/add counts, legacy-touched file list, verified/unverified status).
The consolidated list:

### TopBar (`src/components/layout/TopBar.tsx`)

- `ConnectionBadge` connected state: `bg-success/10 text-success hover:bg-success/15` (was `bg-green-500/10 text-green-500`).
- `ConnectionBadge` connecting state: `text-warning` (was `text-yellow-500`).
- All separators unified to `h-4` (was mix of `h-4`/`h-5`).
- Theme toggle, Help, Settings buttons: icon `size-3.5` uniformly (was mix of `size-3/3.5/4`).
- Icon-only buttons got `aria-label` (Help, Theme, Settings, plus dynamic state in labels).
- Weather/Map/Record popover triggers converted to **icon-only** `variant="ghost" size="icon-sm"`
  (previously Maps and Record had text+icon while Weather was icon-only — inconsistent cluster).
- Theme and Settings buttons wrapped in `<Tooltip>` so sighted mouse users see the label on hover.
- **Duplicated state removed:**
  - FPS readout removed from TopBar (StatusBar has it with a sparkline — canonical).
  - Map name no longer duplicated in StatusBar (TopBar is canonical).
  - Sync mode badge removed from StatusBar (the SimulationControls Switch is the single source).

### StatusBar (`src/components/layout/StatusBar.tsx`)

- Latency now renders with shape-differentiated icons (`SignalHigh`/`SignalMedium`/`SignalLow` from
  lucide) + semantic color tokens (`text-success`/`text-warning`/`text-destructive`). Previously
  color-only via `text-green-500/-yellow-500/-red-500` — §3.10 color-only signal violation.
- `aria-label` on the latency readout is dynamic: `Latency Xms, low/moderate/high latency`.
- Sparkline opacity bumped from 0.5 → 0.8 (was near-invisible).
- Removed duplicated sync badge, FPS readout duplicate, map truncation duplicate.

### LeftPanel (`src/components/layout/LeftPanel.tsx`)

- **§3.5 canonical fix:** reordered bottom cluster from `[Spawn][Traffic][Destroy All]` to
  `[Spawn Actor] / [Destroy All]` lifecycle cluster + Separator + `[Traffic]` behavior cluster.
- Filter row: was 4 text buttons (`All`/`Vehicle`/`Walker`/`Sensor`) with `Sensor` visibly clipped
  in the ~156px sidebar. Replaced with 3 icon-only buttons (`Car`/`PersonStanding`/`Camera`) + dropped
  `All` entirely (re-clicking the active filter already deselects — `All` was redundant).
- Each filter button has `aria-label` + `aria-pressed`; row has `role="group"`.
- CollapsibleTrigger: dropped `font-medium` so the panel has 2 weights total (semibold header +
  regular body), down from 3.
- Actor button: dropped redundant `text-sm` on outer button (inner span governs).

### ActorDetails (`src/components/actors/ActorDetails.tsx`)

- 6 position/rotation inputs: `h-7` (28px, off-scale) → `h-8` (32px = shadcn `size="sm"`).
- Empty-state Monitor/Crosshair icon: `text-muted-foreground/30` → `text-muted-foreground` + `aria-hidden`.
- Empty-state subtitle: `text-muted-foreground/70` → `text-muted-foreground`.
- Actor type_id header: `text-xs` → `text-sm` (§3.6 body text threshold).
- Accordion triggers (Transform, Velocity, Vehicle Controls, Sensor Config): `text-xs` → `text-sm`.

### VehicleDetails (`src/components/actors/VehicleDetails.tsx`)

- Autopilot Switch: dropped `scale-75` (sub-40px hit target) + added `aria-label="Toggle autopilot"`.
- Lights Toggles: 8 toggles migrated from `size="sm" className="h-6 px-2 text-2xs"` override stack
  to native `size="xs"` variant (after Toggle xs variant was added).
- Door Buttons and Open All Button: removed `text-2xs` overrides, use `size="xs"` variant default.

### TrafficManagerPanel (`src/components/actors/TrafficManagerPanel.tsx`)

- Trigger button: `variant="outline" size="sm" gap-1.5 text-xs` (no w-full) + icon `size-3` →
  `w-full gap-1.5` + icon `size-3.5` to match sibling Spawn/DestroyAll.
- Hybrid Physics Switch: removed `scale-75` + added `aria-label`.
- Per-vehicle table Switch: removed `scale-50` + templated `aria-label="Auto lane change for actor ${id}"`.
- TableHead cells: `text-xs` → `text-sm` (column labels per §3.6). Body cells stay `text-xs`
  (density exception §3.8).

### EventLog (`src/components/shared/EventLog.tsx`)

- `EVENT_ICONS` and `EVENT_COLORS` remapped from 7 raw palette classes to `text-chart-N` + `bg-chart-N/10`.
- 6 filter Toggles: `size="sm" className="h-5 px-1.5"` override → `size="xs"` native.
- Each Toggle got `aria-label="Filter {type} events"` + `aria-pressed`.
- Filter row got `role="group" aria-label="Filter events by type"`.
- Auto-scroll Switch: removed `scale-50`. Added `className="peer"` so shadcn Label's
  `peer-disabled:opacity-50` propagates.
- Export/Clear buttons: added `aria-label="Export events as JSON"` / `"Clear events"`.

### SimulationControls (`src/components/controls/SimulationControls.tsx`)

- Play button active state: `bg-green-600 hover:bg-green-700` → `bg-success text-success-foreground hover:bg-success/90`.
- Pause button active state: `bg-yellow-600` → `bg-warning text-warning-foreground hover:bg-warning/90`.
- Play/Pause/Step: added dynamic `aria-label`.
- Speed SelectTrigger: kept `text-xs` intentionally for TopBar density; removed redundant `h-8`
  (sm variant already h-8).
- Sync Switch: added `className="peer"` so its Label dims when disabled.
- Separator inside `h-5` → `h-4` to match outer TopBar rhythm.

### MainViewport (`src/components/viewport/MainViewport.tsx`)

- Fullscreen button: added `aria-label` (dynamic exit/enter text).
- Empty-state Monitor icon: `/30` opacity → full `text-muted-foreground` + `aria-hidden`.
- Subtitle: `/70` opacity → full.

### Settings Page (`src/routes/SettingsPage.tsx`)

- Connection card: Bridge URL input no longer shares a flex row with action buttons (was narrow +
  mismatched Pixel Streaming URL width). Both URL inputs now full-width. Actions clustered in a
  single row: `[Test Connection] + status icon ... [Apply outline] [Save & Connect primary]`.
- Save & Connect promoted from `variant="secondary"` to default (primary fill).
- Apply demoted from default to `variant="outline"` — §3.4 hierarchy between commit-actions.
- Test Connection status icons: raw `text-green-500`/`text-red-500` → `text-success`/`text-destructive`
  + `aria-label`.
- Adaptive Quality Switch: removed `scale-75` + added `aria-label`.
- Target FPS + LiDAR Point Budget SelectTriggers: removed redundant `h-8` and `text-xs` overrides
  (form context deserves readable `text-sm` default per §3.6).

### VehicleControls (`src/components/controls/VehicleControls.tsx`)

- Keyboard hint overlay: replaced 6 custom `<Badge>` keys with design-system `<Kbd>` inside a
  `<KbdGroup>`. Dropped raw `bg-white/10 text-white/60 font-mono text-2xs h-6 w-8` override stack.
  Outer container is `aria-hidden="true"` (decorative).

### Sensor views (CameraView / RadarView / LidarView / SegmentationView)

- Each: Maximize/Close icon buttons at `className="size-5"` override (20px) → native `size="icon-xs"`
  (24px). All got `aria-label`. Icon size kept at `size-3`.

### SensorPanel (`src/components/sensors/SensorPanel.tsx`)

- Minimize, cell Maximize, cell Remove buttons: native `size="icon-xs"` (removed `size-5` overrides).
  Icon `size-2.5` → `size-3`. All `aria-label`ed. Button backgrounds use `bg-overlay-bg/30 hover:bg-overlay-bg/60`.
- Layout grid SelectTrigger: migrated to native `size="xs"` variant.

### OpenDriveViewer (`src/components/map/OpenDriveViewer.tsx`)

- Refresh button: added `aria-label="Refresh map topology"`.
- Canvas drawing colors all moved from hex to oklch values matching chart-N / muted tokens.

### MiniMap (`src/components/map/MiniMap.tsx`)

- Legend 4 dots: `bg-green-500`/`bg-yellow-500`/`bg-cyan-500`/`bg-blue-500` → `bg-chart-3/2/6/4` (matches canvas).
- Canvas `COLORS` constant: all 13 hex values → oklch strings matching `--chart-*` / `--background` /
  `--muted-foreground` tokens. Canvas actor dots now render the exact same hue as the legend.

### Viewport overlay sub-palette sweep

All `bg-black/NN` and `text-white/NN` usages in overlay components (`ViewportOverlay`, `CameraFallback`,
`MainViewport`, `MiniMap`, `VehicleControls`, `CameraView`, `SensorPanel`) migrated to
`bg-overlay-bg/NN` / `text-overlay-fg/NN` semantic tokens. ~25 sites.

**Excluded intentionally:**
- shadcn modal scrims in `ui/dialog.tsx`, `ui/alert-dialog.tsx`, `ui/sheet.tsx` at `bg-black/10`
  (upstream convention, third-party).
- `src/lib/detachable-window.ts` — hex in HTML template for a popup window where main-app CSS vars
  aren't loaded.
- `src/components/sensors/SegmentationView.tsx` — 8 segmentation-class colors are CARLA server-side
  standard and must match server-rendered segmentation buffer.
- `src/lib/format.ts` — dynamic `rgb()` string generation from runtime data.
- `src/components/ui/chart.tsx` — shadcn third-party internals.

---

## 5. Violation-class sweeps completed

For each class, search-replace was done across **all** product files, not just the flagged one.

| Class | Before | After | Sites |
|---|---|---|---|
| Arbitrary text size `text-[10px]`/`text-[9px]` | 67 | 0 | 30+ files |
| Raw Tailwind palette (`text-green-500` etc.) | 15+ | 0 | 7 files |
| Opacity overrides on `text-muted-foreground/NN` | 5 | 0 | 4 files |
| Hex canvas `fillStyle`/`strokeStyle` | 25+ | 0 | 6 files |
| Overlay raw alpha (`bg-black/NN`, `text-white/NN`) | 25+ | 0 | 7 files |
| `scale-50`/`scale-75` on Switch (sub-40px hit target) | 5 | 0 | 5 files |
| `size-5` override shrinking `size="icon-xs"` buttons | 9 | 0 | 4 files |
| `h-7` off-scale input height | 6 | 0 | 1 file |
| Redundant `h-8` override on `size="sm"` SelectTrigger | 3 | 0 | 3 files |
| `SelectTrigger size="sm" className="text-xs"` in form context | 4 | 0 | 2 files |
| Icon-only buttons without `aria-label` | ~20 | 0 | 10 files |

---

## 6. Things that remain (pick up here)

### High-priority queue

- **Dev-mode mock actor-store wiring.** `LeftPanel` renders hard-coded `MOCK_ACTORS` when the store
  is empty, but clicking them sets `selectedActorId` in the store, and `ActorDetails` reads actors
  from the store — so the right panel stays on the empty state. This blocks visual verification of
  `ActorDetails`, `ViewportOverlay` (speed/follow button), and `TrafficManagerPanel` per-vehicle
  table. Fix: either put the mocks into the store when disconnected, or read from the same mock
  source in both places.
- **Popover/Dialog trigger visual verification.** `MapControls`, `WeatherControls`, `RecordingControls`
  triggers are `disabled={!isConnected}` in the UI, so their interior forms can't render without a
  live CARLA bridge. Visually unaudited for sibling-match.
- **Tooltip on Help / Weather / Map / Record popover triggers.** Theme and Settings got tooltips
  but popover triggers require Tooltip-inside-Popover composition which Base UI doesn't support
  cleanly. Either needs a wrapper abstraction or accept aria-label-only for these.
- **Font-weight audit in BottomPanel sensor-view CardTitles.** All use `text-xs font-medium`.
  Consistent but below §3.6's ≥14px threshold. Keep for density or bump — needs design decision.

### Low-priority / stylistic

- WCAG contrast numeric measurement on focus rings, semantic badges.
- Light-mode visual audit (only dark mode screenshot-captured — the user was always in dark).
- SpawnPanel Dialog interior forms.
- RouteEditor dense toolbar (6 badges + buttons in a narrow row).
- TopBar header density — still 15+ elements in 48px. Could be further compressed.
- `w-[480px]` on TrafficManagerPanel Sheet — arbitrary but intentional panel width. Could become
  a named `--sheet-width` if more sheets appear.

### Known pre-existing issues (not introduced by the overhaul)

```
src/components/viewport/CameraFallback.tsx:46:9 - error TS18047: 'wsReceiverWorker' is possibly 'null'
src/lib/carla-api.ts:24:5 - error TS1294: syntax not allowed when 'erasableSyntaxOnly' is enabled
src/lib/carla-api.ts:62:15 - same
src/types/carla.ts:109:13 - same
src/types/ws.ts:3:13 - same
```

These 5 errors existed on `/home/song99` before any overhaul edits and are still present. Likely
the same set applies to `/data1`.

---

## 7. Deliverable format the mandate requires (§6)

Every UI change report must include:

1. **Audit** — full enumeration of the surface and its current inconsistencies.
2. **Proposed changes** — table of `(element, before, after, reason)`. Reason must cite §3.* principle
   or §5 rule.
3. **Delete / Consolidate / Clarify / Add counts** — from §4. Add list must be short relative to
   Delete/Consolidate.
4. **Legacy touched** — list of files that predated the task and were modified for consistency.
   Empty list = likely failed the mandate.
5. **Screenshots or rendered before/after** — or honest "dev server unavailable" note.
6. **Verified / Unverified** per change — evidence-backed.

### §7 Failure recovery

When the user points out a surviving inconsistency:
1. Don't argue it was "pre-existing."
2. Don't scope-limit to the specific instance — **search the whole surface for the same class and
   fix them all**.
3. Update the audit with the class so it isn't missed again.

---

## 8. Tooling that was used

- Playwright for screenshotting specific regions (`await page.locator(sel).boundingBox()` + `clip`).
- DOM `getComputedStyle` inspection via `page.evaluate` for WCAG / focus-ring verification.
- `getPropertyValue('--color-X')` on `document.documentElement` to verify token resolution — this
  caught the iteration-31 Tailwind JIT cache bug.
- `timeout 60 npx tsc -b` after every edit batch to catch breakage early.

The screenshot helper scripts (`shot.mjs`, `shot-click.mjs`, `shot-focus.mjs`, etc.) were moved
to `/tmp/carla-shot-scripts/` to avoid polluting `carla-web/` — if you want them, copy them back.

---

## 9. Launch / restart procedure

Canonical, as the user established:

```bash
cd /data1/song99/carla
./start_streaming.sh                  # Launch all (tmux session "carla-web")
./start_streaming.sh --kill           # Stop everything
./start_streaming.sh --status         # Health check
./start_streaming.sh --pixel-streaming  # Full stack with UE5 Pixel Streaming
./start_streaming.sh --no-carla       # Bridge + frontend only
```

Ports:
- Frontend: `http://127.0.0.1:58336`
- Bridge:   `http://127.0.0.1:58337`
- CARLA RPC: `localhost:58338` (GPU 2)

tmux: `tmux attach -t carla-web`

---

## 10. What the user repeatedly emphasized

- Work in `/data1/song99/carla` — not `/home/song99/carla`.
- The mandate's §1 (Legacy is not sacred) and §7 (fix the whole class) are load-bearing — they're
  the reason the agent ran for 36 iterations rather than 3.
- User speaks Korean; tone gets curt when agents bikeshed or miss obvious instructions.
- The previous agent missed the `/data1` path cue for 36 iterations — don't repeat that. Verify
  paths early.
- The user reserves the right to tell the agent to stop and hand off at any time.
