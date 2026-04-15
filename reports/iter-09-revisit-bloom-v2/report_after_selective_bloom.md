# Render parity — AFTER_SELECTIVE_BLOOM

**Pose**: `street_clear_night` = (x=118.9, y=55.8, z=1.8, yaw=180.0°, pitch=-8.0°, roll=0.0°)
**Capture**: 1920×1080 PNG; ROI polygon covers road surface.

## Metrics (road ROI)

| Metric | Value |
|---|---|
| PSNR (dB) | 6.10 |
| SSIM | 0.0010 |
| Mean ΔE (CIE76) | 52.54 |

## Images

- Reference (CARLA UE5 `sensor.camera.rgb`): `ue5_reference_after_selective_bloom.png`
- Measured (web shared-scene 3D viewport): `web_render_after_selective_bloom.png`
- ROI overlay visualization: `roi_overlay_after_selective_bloom.png`
