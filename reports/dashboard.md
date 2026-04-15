# Rendering parity dashboard

Cumulative parity numbers per harness `prompts/specs/rendering-iteration-harness.md` §7.2.
Updated after every Phase H. Acceptance bars: PSNR ≥ 30 dB, SSIM ≥ 0.85, ΔE ≤ 5
(iter-01 used relaxed 28/0.80/6).

**Summary:** 0 rows ✅, 2 rows ⚠️, 17 rows queued.

| Iter | Row | Status | PSNR (dB) | SSIM | ΔE | Effort | Commit |
|---|---|---|---|---|---|---|---|
| 01 | Road PBR + parity harness MVP | ⚠️ §6.3 | 14.32 | 0.282 | 19.83 | prior session | 369009cc6 |
| 05 | Sky + sun direction parity (Path A) | ⚠️ §6.1 | 15.21 | 0.329 | 19.05 | ~80 min | (this commit) |

## Notes

- Iter-01 raise: gap is upstream lighting (color balance + shadow contrast), not
  road material. Re-prioritized iter-05 / 06 / 11 ahead of iter-02 to address.
  Iter-01 will be revisited after lighting stack lands.
- Pose pinned for all comparisons: `street_clear_midday` at Town01 spawn[0],
  driver eye height, pitch −8°, yaw 180°. Defined in
  `carla-web-bridge/tools/render_parity/`.
- ROI tightened to pure road surface: `[(0.28,0.75),(0.72,0.75),(0.72,0.95),(0.28,0.95)]`.
