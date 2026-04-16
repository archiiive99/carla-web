# iter-06-revisit-csm-v2 plan

True multi-cascade deferred. Scoped to shadow penumbra softening
via `shadow-radius={2.5}` on the directionalLight. Canvas already
set to `shadows="soft"` (PCFSoftShadowMap); without a radius the
filter kernel is 1 texel = hard edge.
