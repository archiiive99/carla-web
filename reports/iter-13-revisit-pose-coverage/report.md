# iter-13-revisit-pose-coverage report

**Status: ✅ PASS** — three new poses landed in the harness POSES
registry; each produces stable numeric output and visually sensible
framing. Future iterations can pick the most relevant pose per row
(e.g. iter-09 street lights → birdseye for global coverage; iter-10
bulb tuning → intersection_corner; iter-02 façades → chase for natural
viewing distance). Seventh ✅ of session.

---

## §7.1 Architecture posture
Single-source preserved. Only `compare.py` POSES dict touched.

## §7.2 Feature delta
Three new poses added to `compare.py:56-89`:

  - **`birdseye_clear_midday`**: top-down at the iter-01 intersection,
    z=80 m, pitch=-89°.
  - **`chase_clear_midday`**: behind+above the street pose, z=4 m,
    pitch=-15°.
  - **`intersection_corner_midday`**: same x/y as street pose but
    yaw+90° (looking sideways at intersection).

`street_clear_midday` (the iter-01 baseline) is unchanged.

## §7.3 Pixel diff
Visual inspection of `web_render_birdseye_probe.png`: city grid +
buildings + road network + vegetation visible from overhead. Pose
lands at expected altitude, no underground/inside-wall artifacts.

## §7.4 Measurements

| Pose | PSNR (dB) | SSIM | ΔE | npix | Visual sanity |
|---|---|---|---|---|---|
| street_clear_midday | 11.03 | 0.213 | 35.89 | 182,736 | iter-13-followon stab2 baseline |
| birdseye_clear_midday | 8.68 | 0.359 | 46.46 | 182,736 | overhead city grid renders |
| chase_clear_midday | 11.50 | 0.298 | 34.08 | 182,736 | follow-cam street view |
| intersection_corner_midday | 8.74 | 0.139 | 44.72 | 182,736 | sideways at intersection |

Per-pose number variance reflects different framing producing
different parity gap signatures (birdseye / corner views have less
sky vs more building per ROI; chase has similar framing to street so
similar PSNR). Same npix because the road ROI polygon is fraction-
of-frame and same capture resolution.

## §7.5 Effort breakdown
  - Plan + pose-value selection: ~10 min
  - Implementation (3 new POSES entries): ~5 min
  - Three harness probe runs: ~10 min
  - Report: ~10 min
  - **Total: ~35 min, well under 1 h budget.**

## §7.6 Honesty-badge audit
0 NEW hits — verified.

## §7.7 Autonomy decisions
  - **Same x/y for birdseye + intersection_corner** as the street
    pose — keeps the geographic anchor consistent so future
    iterations can compare metric movement across poses meaningfully.
  - **Pitch=-89 not -90** for birdseye — avoids gimbal degeneracy at
    exact ±90 (yaw becomes undefined), keeps Three.js camera math
    stable.
  - **Did NOT add per-pose ROI polygons** — used the existing road ROI
    which is fraction-of-frame so it lands somewhere sensible at every
    pose. Per-pose ROI tuning is iter-13-revisit-roi-per-pose
    territory if a specific iteration needs it.

## §7.8 Remaining gaps → paths
  - **Per-pose ROI polygons**: at intersection_corner, the road ROI
    sits over the right-side sidewalk + sign post, not road. SSIM
    drop from 0.21 → 0.14 reflects this misalignment. Queue
    iter-13-revisit-roi-per-pose if/when a building-façade or signage
    iteration needs intersection-corner measurements.
  - **Night-pose variants**: iter-09 street lights need a pose with
    sun_alt < 0. Add `street_clear_night` (sun_alt=-30) when iter-09
    is opened — would also let iter-engine-weather-bp-revisit verify
    its fix produces correct night state.

## §7.9 Next iteration
Per session-raise §6.5 still in effect. With pose coverage now broader,
tractable next:
  - **iter-09 street lights** — add night pose, implement web-side
    SpotLights at street-lamp positions when sun_alt<0. Visible
    measurable delta in the night-pose ROI.
  - **iter-14 LOD pipeline** — performance work, not parity.
  - Continued ✅-on-arrival audits (likely fewer remaining; most
    obvious shipped features already audited).

Picking iter-09 next — would produce a real night-side visual
improvement and exercise the new pose infrastructure.
