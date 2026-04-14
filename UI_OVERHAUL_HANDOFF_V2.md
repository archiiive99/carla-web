# CARLA Web UI/UX Overhaul — Handoff V2

> Autonomous /loop continuation of the CARLA Web dashboard redesign. Four iterations deep
> on `/data1/song99/carla/carla-web/`. Primary sweep is done; subsequent iterations pick
> up semantic HTML, edge cases, and small consistency work. Read §0 and §1 before touching
> code. This file supersedes `UI_OVERHAUL_HANDOFF.md` (v1).

---

## 0. Critical rules (non-negotiable)

- **Path:** work on `/data1/song99/carla/carla-web/` — NOT `/home/song99/carla/`. The
  `/home/song99` copy is stale; the original v1 handoff was written against it by mistake
  and every file size/line number there is misleading.
- **Never restart the streaming stack.**
  - Vite HMR on `58336` and uvicorn `--reload` on `58337` pick up edits automatically.
  - CARLA UE5 (`58338`, GPU 2) takes ~1 min to boot and other work depends on it.
  - Verify health via `curl http://127.0.0.1:58337/health`.
- **Autonomous loop contract:** keep iterating, never declare completion. Each iteration
  picks the single highest-impact improvement remaining, verifies concretely (`tsc`,
  `grep`, `curl`), and continues. When one task finishes, start the next in the same turn.
- **Prompts in English.** When drafting prompts/system rules for the user, the body must
  be English even if the conversation is Korean. The user explicitly requested this.
- **Cron `cf5de791`** fires the continuation prompt every minute (recurring, session-only,
  7-day auto-expiry). One iteration ≈ one firing. Do NOT call `CronCreate` again — it's
  already scheduled. If the session dies, re-create with the prompt from §11 below.

---

## 1. Mandate (UI/UX overhaul — north star)

> You are not a cosmetic patcher. You are redesigning the interface. Every pixel on screen
> is up for revision, including code that has not been touched in months or years. Legacy
> is not sacred — if an old button, panel, layout, or control contradicts the design system
> you are producing, it gets rewritten, moved, resized, merged, or deleted.

### §3 — Design principles (priority order)

| § | Principle | One-line expansion |
|---|-----------|---------------------|
| 3.1 | REMOVE before ADD | Every change asks: can this be achieved by deleting something? |
| 3.2 | ONE grid, ONE rhythm | Single spacing, type, radius, semantic-color scale. Create scales if missing. |
| 3.3 | SIBLINGS match | Same row = same height. Same toolbar = same icon size. Widths follow one documented rule. |
| 3.4 | HIERARCHY visible | Primary = strong fill; secondary = outlined/ghost; destructive = red, isolated. |
| 3.5 | GROUPING reflects meaning | Canonical failure: `[Spawn] [Traffic] [Destroy]`. Correct: `[Spawn][Destroy] \| [Traffic]`. |
| 3.6 | TYPOGRAPHY | Body ≥14px (text-sm). ≤2–3 weights/view. Tabular-nums on numeric columns. |
| 3.7 | COLOR is semantic | Each color has one meaning. No raw Tailwind palette (`text-green-500`). |
| 3.8 | WHITESPACE is a control | Don't pack edge-to-edge. Density only for data tables. |
| 3.9 | MOTION | <200ms, eased, user-initiated only. |
| 3.10 | ACCESSIBILITY | 40×40 hit targets, aria-labels on icon-only, focus states, no color-only signals, WCAG AA contrast. |

### §7 — Failure recovery

When a violation surfaces, don't patch one instance — sweep the whole surface for the
same class of violation and fix them all. Update this handoff so the class isn't missed
again.

---

## 2. Tech stack

- **Framework:** React 19 + Vite + TypeScript (strict), `erasableSyntaxOnly` enabled.
- **Styling:** Tailwind CSS v4 with `@theme inline` (file: `src/index.css`).
- **Primitives:** shadcn/ui components copied to `src/components/ui/` + Base UI React.
- **Icons:** lucide-react.
- **3D:** three.js + React Three Fiber.
- **State:** zustand (`src/stores/`).
- **Layout:** react-resizable-panels.
- **Routing:** react-router-dom (`SimulationPage`, `SettingsPage`).

### Tailwind v4 + Vite gotcha

When adding tokens to `@theme inline`, HMR usually re-registers them correctly on save.
If `getComputedStyle(document.documentElement).getPropertyValue('--color-X')` returns
empty at runtime despite the source declaring it, the JIT cache is stale. In practice,
the compiled CSS (fetch `http://127.0.0.1:58336/src/index.css`) is the source of truth —
grep it for `.bg-success`, `.text-chart-6`, etc. to verify Tailwind emitted the utility.
Do NOT restart the dev server (see §0); touch a file to force HMR if needed.

---

## 3. Design system (current state of `src/index.css`)

### Semantic tokens under `@theme inline`

```css
--color-success: var(--success);
--color-success-foreground: var(--success-foreground);
--color-warning: var(--warning);
--color-warning-foreground: var(--warning-foreground);
--color-info: var(--info);
--color-info-foreground: var(--info-foreground);
--color-overlay-bg: var(--overlay-bg);    /* always oklch(0 0 0) — 3D viewport is always dark */
--color-overlay-fg: var(--overlay-fg);    /* always oklch(1 0 0) */
--color-chart-1..7;                        /* categorical: red/amber/green/blue/purple/cyan/warm-red */
--text-2xs: 0.625rem;                      /* 10px */
--text-2xs--line-height: 1rem;
--text-3xs: 0.5625rem;                     /* 9px — added by linter for dense "not wired" tags */
--text-3xs--line-height: 0.875rem;
```

### Light-mode values

```css
--success:             oklch(0.62 0.17 149);
--success-foreground:  oklch(0.985 0 0);
--warning:             oklch(0.72 0.16 85);
--warning-foreground:  oklch(0.2 0.02 85);
--info:                oklch(0.6 0.18 250);
--info-foreground:     oklch(0.985 0 0);
--overlay-bg:          oklch(0 0 0);
--overlay-fg:          oklch(1 0 0);
--ring:                oklch(0.72 0.016 285.938);   /* bumped for focus visibility */
--sidebar-ring:        oklch(0.72 0.016 285.938);
--chart-1: oklch(0.63 0.22 25);     /* red */
--chart-2: oklch(0.78 0.15 85);     /* amber */
--chart-3: oklch(0.65 0.17 145);    /* green */
--chart-4: oklch(0.58 0.2 250);     /* blue */
--chart-5: oklch(0.6 0.2 300);      /* purple */
--chart-6: oklch(0.7 0.13 200);     /* cyan */
--chart-7: oklch(0.68 0.18 20);     /* warm-red */
```

### Dark-mode values (slightly lighter L for contrast on dark bg)

```css
--success: oklch(0.72 0.18 149);   --success-foreground: oklch(0.16 0 0);
--warning: oklch(0.82 0.17 85);    --warning-foreground: oklch(0.16 0.02 85);
--info:    oklch(0.7 0.18 250);    --info-foreground:    oklch(0.16 0 0);
--overlay-bg/fg: same as light (always black/white).
--ring / --sidebar-ring: oklch(0.72 0.016 285.938).
--chart-1: oklch(0.7 0.22 25);     --chart-2: oklch(0.82 0.17 85);
--chart-3: oklch(0.72 0.17 145);   --chart-4: oklch(0.68 0.2 250);
--chart-5: oklch(0.68 0.22 300);   --chart-6: oklch(0.75 0.13 200);
--chart-7: oklch(0.74 0.2 20);
```

### Component variant extensions

- **`SelectTrigger`** has `size="xs"` → `data-[size=xs]:h-6 py-0.5 pr-1.5 pl-2 text-xs` +
  `size-3` chevron.
- **`Toggle`** has `size="xs"` → `h-6 min-w-6 px-2 text-xs`.
- **`Button`** has native `size="xs"` (shadcn default, h-6, text-xs).

---

## 4. Work completed by iteration

### Iteration 1 — Foundation + component sweep

**Foundation layer**
- Added semantic tokens (`--color-success/-warning/-info/-overlay-bg/-overlay-fg/-chart-6/-7`,
  `--text-2xs`) to `@theme inline`.
- Replaced monochrome `--chart-1..5` with 7-hue categorical palette.
- Bumped `--ring` / `--sidebar-ring` to `oklch(0.72 0.016 285.938)` for focus visibility.
- Added `xs` size variant to `SelectTrigger` and `Toggle`.

**Component sweeps (~28 files modified)**

| File | Key changes |
|------|-------------|
| `TopBar` | ConnectionBadge semantic colors, `h-4` separators, icon `size-3.5` uniform, tooltips on Theme+Settings, Autopilot `bg-info`, aria-labels throughout, deduplicated FPS/map/sync state |
| `StatusBar` | Latency → `SignalHigh/Medium/Low` shape-differentiated icons + semantic color + dynamic aria, sparkline opacity 0.5 → 0.8, removed duplicate map/sync/FPS |
| `LeftPanel` | Icon-only filter row (`Car`/`PersonStanding`/`Camera`) + `role=group` + `aria-pressed`, dropped `font-medium` on collapsible trigger |
| `ActorDetails` | `h-7 → h-8` on axis inputs, empty-state full opacity + aria-hidden, type_id + accordion triggers `text-sm` |
| `VehicleDetails` | Autopilot switch scale removed + aria, Lights Toggles `size="xs"` native, Door buttons `size="xs"` |
| `TrafficManagerPanel` | Switches de-scaled + templated aria, `TableHead` `text-sm`, `TableBody` `text-xs` (density exception §3.8) |
| `EventLog` | `EVENT_ICONS`/`EVENT_COLORS` → `text-chart-N + bg-chart-N/10`, filter Toggles `size="xs"` + `role=group` + `aria-pressed`, auto-scroll switch `peer` + `peer-disabled:opacity-50` |
| `SimulationControls` | Play `bg-success`, Pause `bg-warning`, separator `h-4`, sync switch `peer` |
| `MainViewport` | Overlay icon buttons → `bg-overlay-bg/60 hover:bg-overlay-bg/80`, `border-success/60` when PS connected, aria on all icon-xs buttons, PiP container `bg-overlay-bg/80` |
| `SettingsPage` | URL inputs full-width, actions row `[Test Connection] [status icon] [ml-auto] [Save & Connect]`, SelectTriggers default size |
| `VehicleControls` | HUD outer container `aria-hidden="true"` (decorative), throttle/brake bars `bg-success` / `bg-destructive` with `role="progressbar"` |
| Sensor views | Icon buttons native `size="icon-xs"`, icon `size-3`, aria-label on all |
| `SensorPanel` | Native `icon-xs`, `bg-overlay-bg/30 hover:bg-overlay-bg/60`, grid `SelectTrigger size="xs"`, `SubscriptionDot` → `bg-success` when subscribed |
| `OpenDriveViewer` | Refresh aria, canvas colors all oklch, junction color token-aligned |
| `MiniMap` | Legend dots `chart-3/2/6/4` + `bg-amber-500` for Selected (documented accent exception), canvas `COLORS` all oklch matching `--chart-*` / `--muted-foreground` tokens |
| Overlay sweep | `bg-black/NN` → `bg-overlay-bg/NN`, `text-white/NN` → `text-overlay-fg/NN` (excludes: shadcn scrims, `SegmentationView` CARLA-standard, `format.ts` dynamic, `chart.tsx` third-party, `detachable-window.ts` popup) |

**Violation-class sweeps (whole surface, not single instance)**

| Class | Before | After |
|-------|--------|-------|
| `text-[10px]`/`text-[9px]` → `text-2xs` | 67 | 0 |
| `text-(green\|red\|yellow\|blue)-500` → semantic | 15+ | 0 |
| `text-muted-foreground/NN` opacity → drop | 5 | 0 |
| Hex canvas `fillStyle`/`strokeStyle` → oklch | 25+ | 0 in non-3D files |
| Overlay raw alpha (`bg-black/NN`) → `bg-overlay-bg/NN` | 25+ | 0 (shadcn scrims exempt) |
| `scale-50` / `scale-75` on Switch → remove + aria | 5 | 0 |
| `size-5` override on icon-xs → remove | 9 | 0 |
| `h-7` off-scale input height → `h-8` | 6 | 0 (only Skeleton placeholder + StatusBar container remain; intentional) |
| Redundant `h-8` on `size="sm"` SelectTrigger | 3 | 0 |
| `SelectTrigger size="sm" text-xs` in form → default size | 4 | 0 |
| Icon-only buttons without `aria-label` | ~20 | 0 |

### Iteration 2 — Pre-existing tsc errors + a11y polish

- **Fixed all 5 pre-existing tsc errors:**
  - `getActor(id)` in `lib/carla-api.ts` now returns `Promise<ActorDetail>` (was `CarlaActor`,
    broke 4 errors in `VehicleDetails.tsx` that access `.control`).
  - Removed duplicate `ViewMode` re-export in `stores/uiStore.ts`.
- **A11y polish:**
  - `AxisInput` (ActorDetails + SpawnPanel) takes a `label` prop; `aria-label="Position X"`
    etc. on each numeric input.
  - `LeftPanel` search: `type="search"` + `aria-label="Search actors"`.
  - `RecordingControls` filename Label linked via `htmlFor`.
  - `ErrorBoundary` Card: `role="alert"`.
  - `ConnectionOverlay` icons: `h-X w-X` → `size-X`, aria-hidden on decoration.
  - CommandPalette: 20 items got `aria-hidden="true"` on their decorative icons (text
    label already describes the action).
  - DataExportMenu, MapControls Spinner, LidarView ContextMenu, SpawnPanel (Car/PersonStanding
    icons in items): `aria-hidden="true"` on decorative icons.
- **Form layout:** `SelectTrigger className="w-full"` in form contexts (WeatherControls
  preset, SettingsPage Target FPS / LiDAR Point Budget, SpawnPanel sensor-type / sensor-parent).

### Iteration 3 — Slider + loading-state a11y

- Added `aria-label` to all 5 Sliders: `WeatherControls` (each param), `SimulationControls`
  speed, `VehicleDetails` Throttle/Steering/Brake, `TrafficManagerPanel` global speed,
  `RecordingControls` replay scrubber.
- Unified Suspense Spinner sizes: `SensorPanel` `size-5 → size-6` with
  `aria-label="Loading sensor view"`, `LidarView` / `WorldScene` `size-6` with `role="status"`.
- `LeftPanel` Destroy All: dynamic `aria-label`.
- `ActorDetails` Destroy Actor: dynamic `aria-label={`Destroy actor #${id}`}`.
- Outdated comment in `RecordingControls` referencing `h-7` (stale) updated to describe
  the actual `size="xs"` variant.

### Iteration 4 (in progress)

- **Semantic HTML landmarks:** converting outer wrappers to proper elements.
  - `LeftPanel` → `<aside aria-label="Actors list">` + `Actors` label upgraded from `<span>`
    to `<h2>`.
  - Remaining: `RightPanel` → `<aside>`, `BottomPanel` → `<aside>` or `<section>`,
    `MainViewport` → wrap with `<main>` or set one in `SimulationPage`.
- **AlertDialog destructive buttons:** verify that the confirm action in Destroy All /
  Destroy Actor dialogs is visually strong enough (currently `variant="destructive"` =
  `bg-destructive/10 text-destructive` via Button primitive — quiet red text on tinted
  bg). Discuss whether to bump to solid fill.

---

## 5. Remaining backlog (priority order)

### High-priority

1. **Finish semantic landmarks**
   - `RightPanel` → `<aside aria-label="Actor properties">`, `<span>Properties</span>` →
     `<h2>`.
   - `BottomPanel` → `<section aria-label="Sensor & telemetry panels">`.
   - `SimulationPage` → wrap the 3D viewport area in `<main id="main-content">` so screen
     readers can jump. Consider a "Skip to main content" link at the top.
2. **Tab semantics in BottomPanel.** `<Tabs>` + `<TabsList>` from shadcn already render
   `role="tablist"`, but verify the 5 tab panels (Sensors/Map/Roads/Telemetry/Events)
   have proper `aria-labelledby` on their `TabsContent`.
3. **Keyboard navigation audit.** Tab order should be logical: TopBar → (Left → Center →
   Right) → BottomPanel → StatusBar. Verify focus trap in AlertDialogs returns to the
   trigger.
4. **Light-mode visual audit.** User has only operated in dark mode; swap theme (Moon/Sun
   button in TopBar) and spot-check every surface for contrast failures. `--chart-N`
   values were chosen for dark bg; the light variants in `@theme inline` may need tuning.
5. **WCAG AA contrast numerics.** `text-warning` on `bg-card`, `text-muted-foreground` on
   `bg-overlay-bg/60`, etc. Use Playwright `getComputedStyle` + a contrast formula; fix
   any < 4.5:1 for body text, < 3:1 for large text.

### Medium-priority

6. **Font-weight audit in BottomPanel sensor-view CardTitles.** All use `text-xs
   font-medium` (12px). §3.6 says ≥14px body, but these are headings in a dense grid.
   Either bump to `text-sm` or leave for density — design decision still open.
7. **Popover / Dialog trigger visual verification.** The Weather/Map/Record/Traffic popover
   forms need a live CARLA bridge; they're `disabled={!isConnected}` in the UI. Once
   bridge + CARLA are both up (health: `carla_connected=true`), click each, screenshot,
   and check sibling-match inside.
8. **Empty-state consistency.** Each empty state has icon + title + subtitle; verify the
   size/weight pattern holds across `LeftPanel` (Not connected), `ActorDetails` (No actor),
   `EventLog` (No events), `RecordingControls` (No recordings), `TrafficManagerPanel`
   (No vehicles), `CollisionLog` / `LaneInvasionLog` (No events), `CameraView` (loading).
9. **Tooltip-in-Popover composition.** Help / Weather / Map / Record / Traffic popover
   triggers got `aria-label` but not `Tooltip`. Base UI doesn't support Tooltip-inside-
   Popover cleanly. Either build a wrapper or accept aria-label-only.

### Low-priority / cosmetic

10. **RouteEditor dense toolbar.** 6 badges + buttons in a narrow row. Verify sibling-match
    at small widths.
11. **TopBar header density.** 15+ elements in 48px. Could compress by combining
    Weather/Map/Record into a single "Scenario" dropdown — but that's a feature change.
12. **`w-[480px]` on TrafficManagerPanel Sheet.** Arbitrary but intentional width. Could
    become a named `--sheet-width` token if more sheets appear.
13. **SpawnPanel Dialog forms visual audit.** Three tabs (Vehicle/Walker/Sensor); verify
    they share layout rhythm and that `SelectTrigger w-full` (added in iter 2) renders
    correctly.
14. **RightPanel dynamic header.** Consider showing the selected actor's name in the
    "Properties" header for context, with the generic "Properties" as fallback when empty.
    Changes behavior, so propose first.

### Intentional exclusions (don't fix)

- `bg-amber-500` in 3 spots (`LeftPanel` Star, `ActorDetails` Ego Badge, `MiniMap` Selected
  legend) — documented selection/ego accent per memory.
- shadcn UI primitives: `ui/dialog.tsx`, `ui/alert-dialog.tsx`, `ui/sheet.tsx` at
  `bg-black/10` — upstream convention.
- 3D engine files (`WorldScene`, `RoadMesh`, `RoadNetwork`, `CityEnvironment`,
  `ActorRenderer`, `SensorCamera3DView`) — hex colors are three.js material values, not
  CSS.
- `SegmentationView` class colors — CARLA server-side standard must match rendered buffer.
- `chart.tsx` — third-party shadcn internals.
- `lib/detachable-window.ts` — popup where main-app CSS vars aren't loaded.
- `lib/format.ts` — dynamic `rgb()` string generation from runtime data.
- `RadarView` velocity gradient `rgb(r, mid, b)` — data-dependent visualization color math,
  not a static token.

---

## 6. Deliverable format (§6 of the mandate)

Every UI change report must include:

1. **Audit** — full enumeration of the surface and its current inconsistencies.
2. **Proposed changes** — table `(element, before, after, reason)`. Reason cites §3.* principle
   or §5 rule.
3. **Delete / Consolidate / Clarify / Add counts** — Add list must be short relative to
   Delete + Consolidate.
4. **Legacy touched** — files that predated the task and were modified for consistency.
   Empty list = likely failed the mandate.
5. **Screenshots or rendered before/after** — or honest "dev server unavailable" note.
6. **Verified / Unverified** per change — evidence-backed.

### §7 failure recovery reminder

If the user points out a surviving inconsistency:
1. Don't argue it was "pre-existing".
2. Don't scope-limit to the specific instance — search the whole surface for the same
   class.
3. Update this handoff with the class so it isn't missed again.

---

## 7. Verification toolkit

- `timeout 60 npx tsc -b --noEmit` — must return empty output. All 5 handoff-v1
  pre-existing errors are fixed; any new error is from the current iteration.
- `timeout 60 npx tsc --noEmit --noUnusedLocals --noUnusedParameters` — catches
  orphaned imports left by refactors.
- `curl -sS http://127.0.0.1:58337/health` — bridge status. Watch for
  `carla_connected=true`, `session_ready=true`.
- `curl -sS http://127.0.0.1:58336` — Vite root HTML (200 OK expected).
- `curl -sS http://127.0.0.1:58336/src/index.css | grep '.bg-success'` — verifies that
  Tailwind JIT emitted a utility class (proves the token resolved).
- `tmux capture-pane -t <session>:0.<pane> -p` — if the streaming stack is in tmux;
  inspect vite/uvicorn logs for build errors.

### Grep patterns for ongoing sweeps

```bash
# Raw palette
'bg-(red|green|yellow|blue|cyan|orange|purple|violet|emerald|rose|pink|amber|fuchsia|sky|indigo|lime|teal|stone|neutral|zinc|gray|slate)-[0-9]{2,3}'

# Arbitrary pixel text sizes
'text-\[\d+px\]'

# Opacity overrides on semantic tokens
'text-muted-foreground/(30|40|60|70)'

# Sub-40px Switch hit targets
'scale-(50|75)\b'

# Off-scale button heights
'size="icon-xs" className="[^"]*size-5'
'\bh-7\b'

# Icon-only buttons without aria-label (manual review needed)
'size="icon(-xs|-sm)?"[^>]*onClick'
```

---

## 8. Launch / restart procedure

Canonical commands the user has approved:

```bash
cd /data1/song99/carla
./start_streaming.sh                   # Launch all (tmux session "carla-web")
./start_streaming.sh --kill            # Stop everything — DESTRUCTIVE
./start_streaming.sh --status          # Health check
./start_streaming.sh --pixel-streaming # Full stack with UE5 Pixel Streaming
./start_streaming.sh --no-carla        # Bridge + frontend only
```

**Ports**
- Frontend (Vite): `http://127.0.0.1:58336`
- Bridge (FastAPI): `http://127.0.0.1:58337`
- CARLA RPC: `localhost:58338` (GPU 2, Vulkan `-graphicsadapter=2`)

**tmux**
- Session name: `carla-web` (may not exist if the user started panes manually in other
  sessions — check `tmux list-sessions`).
- Attach: `tmux attach -t carla-web`.

**Do not restart.** Edits hot-reload. The only legitimate reason to restart is a stuck
Tailwind JIT cache (symptom: new utility class doesn't resolve at runtime despite source
declaring it), and even then prefer `touch src/main.tsx` to force HMR before killing.

---

## 9. Memory records (project-persistent)

The following auto-memory files govern the loop behavior; update them if the rules change:

- `project_streaming_stack.md` — ports, tmux layout, "never restart" contract.
- `feedback_autonomous_loop.md` — keep going, never declare completion, ScheduleWakeup
  (dynamic) or cron (fixed) at end of turn.
- `project_managed_actor_tagging.md` — `role_name="bridge_ego"` enables hot-reload-safe
  actor adoption.
- `project_bridge_crash_mitigation.md` — libcarla native aborts; `run_local.sh` has a
  supervisor loop, `touch src/main.py` to revive if stuck.
- `project_carla_gpu_flag.md` — Vulkan ignores `CUDA_VISIBLE_DEVICES`; must pass
  `-graphicsadapter=2` or `3` (never 0).
- `feedback_ui_overhaul_mandate.md` — audit before edit; touch legacy when it violates
  consistency; siblings / grouping / hierarchy rules.
- `feedback_no_unreproducible.md` — UE5→web features must be reimplemented (Rust/WASM/
  native OK); "pipeline different" is banned.
- `feedback_prompts_in_english.md` — body English even in Korean conversations.

---

## 10. What the user repeatedly emphasized

- Work in `/data1/song99/carla` — not `/home/song99/carla`.
- The mandate's §1 (Legacy is not sacred) and §7 (fix the whole class) are load-bearing —
  they're the reason the sweep runs over many iterations.
- User speaks Korean; tone gets curt when agents bikeshed or miss obvious instructions.
- The user reserves the right to tell the agent to stop and hand off at any time.
- English for prompts and system rules, even in Korean conversations.

---

## 11. Cron continuation prompt (verbatim)

This is what `cf5de791` fires every minute. If the cron dies and needs re-creation
(`CronCreate`), pass this exact body as `prompt`, `recurring: true`, `cron: "* * * * *"`:

````
# CARLA Web UI/UX Overhaul — Autonomous continuation

Work on `/data1/song99/carla/carla-web/` ONLY (not `/home/song99/carla/`). Do NOT restart
the streaming stack — Vite HMR handles edits. CARLA RPC (58338) may be down; focus on
static UI work that doesn't need the bridge.

## Mandate
Redesign, don't cosmetically patch. Legacy is fair game. Apply §3 in order: §3.1
remove-before-add, §3.2 one grid/rhythm, §3.3 siblings match (same row = same height),
§3.4 hierarchy visible (primary fill / outline / destructive isolated), §3.5 grouping
reflects meaning (`[Spawn][Destroy All] | [Traffic]` not interleaved), §3.6 typography
≥14px body / ≤3 weights / tabular-nums, §3.7 semantic color only, §3.8 whitespace is a
control, §3.9 motion <200ms user-initiated, §3.10 a11y (40×40 hit targets, aria-labels
on icon-only, focus states, no color-only signals). §7: sweep the whole class of
violation, not one instance.

## Design-system tokens required in `src/index.css`
Under `@theme inline`: `--color-success`, `--color-success-foreground`, `--color-warning`,
`--color-warning-foreground`, `--color-info`, `--color-info-foreground`, `--color-overlay-bg`,
`--color-overlay-fg`, `--color-chart-6`, `--color-chart-7`, `--text-2xs: 0.625rem` with
line-height `1rem`.

Light-mode: `--success: oklch(0.62 0.17 149)`; `--success-foreground: oklch(0.985 0 0)`;
`--warning: oklch(0.72 0.16 85)`; `--warning-foreground: oklch(0.2 0.02 85)`; `--info:
oklch(0.6 0.18 250)`; `--info-foreground: oklch(0.985 0 0)`; `--overlay-bg: oklch(0 0 0)`;
`--overlay-fg: oklch(1 0 0)`. Chart 1..7 categorical: red/amber/green/blue/purple/cyan/
warm-red.

Dark-mode: `--success: oklch(0.72 0.18 149)`; `--success-foreground: oklch(0.16 0 0)`;
`--warning: oklch(0.82 0.17 85)`; `--warning-foreground: oklch(0.16 0.02 85)`; `--info:
oklch(0.7 0.18 250)`; `--info-foreground: oklch(0.16 0 0)`. Bump `--ring` and
`--sidebar-ring` to `oklch(0.72 0.016 285.938)`. Chart 1..7 slightly lighter for dark bg.

SelectTrigger variants: add `xs` → `data-[size=xs]:h-6 data-[size=xs]:py-0.5
data-[size=xs]:pr-1.5 data-[size=xs]:pl-2 data-[size=xs]:text-xs
data-[size=xs]:[&_svg:not([class*='size-'])]:size-3`. Toggle variants: add `xs: "h-6
min-w-6 px-2 text-xs"`.

## Structural rework per handoff (port/re-derive each)
TopBar: ConnectionBadge `bg-success/10 text-success`; connecting `text-warning`;
separators `h-4`; icon `size-3.5` uniform; aria-labels; Weather/Map/Record triggers all
icon-only `ghost icon-sm`; Theme+Settings tooltip wrapped; remove duplicated FPS/map/sync
state.
StatusBar: latency shape-differentiated SignalHigh/Medium/Low + semantic color + dynamic
aria-label; sparkline opacity 0.8; remove duplicates.
LeftPanel: bottom cluster `[Spawn][Destroy All] | [Traffic]`; filter row icon-only 3
buttons + aria-pressed + role=group; drop font-medium on collapsible trigger.
ActorDetails: h-7 inputs → h-8; empty-state full-opacity icon + aria-hidden; type_id +
accordions text-sm.
VehicleDetails: drop scale-75 on switches + aria; Lights Toggles size=xs; Door buttons
size=xs.
TrafficManagerPanel: trigger `w-full gap-1.5` icon size-3.5; switches drop scale-75/50 +
templated aria; TableHead text-sm body text-xs.
EventLog: chart-N semantic colors; filter Toggles size=xs + aria-pressed + role=group;
auto-scroll switch drop scale-50 + className peer; Export/Clear aria.
SimulationControls: Play active bg-success; Pause active bg-warning; aria-label dynamic;
separator h-4; sync switch className peer.
MainViewport: fullscreen aria; empty-state full opacity; aria-hidden on decorative.
SettingsPage: URL inputs full-width; Save&Connect primary, Apply outline; status icons
semantic + aria; Adaptive Quality switch drop scale-75 + aria; SelectTriggers drop
redundant h-8/text-xs.
VehicleControls: Kbd/KbdGroup for keyboard hints; outer container aria-hidden.
Sensor views (CameraView/RadarView/LidarView/SegmentationView): icon buttons native
`size=icon-xs`; icon `size-3`; aria-label.
SensorPanel: native icon-xs; icon size-3; bg-overlay-bg/30 hover /60; Layout grid
SelectTrigger size=xs.
OpenDriveViewer: Refresh aria; canvas oklch colors.
MiniMap: legend dots chart-3/2/6/4; canvas COLORS all oklch matching tokens.
Overlay sweep: `bg-black/NN` → `bg-overlay-bg/NN`; `text-white/NN` → `text-overlay-fg/NN`
(exclude: shadcn scrims, SegmentationView CARLA-standard, format.ts dynamic, chart.tsx
third-party, detachable-window.ts popup).

## Violation classes to sweep whole surface
`text-[10px]`/`text-[9px]` → `text-2xs`; `text-(green|red|yellow|blue)-500` → semantic;
opacity on `text-muted-foreground/NN` → drop; hex canvas `fillStyle`/`strokeStyle` →
oklch; overlay raw alpha → overlay-* tokens; `scale-50`/`scale-75` on Switch → remove +
aria; `size-5` on icon-xs → remove override; `h-7` → `h-8`; redundant `h-8` on
`size=sm` SelectTrigger; `SelectTrigger size=sm text-xs` in form → default size;
icon-only no aria-label.

## Autonomous loop contract
Keep going. Never declare completion. Pick the next most impactful improvement each
iteration. Verify concretely (tsc, grep, DOM inspection if possible). Do NOT touch
streaming stack. Fix root cause; do NOT bypass. When one task finishes, start the next
in the same turn.
````

---

## 12. Quick reference: files most recently touched

Heavy-sweep targets (iterations 1–4). If continuing this work, grep these first before
hunting elsewhere:

```
src/index.css
src/components/ui/select.tsx
src/components/ui/toggle.tsx
src/components/layout/TopBar.tsx
src/components/layout/StatusBar.tsx
src/components/layout/LeftPanel.tsx
src/components/layout/RightPanel.tsx
src/components/layout/BottomPanel.tsx
src/components/actors/ActorDetails.tsx
src/components/actors/VehicleDetails.tsx
src/components/actors/TrafficManagerPanel.tsx
src/components/actors/SensorDetails.tsx
src/components/controls/SimulationControls.tsx
src/components/controls/VehicleControls.tsx
src/components/controls/WeatherControls.tsx
src/components/controls/MapControls.tsx
src/components/controls/SpawnPanel.tsx
src/components/shared/EventLog.tsx
src/components/shared/PerformanceOverlay.tsx
src/components/shared/TelemetryPanel.tsx
src/components/shared/CommandPalette.tsx
src/components/shared/ConnectionOverlay.tsx
src/components/shared/DataExportMenu.tsx
src/components/shared/ErrorBoundary.tsx
src/components/viewport/MainViewport.tsx
src/components/viewport/CameraFallback.tsx
src/components/viewport/WorldScene.tsx
src/components/map/MiniMap.tsx
src/components/map/OpenDriveViewer.tsx
src/components/map/RouteEditor.tsx
src/components/sensors/CameraView.tsx
src/components/sensors/LidarView.tsx
src/components/sensors/RadarView.tsx
src/components/sensors/SegmentationView.tsx
src/components/sensors/GnssView.tsx
src/components/sensors/ImuChart.tsx
src/components/sensors/CollisionLog.tsx
src/components/sensors/LaneInvasionLog.tsx
src/components/sensors/SensorPanel.tsx
src/components/scenario/RecordingControls.tsx
src/routes/SettingsPage.tsx
src/lib/carla-api.ts
src/stores/uiStore.ts
src/types/carla.ts
```

---

_Last updated: iteration 4 (2026-04-14). Cron `cf5de791` actively firing — do not
re-schedule._
