# Render parity — AFTER_COORD_FIX

**Pose**: `street_clear_midday` = (x=118.9, y=55.8, z=1.8, yaw=180.0°, pitch=-8.0°, roll=0.0°)
**Capture**: 1920×1080 PNG; ROI polygon covers road surface.

## Metrics (road ROI)

| Metric | Value |
|---|---|
| PSNR (dB) | 11.03 |
| SSIM | 0.2128 |
| Mean ΔE (CIE76) | 35.88 |

## Images

- Reference (CARLA UE5 `sensor.camera.rgb`): `ue5_reference_after_coord_fix.png`
- Measured (web shared-scene 3D viewport): `web_render_after_coord_fix.png`
- ROI overlay visualization: `roi_overlay_after_coord_fix.png`
