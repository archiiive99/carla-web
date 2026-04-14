# Render-parity harness (iteration 01 MVP)

Compares the **web shared-scene 3D viewport** against a direct
**CARLA UE5 `sensor.camera.rgb`** capture at a matched world pose, on a
road ROI. Produces PSNR / SSIM / mean ΔE numbers and a report under
`reports/iter01/`.

## Important: this does NOT re-introduce the JPEG WS stream

After the iteration-0 single-source migration, the bridge no longer pumps
RGB camera JPEG frames to the browser. That deletion is final.

This harness uses `carla.Client()` — the official Python API — as a
**test-only side channel** to capture a reference frame directly from
CARLA for measurement. The running browser does not see any of these
bytes; the bridge is untouched. The harness talks to CARLA on
`localhost:58338` directly, bypasses the bridge entirely on the reference
side, and drives the browser via an unchanged URL (`?camPose=...`).

If you find yourself wiring a CARLA RGB capture back into the bridge's
data plane, stop — that's the deleted architecture, not a harness.

## Run

```bash
cd carla-web-bridge
.venv/bin/python tools/render_parity/compare.py \
    --pose street_clear_midday \
    --bridge-url http://localhost:58336 \
    --carla-host localhost --carla-port 58338 \
    --out ../reports/iter01 \
    --label before    # or after
```

## Output

- `reports/iter01/ue5_reference_<label>.png` — CARLA reference capture
- `reports/iter01/web_render_<label>.png` — web 3D capture
- `reports/iter01/roi_overlay_<label>.png` — ROI polygon drawn on the web render
- `reports/iter01/report_<label>.md` / `report_<label>.json` — metrics

## Acceptance bar (iteration 01)

- PSNR ≥ 28 dB
- SSIM ≥ 0.80
- Mean ΔE ≤ 6

Later iterations tighten these.
