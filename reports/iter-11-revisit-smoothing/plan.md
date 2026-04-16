# iter-11-revisit-smoothing plan

Phase tag: A → G (compressed).
Time budget: 30 min.

## Approach
Add useRef-backed current-exposure value; lerp toward target at
0.4/s. ~2s transition from day → night or vice versa. Seed initial
value AT target to avoid mount-transient.

## Files in scope
  - `scene-environment.tsx` ExposureDriver only.

## Acceptance
Steady-state exposure at stationary camera unchanged (harness
captures wait ~1.5s — lerp converges before capture). Smoothing
only matters for in-play transitions.
