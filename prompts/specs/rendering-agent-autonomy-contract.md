# Rendering Agent Autonomy Contract

> Read this in addition to (NOT instead of)
> `rendering-overhaul-no-cosmetic-escape.md`,
> `rendering-100-percent-parity.md`, and
> `asset-extraction-pipeline.md`. This document does not relax any
> mandate in those specs. It changes only your interaction default
> from "ask before each step" to "decide and proceed."
>
> Every iteration prompt you receive applies under this contract.

---

## 0. What this contract changes

### 0.1 Default mode flips
**Before**: when you encountered any decision the iteration spec
did not literally name, you stopped, formulated options, asked
the user to pick, and waited.

**After**: when you encounter any decision the iteration spec did
not literally name, you pick the option that best serves the
spec's goals, write a one-line rationale into your eventual
report, and proceed. You return to the user only on the strict
list in §2.

### 0.2 What this contract does NOT change
The mandates still bind you with full force:
  - Single-source 3D architecture (`rendering-overhaul-no-cosmetic-escape.md` §2).
  - No honesty badges / disclosure labels (§3.1 there).
  - No UI refactor drift (§3.2).
  - No placeholder tolerance (§3.3).
  - No type/build-only "verification" (§3.4).
  - No "impossible" excuses (§2.7).
  - GPU 2 for any UE5-side work (§2.8).
  - Verification honesty (`feedback_no_unreproducible` + parity §1).
  - Asset pipeline rules (`asset-extraction-pipeline.md`).

Autonomy means freedom to choose **HOW** to satisfy the mandates.
It does not mean freedom to deviate from them.

---

## 1. The DECIDE list — full autonomy, no check-in

You decide every one of these without asking, document the choice
in §7.X of the iteration report:

### 1.1 Tooling and language
  - Which extraction tool (UE5 commandlet vs Datasmith vs Python
    editor scripting vs FBX-then-glTF). Pick per
    `asset-extraction-pipeline.md` §4 trade-offs.
  - Which language for the measurement harness (Python, Node,
    TypeScript). Pick what is fastest to a working harness.
  - Which testing framework (pytest, vitest, plain script).
  - Which texture compression settings (UASTC vs ETC1S, mip
    counts, anisotropy).
  - Which build tool integration (npm script, Makefile, shell
    script in `tools/`).

### 1.2 Implementation details
  - Shader composition, uniform names, blend math.
  - UV strategy (centerline-parametric vs triplanar vs hybrid).
  - LOD thresholds and counts.
  - Asset bundling layout (one GLB per asset vs packed atlas vs
    per-map combined).
  - Manifest schema (TypeScript const vs JSON file vs generated
    module).
  - Mesh optimization parameters (gltfpack flags).
  - Shadow camera frustum sizing strategy.
  - Frameloop strategy for sensor cells (`always` vs `demand` +
    throttle).
  - Lights instancing strategy (per-light vs clustered vs
    instanced uniforms).
  - Sky model choice (gradient vs Hosek-Wilkie vs IBL cubemap).

### 1.3 Procedural vs authored decisions
  - Within a category (markings, building details, vegetation):
    procedural shader vs authored texture vs hybrid. Pick per
    fidelity / scope / time trade-off and document the call.
  - Whether a UE5 effect maps to MeshStandardMaterial,
    MeshPhysicalMaterial, a custom shader, or a compute pass.

### 1.4 Test / harness specifics
  - ROI polygon coordinates within the matched-pair frame.
  - Number of poses captured (within or beyond the iteration
    spec's minimum).
  - ΔE algorithm (CIE76 vs CIE2000) — pick for convenience.
  - Threshold tuning within ±10 % of the spec's stated bars when
    you have a documented reason (e.g. "asphalt's fine grain
    inherently produces more high-frequency error than the spec
    threshold accounts for; raised PSNR floor by 1 dB"). Beyond
    ±10 % → §2 (raise).

### 1.5 Refactor scope within the lane
  - Splitting one large file into smaller ones if the change
    naturally calls for it AND the result is still inside your
    iteration's owned directories.
  - Adding new modules under `components/viewport/`,
    `components/3d/`, `shaders/`, `assets/`, `tools/`.
  - Renaming variables / functions inside files you are already
    editing for the iteration's pixel work.

### 1.6 Time-box decisions
  - Spending up to 30 min on an investigation thread before
    pivoting if it's not yielding.
  - Choosing the (a)-then-(c) fallback structure for any
    extraction blocked by GPU contention (default behavior, no
    longer needs an explicit per-iteration ruling).
  - Skipping optional stretch goals when the iteration's core
    deliverables are at risk for time. Mark them ⚠️ with a path,
    do NOT mark them ❌.

---

## 2. The RAISE list — these (and ONLY these) come back to the user

You return to the user mid-iteration ONLY for one of the
following. Anything not in this list is your decision under §1.

### 2.1 External blockers you cannot work around
  - All of GPU 0/1/2/3 are unavailable for the UE5 work (after
    confirming with `nvidia-smi`).
  - CARLA Python API does not expose data the iteration's
    measurement requires AND there is no documented alternative
    in the bridge.
  - Required source file in
    `/data1/song99/carla/Unreal/CarlaUnreal/Content/` is missing
    (verify path before raising — must NOT be raised based on
    "I couldn't find it" without `ls` output).

### 2.2 Forced spec violation
  - The work genuinely requires editing a file under
    `components/controls/`, `components/shared/`, or
    `components/layout/` for more than ~5 lines of compile-fix.
  - The work genuinely requires touching a file owned by another
    agent (Bridge / Color / Adaptive / Tests).
  - The iteration's IN/OUT scope draws a line you cannot honor
    while completing the deliverable.
  - You discover that satisfying the spec would require
    regressing the §2 single-source architecture.

### 2.3 Threshold deviation > ±10 %
  - You measured but cannot reach within ±10 % of the iteration
    spec's PSNR / SSIM / ΔE bars even after a good-faith
    implementation. Raise WITH the numbers and the gap analysis,
    not before.

### 2.4 Iteration complete — final §7 report
  - All deliverables shipped, audit updated, harness rerun for
    AFTER measurements, report drafted.

### 2.5 Discovery of a banned excuse landing in your own draft
  - You catch yourself about to write "impossible", "structural",
    "engine-specific", "fallback to JPEG", "honesty disclosure",
    "remaining limitation", or any of the §8 forbidden phrases.
    Stop, re-read the relevant mandate, pivot. If after the
    pivot you still believe the banned conclusion is correct,
    THAT is when you raise — with the pivot attempt documented.

### 2.6 Nothing else is in this list
The list above is exhaustive. If your situation is not on it,
decide and proceed.

Specifically NOT on the raise list:
  - "Which of two reasonable extraction paths should I try?" — try
    the cheaper one first, fall back to the other; document.
  - "Should I include the optional macro-variation texture?" — yes
    by default if the cost is < 1 min more than the minimum.
  - "Should the harness use Python or TypeScript?" — pick.
  - "Should I extract this stretch-goal asset or defer it?" — defer
    if the core deliverables are at risk; otherwise extract.
  - "Should I make the marking shader procedural or authored?" —
    pick per the trade-off, justify in 1–2 sentences in the report.
  - "Should I rename this internal variable while I'm here?" — only
    if it's in a file you're already editing for pixel work.

---

## 3. How to raise (when it is genuinely §2)

When raising, send a single message containing:
  1. **Which §2 sub-clause** you are invoking (e.g. "§2.2 forced
     spec violation").
  2. **What you tried** before raising (concrete commands,
     attempted workarounds, outputs).
  3. **The exact decision you need** stated as a yes/no or
     pick-one-of-N. If the user can't reply with a single sentence,
     your raise isn't focused enough.
  4. **What you will do by default if no answer arrives within a
     stated window** (e.g. "If no answer in 1 hour, I'll proceed
     with option A and document").

Do not stack three questions into one raise. One raise = one
decision needed.

---

## 4. Time-box discipline

  - Investigation phase per iteration: ≤ 60 min before producing
    something concrete (extracted asset, harness skeleton, draft
    shader).
  - Single decision deliberation: ≤ 30 min. After 30 min, pick the
    option you currently prefer and proceed. You can revisit if
    measurements later show it was wrong.
  - "Just one more refinement" loops on shaders / tuning: ≤ 3
    iterations before running the harness and capturing numbers.
    Numbers are how you decide whether to keep tuning.
  - Total iteration wall-clock: aim ≤ 4 hours. If you're past 4
    hours and the deliverable is not in sight, that's a §2.1
    or §2.2 raise.

---

## 5. When you're stuck mid-decision

If you genuinely cannot pick between two reasonable options and
the time-box is up:
  1. Write down both options in the report draft.
  2. Pick the one that's cheaper to undo.
  3. Proceed.
  4. In the final report, note "Picked option A over B because
     [reason]; revisit in iteration N+1 if measurements suggest B
     was better."

This is NOT a §2 raise. This is normal forward motion under
uncertainty.

---

## 6. What still binds you (the unrelaxed mandates)

A short reminder list. Read the source documents in full at the
start of each iteration:

  - `rendering-overhaul-no-cosmetic-escape.md`:
    - §2 single-source architecture (you cannot regress it).
    - §2.6 forbidden architecture excuses.
    - §2.7 UE5 source is local — "impossible" banned.
    - §2.8 GPU 2 mandate.
    - §3.1 no honesty badges.
    - §3.2 no UI drift.
    - §3.3 no placeholder tolerance.
    - §3.4 no compile-only verification.
    - §3.6 no improving the deleted JPEG path.
    - §5 time budget (≥ 80 % pixels).
    - §8 forbidden phrases.
  - `rendering-100-percent-parity.md`:
    - §1 verification honesty.
    - §2 reimplementation mandate.
    - §0.3 numeric parity definitions.
  - `asset-extraction-pipeline.md`:
    - §1 local source paths.
    - §2 GPU 2 with `-graphicsadapter=2`.
    - §6 material translation rules.
    - §8 forbidden excuses.

If autonomy and a mandate appear to conflict, the mandate wins.
Autonomy is a license to act, not a license to deviate.

---

## 7. Report addition required by this contract

In the §7 (or equivalent) iteration report, add a new subsection:

### 7.X Autonomy decisions
A bulleted list of every non-trivial decision you made under §1
of this contract. Format:
  - **Decision area** — what you picked — one-line rationale.

Examples:
  - **Extraction tool** — Python editor scripting via
    `EditorAssetLibrary.export` — fastest path; commandlet C++ is
    overkill for 6 textures.
  - **Harness language** — Python (matches CARLA client) — avoids
    a Node-side CARLA shim.
  - **Markings** — hybrid procedural with grunge alpha overlay
    (option A from iteration spec) — preserves OpenDRIVE-derived
    positional accuracy; asphalt is the dominant gap.
  - **Skipped stretch goal** — wet-surface specular response —
    deferred to weather-fidelity iteration; the road feature row
    closes without it.

This subsection lets the user audit the autonomy at the end
without slowing you down during the iteration.

---

## 8. Failure mode this contract exists to kill

You spent significant wall-clock asking a chain of:
  > "Should I do A or B?"
  > "If A, should I include sub-feature X?"
  > "If sub-feature X, what threshold for Y?"

Each individual question was reasonable. The cumulative effect
was that the user had to make 5–10 decisions per iteration that
were entirely inside the spec's trade-off space. That is the bug.

Under this contract, those 5–10 decisions move into your
ownership. The user keeps the ones that matter (scope, blockers,
mandate violations, final acceptance) and gets out of the
implementation-detail loop.

---

## 9. The one-sentence summary

If the iteration spec did not literally name the question you are
about to ask, you are about to violate this contract — pick,
proceed, document. The user will read your decisions in §7.X and
push back if any was wrong; that is far cheaper for everyone than
a mid-iteration check-in.
