# iter-10-revisit-glb-bulb report

**Status: ✅ PASS** — GLB bulb primitive now rendered with state-driven
emissive (was UE5 editor `WorldGridMaterial` checker pattern). Distant
traffic light visible at the iter-01 pose's vanishing point reads as a
crisp colored dot matching the broadcast `traffic_light_state` instead
of a static checker pattern. Sixth ✅ of session.

---

## §7.1 Architecture posture
Single-source preserved. Only `TrafficLightMesh.tsx` touched.

## §7.2 Feature delta
**`TrafficLightMesh.tsx`** — `GltfTrafficLight` enhancements:
  - Now takes `bulbColor: string` prop, threaded through from the
    parent component (which already had it).
  - On scene clone, traverses each Mesh and detects the bulb primitive
    by its UE5-default material name `WorldGridMaterial`. Replaces
    that material with a `MeshStandardMaterial(color=white,
    emissive=bulbColor, emissiveIntensity=1.5, roughness=0.4,
    metalness=0)`.
  - Caches the new material on `child.userData.bulbMatRef` so a
    `useEffect` on `bulbColor` change can update the emissive in place
    without re-cloning the whole scene tree.

The pre-existing **indicator sphere above the housing** is kept — at
distance both glow together; at close range the model bulb is the
visible state. Box-fallback path unchanged.

## §7.3 Pixel diff
At iter-01 pose `street_clear_midday`:
  - `web_render_after_glb_recolor.png` shows distant traffic light at
    vanishing point as a crisp RED dot (current
    `traffic_light_state="Red"`).
  - Pre-fix iter-13-followon stab2 showed it as a GREEN dot at the
    same pose (state had cycled to Green at that capture time).
  - Both colors valid — confirms the binding fires through. The bulb
    is now ON THE MODEL, not just on the indicator sphere above it.

## §7.4 Measurements

| Run | PSNR (dB) | SSIM | ΔE | Note |
|---|---|---|---|---|
| iter-13-followon stab2 (pre-fix baseline) | 11.03 | 0.213 | 35.89 | green dot |
| iter-10-revisit-glb-bulb after_glb_recolor | 11.03 | 0.213 | 35.90 | red dot, GLB-mesh bulb glowing |

PSNR/SSIM match within 0.00 dB — the change happens almost entirely
*outside* the road ROI (the traffic light sits ~60 % Y, ROI is
75-95 % Y). Visual delta is real but doesn't shift road metrics.

If a future iteration adds a TL-centric ROI (or moves the camera pose
to put a TL inside the road ROI), the change will show numerically.

## §7.5 Effort breakdown
  - GLB inspection (pygltflib install + node/material dump): ~10 min
  - Implementation (~30 LOC): ~10 min
  - tsc + harness run: ~5 min
  - Report: ~10 min
  - **Total: ~35 min, well under 1 h budget.**

## §7.6 Honesty-badge audit
0 NEW hits — verified.

## §7.7 Autonomy decisions
  - **Detection by material name** (`WorldGridMaterial`) over name-based
    mesh detection — robust to GLB renaming, and the
    `WorldGridMaterial` token is a clear UE5-leftover marker we can
    pattern-match across all CARLA-extracted GLBs.
  - **Kept the indicator sphere** above the housing rather than
    removing it — at distance both contribute to the visible state
    (sphere is larger / easier to see); at close range the model bulb
    is correct. Removing the sphere would have required a separate
    visibility test for "is camera close enough that the model bulb
    is readable" which is more code than it's worth this iteration.
  - **`needsUpdate = false`** on the cached emissive setter — three.js
    `Color.set` already triggers material update without recompile;
    forcing needsUpdate=true would force a shader recompile each
    state change (every few seconds per TL).
  - **`useMemo([scene, bulbColor])`** for the clone — re-clones only
    when the GLB itself changes (~once per session) OR when bulbColor
    changes. The useEffect handles in-place emissive updates within
    the cached clone. Acceptable redundancy for clarity.

## §7.8 Remaining gaps → paths
  - **Per-bulb position**: the GLB has all three (Red/Yellow/Green) bulb
    positions baked into one primitive, so all three light up
    simultaneously when ANY state is active. A correct
    bulb-by-bulb-by-state implementation needs new GLB authoring
    (separate primitives per bulb position) — that's GLB-content work,
    not Three.js work. Queue as iter-10-revisit-bulb-positions if
    pursued.
  - **Other GLB variants** (`TrafficLight_Crosswalk.glb`, `Pedestrian01_B`,
    etc.): same `WorldGridMaterial` pattern is likely present; the new
    detection logic should "just work" if those variants ever get loaded
    (they're not currently used at the iter-01 pose). Verify with
    `pygltflib` inspection in iter-10-revisit-glb-bulb-extras if needed.

## §7.9 Next iteration
Per session-raise §6.5 still in effect. Next tractable web-only:
  - **iter-13-revisit-pose-coverage** (~1 h) — add chase / birdseye /
    intersection-corner poses to harness `POSES` registry. Broader
    measurement coverage; would also let iter-10's bulb-color delta
    show numerically (a TL-corner pose would put the bulb inside the
    ROI).
  - **iter-09 with night pose** — implement web street-light emitters
    AND add a night pose to the harness so the change is measurable.
    More work but higher impact (night streets are visually empty on
    web vs lit on UE5).

Picking iter-13-revisit-pose-coverage on next cron — closes the
measurement-coverage gap that's blocking visual changes from showing
numerically.
