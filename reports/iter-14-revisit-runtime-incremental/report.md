# iter-14-revisit-runtime-incremental report

**Status: ✅ PASS — infrastructure landed.** `incrementalBatchSize`
prop added to GltfInstanced. When > 0, each cull pass processes
`incrementalBatchSize` instances per frame via a cullCursor ref,
amortizing rebuild cost. Default 0 preserves full-pass behavior.
Thirty-second ✅ of session.

## §7.2 Feature delta
  - `incrementalBatchSize?: number` prop (default 0)
  - `cullCursor` ref tracks mid-pass position (-1 = no pass in flight)
  - When cursor < 0, a camera-move-≥sensitivity starts a new pass
    (sets cursor = 0, updates lastCullPos)
  - Each frame processes [cursor, cursor + batchSize); when
    cursor reaches objects.length, resets to -1

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE |
|---|---|---|---|
| prior steady-state | 16.73 | 0.3061 | 21.85 |
| after retry (default 0 = no-op) | **16.71** | **0.3062** | **21.86** |

Within noise. No behavior change at default setting.

## §7.5 Effort breakdown
~25 min (refactor useFrame + kill-hung-harness self-recovery +
report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - §4.1 tooling-failure self-recovery: killed stale chrome-headless
    processes when harness hung for 225s without producing output.
    Retry succeeded.
  - Default 0 = full pass. Sites wanting incremental can opt in.

## §7.9 Next iteration
Per queue: smaller revisits exhausted. Remaining are 3-4h iterations
or UE-blocked.
