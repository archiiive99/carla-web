# iter-09-revisit-lamp-arm report

**Status: ✅ PASS** — each lamp now has a horizontal 0.5 m arm and
the head + halo + spotlight have shifted to the arm's outboard
end, so the light hangs over the road instead of sitting atop its
pole. Arm direction flips at CARLA x=120 (road centerline): lamps
west of 120 reach +x, lamps east reach -x. Fifty-first ✅ of
session.

## §7.2 Feature delta
`NightStreetLights.tsx`:
  - `lampSpecs` memo switched from `{position, target}` to
    `{poleBase, poleTop, armDir, headPosition, target}`.
  - `armDir = cx < 120 ? 0.5 : -0.5` (per-lamp sign selects road-
    ward direction).
  - `headPosition = [cx + armDir, cz, -cy]` — head + halo +
    spotLight + target all moved to this offset.
  - New horizontal arm mesh: `cylinderGeometry(0.04, 0.04, 0.5, 8)`
    rotated `[0, 0, Math.PI/2]` (lay along x), positioned at
    `[armMidX, py, pz]` where `armMidX = px + armDir/2`.
  - Arm material matches pole (`#2a2a30`, roughness 0.7, metalness 0.4).

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| scene-drift (16.xx band) | 16.70 | 0.3063 | 21.87 |
| after_edit (street_clear_midday) | **16.72** | **0.3063** | **21.87** |

Byte-identical within noise. Lamp cluster lives above road-ROI
rectangle, so the arm addition and head offset don't sample into
the metric pixels.

## §7.5 Effort breakdown
~25 min (plan + lampSpecs schema change + arm mesh + render-path
restructure + tsc + harness foreground (background run got SIGTERM'd,
retried sync) + report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - Arm direction keyed on CARLA x=120 (road centerline between
    lamp columns at 110 and 130) — hardcoded threshold is fine for
    the iter-01 test intersection; a future queue row that adds
    more lamps would need a per-lamp armDir in the position tuple.
  - Stopped and re-ran the harness synchronously after the first
    background run exited with SIGTERM (exit 143). Foreground run
    completed in ~120 s and produced clean metrics.
