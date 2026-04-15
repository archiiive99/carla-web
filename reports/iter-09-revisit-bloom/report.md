# iter-09-revisit-bloom report

**Status: ⚠️ §6.3 — bloom integration broke scene rendering; reverted
cleanly.** EffectComposer + Bloom from @react-three/postprocessing was
added per the standard drei pattern; harness numbers superficially
shot up (PSNR 62 / SSIM 0.99 / ΔE 0.03) but visual inspection showed
the night render became entirely BLACK and the day render showed a
wrong camera state. Numbers were thus a metric artifact of "both
images mostly black/blurred matches CARLA's mostly-black reference",
not a real parity gain.

Reverted the EffectComposer + Bloom; harness numbers returned exactly
to the iter-09-revisit-emissive baseline (PSNR 40.25 / SSIM 0.6787 /
ΔE 0.59), confirming clean revert.

Tenth tally: 9 ✅ + 5 ⚠️ (this iter joining the ⚠️ group).

---

## §7.1 Architecture posture
After revert: identical to iter-09-revisit-emissive. Single-source
preserved. The `@react-three/postprocessing` package remains in
package.json (npm-installed) so a follow-up iter-09-revisit-bloom-v2
can use it without re-install.

## §7.2 Feature delta
**Reverted change** to `WorldCanvas.tsx`:
  - The EffectComposer + Bloom block was placed after
    `<SceneCompositor />` inside the `<Canvas>` tree.
  - On launch, the night render was entirely black; the day render
    showed scene content from a wrong camera angle (probably the
    SceneCompositor's intermediate render target rather than the main
    viewport camera).
  - Likely root cause: this canvas already does heavy multi-camera
    composition (`ViewportControllers` + `SceneCompositor` +
    `preserveDrawingBuffer` + custom tone mapping). Drei's
    EffectComposer wraps the WHOLE render, intercepting the multi-camera
    composition and presenting only a single render-target output.

**Reverted commit** preserves the npm dependency for a future v2 attempt.

## §7.3 Pixel diff
- Pre-revert night: pure-black 1920×1080 (no scene content visible).
- Pre-revert day: wrong-camera-angle scene (looks like a different
  pose's render target).
- Post-revert: identical to iter-09-revisit-emissive captures.

## §7.4 Measurements

| Run | PSNR (dB) | SSIM | ΔE | Note |
|---|---|---|---|---|
| iter-09-revisit-emissive after_lamp_heads (baseline) | 40.25 | 0.6787 | 0.59 | pre-bloom |
| iter-09-revisit-bloom after_bloom_night | 62.10 | 0.9951 | 0.03 | broken (black frame) |
| iter-09-revisit-bloom after_bloom_day | 14.60 | 0.2837 | 27.69 | broken (wrong camera) |
| iter-09-revisit-bloom after_revert | **40.25** | **0.6787** | **0.59** | clean revert ✅ |

The "after_bloom_night" PSNR=62 is technically the highest road-ROI
PSNR ever recorded in this project, but it's an artifact of comparing
two near-pure-black ROIs. SSIM=0.9951 is also misleading because two
nearly-uniform images are structurally identical regardless of intent.
The metrics are NOT trustworthy when bloom causes scene-blackout.

## §7.5 Effort breakdown
  - Investigation + npm install: ~10 min
  - Bloom add (~15 LOC): ~5 min
  - Harness night + day runs: ~6 min
  - Diagnose (visual inspection of both renders): ~10 min
  - Revert + verify (~10 LOC): ~10 min
  - Report: ~10 min
  - **Total: ~50 min, well under 1 h budget.**

## §7.6 Honesty-badge audit
0 NEW hits — verified.

## §7.7 Autonomy decisions
  - **Reverted on visual evidence** despite the metric showing
    "improvement". Per harness §F intent and the project's broader
    "no-honesty-badge" principle: a number that says "win" while the
    output is broken is a regression to be undone, not a parity claim
    to be banked.
  - **Kept the npm dependency** in package.json for iter-09-revisit-
    bloom-v2. Removing the package would just force a re-install
    later; the dependency is harmless when unused.
  - **Single revert turn-around (~20 min from break to clean)** — the
    harness's reproducibility (iter-13-followon) made this fast: I
    knew exactly what numbers to expect post-revert (40.25 / 0.6787 /
    0.59 from iter-09-revisit-emissive), and confirmed when those
    landed exactly.

## §7.8 Remaining gaps → paths

  - **iter-09-revisit-bloom-v2**: re-attempt with deeper
    investigation:
    1. Probe what `SceneCompositor` does — likely it's a multi-
       viewport sensor renderer that draws into multiple textures.
       EffectComposer may need to be inside a per-viewport context,
       not at the root.
    2. Try mounting EffectComposer ONLY when not in
       multi-viewport mode (`if (viewports.length === 1)`).
    3. Or use a pure THREE.js EffectComposer at a specific render-
       phase rather than drei's Canvas-level wrapper.
    4. Or use selective bloom (Bloom layer + selective layer mask)
       so only specific objects bloom and the rest of the scene
       composition is preserved.

## §7.9 Next iteration
Per session-raise §6.5 still in effect. Tractable next:
  - **iter-14 LOD pipeline** — performance, no parity comparison
    needed (would benchmark FPS not PSNR)
  - **iter-09-revisit-bloom-v2** — needs deeper drei-postprocessing +
    multi-viewport investigation; ~1.5h
  - Continued ✅-on-arrival audits

Picking iter-14 next — different domain from the recent night/visual
work, fresh angle.
