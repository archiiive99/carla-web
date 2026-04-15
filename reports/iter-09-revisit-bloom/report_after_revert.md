# Render parity — AFTER_REVERT

**Pose**: `street_clear_night` = (x=118.9, y=55.8, z=1.8, yaw=180.0°, pitch=-8.0°, roll=0.0°)
**Capture**: 1920×1080 PNG; ROI polygon covers road surface.

## Metrics (road ROI)

| Metric | Value |
|---|---|
| PSNR (dB) | 40.25 |
| SSIM | 0.6787 |
| Mean ΔE (CIE76) | 0.59 |

## Images

- Reference (CARLA UE5 `sensor.camera.rgb`): `ue5_reference_after_revert.png`
- Measured (web shared-scene 3D viewport): `web_render_after_revert.png`
- ROI overlay visualization: `roi_overlay_after_revert.png`
