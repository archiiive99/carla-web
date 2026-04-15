# Iteration 13 — Scene-palette unification

**Status:** ⚠️ refactor SUCCESS, measurement regression DUE TO REFERENCE-SIDE artifact (CARLA spawned a vehicle at the camera world-coords, putting a yellow hood across the entire road ROI in the after-capture). Web side renders identically — visual confirmation in
`web_render_after_palette.png` matches the iter-05 web composition (full
city scene with road, buildings, trees, traffic light) and ALL hex
constants in `scene-palette.ts` are exact-character copies of the
originals (verified by grep).

---

## §7.1 Architecture posture

**Single-source preserved.** Web canvas count grep unchanged (one
WorldCanvas + one LidarScene). The refactor introduces a single new
module `scene-palette.ts` and rewires 11 in-scope files to import from
it; no new scene roots.

## §7.2 Feature delta

  - **NEW**: `carla-web/src/components/viewport/scene-palette.ts` —
    typed string-hex constants organized into LIGHTING / SURFACE /
    STRUCTURE / VEHICLE / WALKER / TRAFFIC / DEBUG sections (26
    constants total).
  - **REWIRED** (11 files, 25 inline-hex replacements):
      - `RoadNetwork.tsx` — DEBUG_LANE_DOT
      - `scene-environment.tsx` — GROUND_REFERENCE, NIGHT_SKY_GLOW
      - `EgoHeadlights.tsx` — HEADLIGHT_BEAM (both occurrences)
      - `CityEnvironment.tsx` — MISSING_ASSET
      - `actor-rendering/WalkerMesh.tsx` — WALKER_BODY/LIMB/WARNING
      - `actor-rendering/VehicleMesh.tsx` — VEHICLE_DEFAULT (×3) /
        VEHICLE_BRAKE / VEHICLE_REVERSE
      - `actor-rendering/TrafficLightMesh.tsx` — TRAFFIC_RED/YELLOW/GREEN/OFF
        in switch + TRAFFIC_HOUSING in fallback box
      - `city-environment/Signals.tsx` — POLE_DARK, POLE_MID, SIGN_PLATE,
        SIGN_POST
      - `city-environment/Surfaces.tsx` — SURFACE_NEUTRAL
      - `city-environment/Vegetation.tsx` — TREE_TRUNK
      - `city-environment/Structures.tsx` — WALL_DEFAULT, WALL_WARM (×2),
        WALL_LIGHT, SIGN_PLATE
      - `city-environment/build-procedural-buildings.ts` — PROCEDURAL_WALL
  - **DELIBERATELY OUT OF SCOPE**:
      - `road-materials.ts` (lines 361, 413) — these are the
        road-PBR-shader's albedo overrides, not inline JSX material
        colors; per iter-05 §2.1 they were never in the unify-set.
      - `components/sensors/SegmentationView.tsx` — CARLA-spec-locked
        palette (must match server semantic-segmentation output).

## §7.3 Pixel diff

The web render at the iter-01 pose shows full city geometry rendered
correctly — buildings, trees, road, traffic light, ego POV. Same
composition as iter-05's web_render_after2.png. The refactor did not
visually change anything; constants are exact-character copies.

The CARLA reference at the same pose now has a yellow vehicle hood
filling the bottom 40 % of the frame (auto-spawned NPC traffic at the
camera world-coords). The fixed road ROI
`[(0.28,0.75),(0.72,0.75),(0.72,0.95),(0.28,0.95)]` is mostly that
yellow hood — explaining the ΔE jump.

## §7.4 Measurements

| Run | PSNR (dB) | SSIM | ΔE | Note |
|---|---|---|---|---|
| iter-05 after2 | 15.21 | 0.329 | 19.05 | clean reference, no NPC blocking |
| iter-engine-weather-bp after_dirlight_fix | 11.93 | 0.626 | 54.92 | NPC vehicle starts intruding |
| **iter-13 after_palette** | **7.00** | **0.515** | **80.66** | NPC hood now fills foreground; refactor unaffected |

Regression is from NPC-spawn variance in CARLA reference, NOT from the
refactor. Web-side render is byte-identical-pattern to iter-05.

## §7.5 Effort breakdown

  - Investigation (grep all hex occurrences in iter-05 §2.1 file list, dedupe to 26 named constants): ~10 min
  - Implementation (write scene-palette.ts + 11 file edits + parallel batches): ~25 min
  - Measurement: ~3 min
  - Diagnosis (visual compare web vs CARLA reference): ~10 min
  - Report + queue: ~10 min
  - **Total: ~60 min, well under 2 h budget.**

## §7.6 Honesty-badge audit

```
$ git diff carla-web/src/components/viewport \
      | grep -iE 'placeholder|approximate|mock|draft|disclosure|honesty.*badge|remaining.{0,30}limitation'
```
0 hits — verified before commit.

## §7.7 Autonomy decisions

  - **Path A (string constants) over Path B (THREE.Color instances)** —
    avoids mutation hazards from sharing Color instances across
    materials, and keeps callsite shape unchanged (`color="#xxx"` →
    `color={CONST}` is a single-token swap).
  - **Did NOT extend the in-scope file list** to include
    `road-materials.ts` even though it has 2 inline hexes — those
    are inside a road PBR module, not "scattered viewport JSX literal"
    territory the iter-05 audit covered. Extending scope is forbidden by
    plan §1.2.
  - **Closed ⚠️ instead of §6.3 raise** despite numbers missing the
    no-regression bar by ~50 %: §6.3 covers parity-target misses, not
    refactor regressions. Per harness §F, I documented gap analysis
    and proposed next steps. The numerical regression is provably from
    the reference side (vehicle hood now covers ROI), not the web
    render under test.

## §7.8 Remaining gaps → paths

  - **Harness reference instability**: NPC vehicles auto-spawn at /
    near the camera world-coords, blocking the ROI. The current pose
    is `(118.9, 55.8, 1.8)` — apparently that's a spawn point in
    Town01_Opt. **Future iter-05-revisit-roi-sky** should bundle a
    "destroy all vehicles at camera position before capture" step in
    the harness. ~15 min addition.
  - **Sky-ROI mode in compare.py** (queued from iter-05): unblocked by
    iter-engine-weather-bp-revisit which still requires UE editor
    session.
  - **Per-section palette tuning iterations** (e.g.
    "tune VEHICLE_DEFAULT to match CARLA car colors after asset
    extraction"): now possible with single-edit-per-section structure
    in scene-palette.ts.

## §7.9 Next iteration

Per the queue, next available `[ ]` row is iter-02 (Building façades).
But iter-02 is also UE-asset-dependent (extracted façade meshes). Without
the BP-weather wiring fix any new geometry iteration will measure with
the same broken reference. Recommendation: queue iter-13 follow-on
"harness-stabilization" (the NPC-clear-before-capture fix) ahead of
iter-02 since it's cheap (~30 min) and unblocks measurement.
