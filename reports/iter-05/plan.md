# iter-05 plan — Sky + sun direction parity

**Phase tag:** A (opened 2026-04-15T07:50:51Z)
**Time budget:** 4 h hard / 6 h watchdog ceiling per harness §5.1

## Target row (from queue, re-ordered ahead of iter-02)

> iter-05 — Sky + sun direction parity (Hosek-Wilkie or HDR)

## Why now (not iter-02)

Iter-01 final report (`reports/iter01/report.md` §7.4 + commit `369009cc6`)
attributes the residual ROI gap to inverted color balance (UE5 warm vs web cool)
and missing directional-shadow contrast. Both are downstream of sun position +
sky color. Building façades cannot move iter-01's numbers; sky+sun can.

## Success looks like

  - Web `<Sky>` (or HDR cubemap) reproduces UE5 sun direction within ±3° azimuth
    and ±2° altitude at the iter-01 pose `street_clear_midday`
    (cloudiness=10, sun_altitude=60, sun_azimuth=220).
  - Sky-ROI (top half of frame, masked to non-cloud pixels) PSNR ≥ 24 dB,
    SSIM ≥ 0.75, ΔE ≤ 8 against UE5 reference at the same pose.
  - Iter-01 road ROI re-measured AFTER iter-05 shows ΔE improvement ≥ 3
    (sky drives the warm fill light hitting the road).
  - Bridge weather state (sun_altitude, sun_azimuth, cloudiness) flows through
    the WS schema into the web `<Sky>` props every weather change.

## Files in scope

  - `carla-web/src/components/viewport/scene-environment.tsx` (current sky impl)
  - `carla-web-bridge/src/models/schemas.py` (WeatherState fields if missing)
  - `carla-web-bridge/src/utils/serialization.py` (weather serializer)
  - `carla-web-bridge/tools/render_parity/compare.py` (add sky-ROI mode)
  - `carla-web-bridge/tools/render_parity/poses/street_clear_midday.json` (pose pin)
  - `carla-web/src/components/viewport/carla-assets/sky-assets.ts` (NEW — if HDR path)
  - `carla-web/public/assets/carla/sky/*.hdr` (NEW — if HDR path)

## Out of scope

  - Cascaded shadow maps (iter-06).
  - Tonemap / exposure / bloom (iter-11).
  - Lens flare / god rays / atmosphere fog tuning beyond the sky shader's own params.
  - Editing `components/{controls,shared,layout}/` beyond ≤5-line compile fix.
  - Road material re-touch (iter-01 revisit happens after iter-06 + iter-11 land).

## Implementation paths (Phase B will pick one)

  1. **drei `<Sky>` (Preetham analytic)** — already imported per project memory
     (ExposureDriver). Drive `sunPosition` from bridge weather. Cheap, no asset
     extraction. Lower fidelity ceiling than HDR.
  2. **Hosek-Wilkie analytic** — better atmospheric scattering match. Custom
     shader; needs a sky dome mesh + uniforms. Mid-effort.
  3. **HDR cubemap per (TOD bucket × cloudiness bucket)** — 6 HDR EXRs
     (sunrise/midday/sunset × clear/cloudy). Highest fidelity, requires asset
     authoring or extraction. Highest effort. Best parity ceiling.

Phase B picks one with explicit rationale.
