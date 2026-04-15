# Render parity — AFTER_BLOOM_DAY

**Pose**: `street_clear_midday` = (x=118.9, y=55.8, z=1.8, yaw=180.0°, pitch=-8.0°, roll=0.0°)
**Capture**: 1920×1080 PNG; ROI polygon covers road surface.

## Metrics (road ROI)

| Metric | Value |
|---|---|
| PSNR (dB) | 14.60 |
| SSIM | 0.2837 |
| Mean ΔE (CIE76) | 27.69 |

## Images

- Reference (CARLA UE5 `sensor.camera.rgb`): `ue5_reference_after_bloom_day.png`
- Measured (web shared-scene 3D viewport): `web_render_after_bloom_day.png`
- ROI overlay visualization: `roi_overlay_after_bloom_day.png`
