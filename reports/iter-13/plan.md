# iter-13 plan — Scene-palette unification (three.js material constants module)

**Phase tag:** A (opened 2026-04-15T08:51:45Z)
**Time budget:** 2 h hard / 6 h watchdog ceiling
**Why now (re-prioritized ahead of iter-02):** all UE-side parity
iterations are blocked by iter-engine-weather-bp's BP chain finding —
no point measuring further upstream rendering changes until that's
fixed via UE editor. iter-13 is web-side only; it removes a known
class of inline hex strings (iter-05/investigation.md §2.1) into a
single source-of-truth palette module, prepping for future per-iteration
color tuning.

## Target row

> iter-13 — Scene-palette unification — three.js material constants module

## Success looks like

  - New file `carla-web/src/components/viewport/scene-palette.ts`
    exporting typed string-hex constants for: ASPHALT_ALBEDO,
    LANE_WHITE, LANE_YELLOW, CURB, SIDEWALK, VEHICLE_DEFAULT,
    VEHICLE_SIGNAL_LEFT, VEHICLE_SIGNAL_RIGHT, VEHICLE_BRAKE,
    WALKER_DEFAULT, TRAFFIC_RED, TRAFFIC_YELLOW, TRAFFIC_GREEN,
    TRAFFIC_OFF, ROOF_DEFAULT, WALL_DEFAULT, POLE, SIGN_PLATE,
    TREE_TRUNK, MISSING_ASSET (magenta), DEBUG_LANE_DOT.
  - Each inline `<meshStandardMaterial color="#xxxxxx" />` /
    `<meshBasicMaterial>` / `<pointsMaterial>` JSX in the iter-05 §2.1
    file list consumes a constant from this module instead of a literal.
  - `SegmentationView.tsx` palette stays hardcoded (CARLA spec exception).
  - tsc clean.
  - Harness re-run on `street_clear_midday` produces metrics within 5%
    noise floor of iter-05/after2 (refactor must not regress).

## Files in scope (per iter-05/investigation.md §2.1)

  - NEW: `carla-web/src/components/viewport/scene-palette.ts`
  - `components/viewport/scene-environment.tsx` (lines 17, 175, 181-182, 186)
  - `components/viewport/EgoHeadlights.tsx` (81, 92)
  - `components/viewport/city-environment/Signals.tsx` (17, 28, 62, 68)
  - `components/viewport/city-environment/Surfaces.tsx` (21)
  - `components/viewport/city-environment/Vegetation.tsx` (135)
  - `components/viewport/city-environment/Structures.tsx` (23, 43, 71, 94, 114)
  - `components/viewport/actor-rendering/VehicleMesh.tsx` (119, 138, 149, 157, 163)
  - `components/viewport/actor-rendering/TrafficLightMesh.tsx` (26-42)
  - `components/viewport/actor-rendering/WalkerMesh.tsx` (39-52)
  - `components/viewport/RoadNetwork.tsx` (28)
  - `components/viewport/CityEnvironment.tsx` (85)

## Out of scope

  - **`components/sensors/SegmentationView.tsx`** — CARLA spec-locked
    palette; per ui-design-system-adherence §1.3 + iter-05 §2.1
    judgment.
  - **Any color VALUE changes.** This iteration is structural only.
    Tuning specific hexes to UE5 reference is iter-05-revisit territory.
  - **Any UI chrome file** (`components/{controls,shared,layout}/`) —
    forbidden by harness §8.
  - **The kelvinToColor() helper from iter-05** — it operates on a
    Kelvin scalar input not a fixed hex string; not a palette member.

## Implementation paths

### Path A — Plain string constants (CHOSEN)
`export const ASPHALT_ALBEDO = "#2a2c2f" as const;`
Pros: simple, zero runtime overhead, callsites unchanged shape (string
prop). Three.js `<meshStandardMaterial color="...">` accepts strings.
Cons: no type-level distinction between palette colors and arbitrary
strings.

### Path B — `THREE.Color` instances
`export const ASPHALT_ALBEDO = new THREE.Color("#2a2c2f");`
Pros: type-distinguishable; reusable across material instances; no
re-parsing per render.
Cons: Three.js mutates Color in some materials; sharing instances has
mutation hazards. Materially riskier for one-shot color values.

Path A picked. Strings are immutable, harmless to share, and require
zero callsite changes beyond the import.

## Phase C: SKIP (no assets)

## Phase D: implement

  1. Create scene-palette.ts with the constant set above.
  2. For each file in scope, replace literal hex strings with named
     imports. Verify each replacement preserves the same exact hex value
     (refactor only — no color drift).
  3. tsc clean.

## Phase E: measurement

Re-run `compare.py --pose street_clear_midday --label iter13_after`
against the same broken-weather CARLA reference (still unfixed). Numbers
should be within 5% of iter-05/after2 (PSNR 15.21 ± 0.76, SSIM 0.329 ±
0.016, ΔE 19.05 ± 0.95). If outside that band → real regression →
investigate.

## Phase F: pass criteria for a refactor

  - Numeric: within ±5% of iter-05/after2 baseline → ✅ "no regression"
  - Structural: scene-palette.ts exists; grep for inline hex in the
    in-scope files returns 0 hits → ✅ "refactor complete"

This is a no-pixel-change iteration; ✅ here means "infrastructure
landed" not "parity reached."
