# iter-04 plan — Lane markings

**Phase tag:** A → G (no-op closure path)
**Time budget:** 1 h hard

## Target row
> iter-04 — Lane markings — texture authoring or decal pipeline

## Discovery
Investigation in iter-12 (peeking at road-materials.ts) revealed a full
procedural lane-marking implementation in the road shader. Confirmed
in this iteration's grep:

  - `road-materials.ts:184-247` — full lane-marking shader chunk:
      - L194: white stripe color `vec3(0.88, 0.86, 0.80)`
      - L207: yellow center line color `vec3(0.94, 0.74, 0.18)`
      - L198, L202, L206: stripe shape (solid white, dashed white,
        double yellow), procedural from `vRoadUv.x` cross-section
      - L214: wear overlay multiplies grunge texture into stripeMask
      - L220-232: junction-approach markings (stop lines + zebra crosswalks)
      - L236-247: forward turn arrows
      - All masks survive curves via the centerline-parametric UV
        established in iter-01

This is more than the iter-04 plan called for. Per harness §1: "If a
row turns out to be a no-op (e.g. parity already met), close it as
✅-on-arrival with measurement evidence." Closing.

## Files in scope
None changed. Reports + dashboard updates only.

## Phase E
Re-uses the iter-13-followon stable harness number for the road ROI
(11.03 dB / 0.213 / 35.89). Lane markings are visible in the road ROI;
they are part of what the metric already measures.

## Phase F
✅-on-arrival.
