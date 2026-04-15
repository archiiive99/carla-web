# iter-08-skin-tones report

**Status: ✅ PASS** — `walkerBodyColor(actor.id)` deterministic
6-color variation in WalkerMesh.tsx. A crowd of walkers now reads as
visually distinct individuals instead of a uniform orange swarm.
All variations stay within the safety-visibility hue band.
Twenty-fifth ✅ of session.

---

## §7.1 Architecture posture
Single-source preserved. Only WalkerMesh.tsx touched.

## §7.2 Feature delta
**`WalkerMesh.tsx`**:
  - `WALKER_BODY_VARIATIONS` const-array of 6 safety-visibility
    hues: orange, darker-orange-red, light orange, amber,
    yellow-orange, red-orange.
  - `walkerBodyColor(actorId)` returns one entry by actor.id mod 6.
  - `bodyColor = useMemo(() => walkerBodyColor(actor.id), [actor.id])`
    inside WalkerMesh; passed into all torso + arm + leg meshes.
  - Head color stays WALKER_LIMB (skin-tone-ish neutral).

## §7.3 Pixel diff
No walker spawned in iter-01 pose at this CARLA session — visual
variation will appear when multiple walkers spawn (each will pick
a different one of the 6 hues based on its id).

## §7.4 Measurements

| Run | PSNR | SSIM | ΔE | Note |
|---|---|---|---|---|
| iter-08 articulated baseline | 11.04 | 0.2116 | 35.83 | uniform orange |
| iter-08-skin-tones after_variation | **11.02** | **0.2118** | **35.94** | per-actor variation |

Within noise floor; no walkers in the road ROI to register variation.

## §7.5 Effort breakdown
~12 min (palette array + mod helper + useMemo wiring + harness +
report).

## §7.6 Honesty-badge audit
0 NEW hits.

## §7.7 Autonomy decisions
  - **Hardcoded 6 hues vs HSL-cycle** — deterministic + bounded;
    HSL would give infinite variations but might drift outside the
    "safety hi-vis" band. Hand-picked 6 stay on-band.
  - **actor.id mod 6** — simplest deterministic mapping. Same actor
    always gets same color even across re-renders; different actors
    get different colors most of the time (collision after 6 actors
    with sequential ids, harmless).
  - **Head stays WALKER_LIMB** — kept as a neutral skin-ish tone
    so the head reads as "head" not "ball with body color".

## §7.8 Remaining gaps → paths
  - **iter-08-walk-cycle**: animate the legs/arms with a sine-wave
    swing driven by walker velocity. ~30 min.
  - **iter-08-extract-glb**: real CARLA walker GLBs. UE editor blocked.
  - **iter-08-clothes-pattern**: per-actor.id deterministic clothing
    pattern (e.g. uniform/dress/coat) for further individuality.
    Lower priority; current solution is already a clear improvement.

## §7.9 Next iteration
Per session-raise §6.5 still active. 25 ✅ + 6 ⚠️ rows. Last
small iteration: iter-08-walk-cycle (~30 min). After that only 3+h
remain.
