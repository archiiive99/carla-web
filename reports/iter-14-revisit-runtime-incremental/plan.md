# iter-14-revisit-runtime-incremental plan

`GltfInstanced` gains optional `incrementalBatchSize` prop. When
non-zero, cull pass processes N instances per frame via a cullCursor
ref, amortizing rebuild cost.

Default 0 = full pass (no behavior change).
