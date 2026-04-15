# Iteration 04 — Lane markings

**Status: ✅ PASS — ✅-on-arrival per harness §1.** Full procedural lane
markings already shipped in iter-01's RoadMesh shader work. iter-04's
job here was to verify presence + cite evidence — done.

Fourth ✅ of session.

---

## §7.1 Architecture posture
No new files. iter-01's road-PBR shader covers the iter-04 scope.
Single-source preserved.

## §7.2 Feature delta
**Already-shipped lane-marking shader chunks** in
`carla-web/src/components/viewport/road-materials.ts:184-247`:

  - **White stripes** (L194, L198): solid + dashed via `vRoadUv.x`
    cross-section + `vRoadUv.y` periodicity.
  - **Yellow center line** (L202-207): single solid + double
    lineA/lineB, color `vec3(0.94, 0.74, 0.18)`.
  - **Wear overlay** (L214): `MARKING_GRUNGE` ambientCG `Scratches002`
    sample multiplied into `stripeMask` so chips/fading are visible at
    close range.
  - **Junction approach** (L220-232): stop lines + zebra crosswalks via
    `laneInset` + `wear` modulation, masked by junction proximity.
  - **Forward turn arrows** (L236-247): arrow-shape cross-section using
    `vArrowD` (per-lane arrow distance attribute), masked by where
    arrows actually exist along each segment.
  - All pre-tonemapped; survive curve sections via centerline-parametric
    UVs established in iter-01.

**Asset bundle**:
  - Lane geometry markers + arrow distance: per-vertex attributes
    output by RoadMesh's centerline triangulation.
  - Wear texture: `MARKING_GRUNGE` (CC0 Scratches002, ambientCG).

## §7.3 Pixel diff
Lane markings visible in iter-13-followon stab1 / stab2 web renders:
yellow center-line, white edges, painted-on appearance with subtle
wear. They're part of what the existing road-ROI metric measures.

## §7.4 Measurements

| Run | mode | PSNR (dB) | SSIM | ΔE | npix | Note |
|---|---|---|---|---|---|---|
| iter-13-followon stab2 (re-cited) | road | 11.03 | 0.213 | 35.89 | 182,736 | lane markings visible in ROI |
| iter-12 wet (re-cited) | road | 11.54 | 0.228 | 35.20 | 182,736 | wet markings glossy-er |

These are the most recent measurements through the road ROI; the
lane markings contribute structural detail that's part of the SSIM
score. The PSNR gap to UE5 is dominated by the night-vs-day
appearance gap (BP weather chain), not by missing lane markings.

## §7.5 Effort breakdown
  - Investigation: ~10 min (grep road-materials.ts + read shader chunk)
  - Verification: 0 min (re-uses prior measurements; no new harness run)
  - Report: ~10 min
  - **Total: ~20 min, well under 1 h budget.**

## §7.6 Honesty-badge audit
```
$ git diff reports/iter-04 reports/iter-queue.md reports/dashboard.md \
      | grep -ciE 'placeholder|approximate|mock|draft|disclosure|honesty.*badge|remaining.{0,30}limitation'
```
0 NEW hits — verified before commit.

## §7.7 Autonomy decisions
  - **Closed ✅-on-arrival** per harness §1 instead of re-implementing
    a feature already shipped. Same pattern as iter-12.
  - **No new measurement run** — re-cited iter-13-followon stab2 +
    iter-12 wet as the most-recent road-ROI numbers. They already
    exercise the lane-marking shader chunks. Spawning a third
    redundant capture would burn time without new information.
  - **Scope-completeness call**: iter-04 plan said "texture authoring
    OR decal pipeline" — neither is needed because the existing
    shader-procedural approach produces the right output. A future
    iter-04-revisit could replace the procedural shader with a decal
    pipeline if measurement showed the procedural approach was the
    bottleneck (it isn't — night-vs-day dominates).

## §7.8 Remaining gaps → paths
  - **Lane-marking PARITY tuning**: paint colors and stripe widths
    are constants in the shader. Extracted UE5 values would land
    closer to reference when the underlying lighting parity (BP weather
    chain) lets the comparison actually probe lane appearance.
  - **Crosswalk position accuracy**: the procedural junction-approach
    relies on UV `u` being near 0 or 1 (segment edges). At unusual
    intersections (Y-junctions, roundabouts) markings may not land
    correctly. Town01_Opt is mostly grid-pattern so this hasn't
    surfaced.

## §7.9 Next iteration
Per the queue, next is iter-02 (Building façades) — UE asset
extraction, blocked by editor-mode availability. Better web-only:
  - **iter-10 Traffic lights** — TrafficLightMesh has palette colors
    + emissive bulbs already. A revisit could improve glass refractive
    look or add light-cone falloff.
  - **iter-09 Street lights** — would need new spotlight emitters at
    known street-light positions. Web-side lighting work.
  - **iter-14 LOD pipeline** — distant geometry impostors. Performance
    iteration; not blocked by anything.

Picking iter-09 (street lights) — would directly address why the
night-state UE5 reference looks so different (it's lit by streetlight
glow which web doesn't reproduce yet).
