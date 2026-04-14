# Agent C — Camera Color-Space & Gamma Fidelity Audit

> This is a hard contract. You own the server-side color path from
> CARLA's raw sensor output to the JPEG bytes on the wire. You do NOT
> own the client-side renderer (the rendering agent has that), nor the
> worker/queue plumbing (Agent A), nor the session manager (Agent B),
> nor the frame-rate control loop (Agent D).
>
> Your deliverable is numbers. "Looks better" is not a measurement.

---

## 0. Ownership and forbidden edits

### 0.1 Files you own
  - `carla-web-bridge/src/compression/image.py` — ALL of it.
  - `carla-web-bridge/tools/compare_render.py` — extend as needed.
  - You may add helper modules under `tools/` (e.g.
    `tools/color_fidelity/`).
  - In `carla-web-bridge/src/realtime_session.py`, you may edit
    EXACTLY the `attributes` dict of the default camera spawn (lines
    ~140–160, the keys `image_size_x`, `image_size_y`, `fov`,
    `sensor_tick`, `enable_postprocess_effects`, `gamma`). No other
    line. Coordinate with Agent B before touching.
  - You may add/tune JPEG-related constants in `src/config.py`
    (`JPEG_QUALITY`, new chroma-subsampling knob, etc.).

### 0.2 Files you may NOT edit
  - `src/sensor_manager.py` — Agent A. Even though you change what
    encoders do, you do not change where/when they are called.
  - `src/ws_broadcaster.py` — Agent A.
  - `src/routes/*` — read-only.
  - Frontend, Unreal code, CARLA plugin code — read-only. (You MAY
    read CARLA plugin source to understand the `gamma` attribute
    semantics; you do not edit it.)

### 0.3 Non-goals
  - Changing the wire protocol.
  - Switching away from JPEG to another codec is IN SCOPE for
    comparison (numbers) but OUT of scope for final implementation
    unless the user explicitly approves after seeing your numbers.
    Your deliverable includes the comparison; the switch is a
    separate decision.
  - Client-side color correction. Your goal is that the server
    sends correct pixels; the client agent ensures it displays
    them correctly.

---

## 1. The full color path under audit

```
 Unreal Engine 5
   - Lit scene rendering
   - Post-process (tonemap, exposure, color grading, bloom)
   - Scene color output is (typically) linear RGB prior to tonemap;
     after tonemap it's display-referred (nonlinear, sRGB-ish).
        |
        v
 CARLA SceneCaptureComponent on sensor.camera.rgb
   - Blueprint attribute `gamma` is applied somewhere in the capture
     chain. Your job includes confirming WHERE and WHAT it does.
   - Output: raw BGRA8 byte buffer, `image.raw_data`.
        |
        v
 Python API -> bytes(data.raw_data)
   - Byte order: BGRA (4 bytes per pixel: blue, green, red, alpha).
   - Color space: UNCONFIRMED — this is what you must determine.
        |
        v
 src/compression/image.py::compress_bgra_to_jpeg(raw, w, h, quality)
   - Channel reorder BGRA -> RGB (drop alpha).
   - JPEG encoder (TurboJPEG / Pillow / cv2?) compresses.
   - Chroma subsampling: default?
   - ICC profile attached?: probably not (default Pillow/turbojpeg behavior).
        |
        v
 WebSocket binary frame
        |
        v
 Browser <img>/<canvas> / three.js texture
   - If no embedded ICC profile: browser ASSUMES sRGB.
   - Texture sampling in three.js: SRGBColorSpace or LinearSRGBColorSpace
     depending on how the frontend sets it.
   - Shader output composited into the canvas.
```

Every arrow is a place color can shift. Your audit quantifies the
shift at each arrow against a reference (the Unreal editor view or
CARLA's own native python screenshot).

---

## 2. Required investigation — before any code change

### 2.1 CARLA `gamma` attribute semantics

Tasks:
  1. Locate the CARLA plugin source that consumes the `gamma`
     blueprint attribute for `sensor.camera.rgb`. Candidate search
     starting points:
     - `Unreal/CarlaUnreal/Plugins/Carla/Source/Carla/Sensor/`
     - search for `"gamma"` inside the Sensor directory.
  2. Identify the exact place where the attribute value becomes a
     render-state. Is it:
     - applied to the SceneCaptureComponent's post-process
       settings?
     - used as an inverse power applied to scene color before
       readback?
     - fed into a material instance parameter?
  3. Write the finding into your report with file path and line
     range. Cite, don't paraphrase.

### 2.2 Current output color space of `image.raw_data`

Tasks:
  1. Check whether the raw bytes coming out of CARLA are already
     sRGB-encoded (typical for display-referred render output) or
     linear (requires gamma encoding before display).
  2. You will confirm via measurement, not documentation alone:
     - Spawn a camera in front of a known reference: the CARLA
       world contains textured surfaces whose expected color
       is derivable (e.g. the road lane markings painted white,
       which should read as near-white on a sunny day).
     - Capture BGRA bytes, compute the mean of the marking pixels
       in the 3 channels.
     - Compare to the Unreal editor viewport screenshot of the
       same frame (disable in-editor post-process if necessary
       to factor out editor-only transforms).

### 2.3 `compress_bgra_to_jpeg` byte path

Read the function and characterize EACH of these in the report:
  1. Which library encodes the JPEG? (import statements.)
  2. How is BGRA→RGB performed? (NumPy slice? swapaxes? manual?)
  3. Is alpha dropped silently? Is alpha ever non-255 in CARLA's
    output (should not be — confirm with a sample)?
  4. What chroma subsampling is used by default?
  5. Is an ICC profile embedded?
  6. What JPEG quality value is being used? (`JPEG_QUALITY` from
    `config.py`.)

---

## 3. Bugs / required fixes

### 3.1 Bug C1 — gamma double-application

#### 3.1.1 Failure mode
The `gamma="2.2"` attribute on the RGB camera (from
`realtime_session.py:~153`) is applied in CARLA's capture. If UE5's
scene capture output is already sRGB-encoded, applying another
2.2 power function on top crushes mid-tones and lifts blacks: the
scene reads as flat/washed.

#### 3.1.2 Evidence collection
Capture matched images at gamma ∈ {1.0, 2.2, 2.4, "omit"}:
  - Same camera pose.
  - Same weather (use the `CLEAR_DAYTIME_WEATHER` set by
    `realtime_session.py` — coordinate timing with Agent B so
    state is stable).
  - Same time.

For each, capture BOTH:
  - The JPEG that the bridge actually sends (decode for pixel
    compare).
  - The CARLA native python client's save of the same frame at
    the same gamma setting (write a tiny script that uses
    `carla.Client()`, spawns a camera, listens, and saves raw
    BGRA → PNG without JPEG).

Compute against the Unreal editor screenshot reference (taken with
post-process disabled or at default) for each:
  - PSNR
  - SSIM
  - Per-channel mean error
  - Mean ΔE (CIE Lab)

#### 3.1.3 Decision rule
  - Whichever gamma value minimizes ΔE on a neutral test region
    (road surface sample) while also keeping PSNR ≥ 32 dB → pick.
  - Update `realtime_session.py:~153` to that value. Coordinate
    with Agent B (do NOT edit any other line in that file).
  - If the correct answer is "omit gamma entirely", remove the key
    from the attributes dict.

#### 3.1.4 Report the finding
Include a 4-row table in the report: gamma value, PSNR, SSIM, ΔE
(median over ROI), qualitative notes.

---

### 3.2 Bug C2 — BGRA→JPEG conversion fidelity

Investigate each, fix any issue found:

#### 3.2.1 Channel order correctness
Create a test image with a single known pixel value (e.g. pure red
`(255, 0, 0, 255)` in RGBA memory layout → BGRA stored as
`(0, 0, 255, 255)`). Feed it through `compress_bgra_to_jpeg`, decode
the JPEG, confirm the output pixel is (255, 0, 0) RGB. Repeat for
green, blue, and a mid-gray (128, 128, 128).

If any swap is wrong, fix it. Add a unit test at
`tools/color_fidelity/test_channel_order.py`.

#### 3.2.2 Alpha handling
Confirm alpha is dropped and not accidentally multiplied into RGB
(a premultiplied-alpha bug darkens semi-transparent areas).

#### 3.2.3 JPEG ICC profile
Today almost certainly no profile is embedded. Decide:
  - Option A: Embed an sRGB ICC profile (guarantees correct browser
    rendering regardless of user color management).
  - Option B: Document reliance on browser default-sRGB assumption
    AND verify it on the target browser (Chrome, Firefox, Safari).

Implement one. If A, use Pillow's `icc_profile` argument or
TurboJPEG's equivalent; measure file size delta (~3 KB profile).

#### 3.2.4 Chroma subsampling
Default is typically 4:2:0 (YCbCr 4:2:0) which softens saturated
edges — bad for lane markings. Compare output at 4:2:0, 4:2:2,
4:4:4 at the current quality level. Report size/SSIM tradeoff as a
3-row table.

#### 3.2.5 JPEG quality
Run the same compare at quality ∈ {70, 80, 85, 90, 95}. Plot
SSIM vs. file size. Choose a value on the Pareto frontier and
justify.

---

### 3.3 Bug C3 — depth and segmentation transforms

#### 3.3.1 Depth encode/decode round-trip
CARLA's depth camera stores normalized depth in BGRA per the
official documentation:
```
normalized = (R + G*256 + B*65536) / (256^3 - 1)
meters = normalized * far_plane   # default far_plane = 1000m
```

Confirm by reading the CARLA plugin source for
`sensor.camera.depth` — cite the file and line.

Verify `apply_depth_colormap` in `src/compression/image.py`:
  1. Correct decode formula.
  2. Correct `far_plane` value in use.
  3. Colormap applied to LOG depth (better visualization) or LINEAR
    depth (simpler) — document which, justify.
  4. Round-trip test: synthesize a BGRA frame where the depth at
    each pixel is known, decode, compare against expected meters.
    Tolerance: < 0.5 % error.

#### 3.3.2 Segmentation palette parity with CARLA official
CARLA publishes an official semantic class → RGB table (22+ classes
for CARLA 0.9.x series, more in current). The palette in
`apply_segmentation_palette` must match it exactly.

Tasks:
  1. Locate the CARLA-authoritative palette (either in the CARLA
     plugin source or official docs — cite source).
  2. Diff against your current palette (byte-for-byte).
  3. Fix every mismatch. Add a test
     `tools/color_fidelity/test_seg_palette.py` that asserts the
     mapping matches for all class ids.

---

### 3.4 Bug C4 — codec comparison (research + report only)

Not a required code change, but a required investigation with
numbers:

Compare encoding time, output size, SSIM, and browser decode time
for the same matched reference frames across:
  - JPEG (current), quality values as chosen in §3.2.5.
  - WebP (lossy), matched quality.
  - AVIF (lossy), matched quality.
  - H.264 keyframes only (WebCodecs-consumable), one per frame.

For each codec:
  - Encode time (p50, p99) over 1000 frames on the bridge host.
  - Output bytes (p50, p99).
  - SSIM vs source.
  - Browser decode time (measure via a small test page using
    `performance.now()` around `decode()`).

Produce a Pareto plot (bytes vs SSIM) and a table. Recommend
whether the user should switch codecs. Do NOT switch codecs
unilaterally; the user decides based on your numbers.

---

## 4. Measurement harness — required deliverable

### 4.1 Tool: `tools/color_fidelity/run_audit.py`

CLI flags:
  - `--bridge-url ws://host:port` (default from env)
  - `--native-carla-host host:port`
  - `--camera-pose <x,y,z,pitch,yaw,roll>` (matched across paths)
  - `--frames N`
  - `--out <dir>`

What it does:
  1. Connects to the bridge WebSocket.
  2. Subscribes to the managed RGB camera (do not spawn a new one
     to avoid conflicting with Agent B's session manager).
  3. Saves N decoded frames.
  4. In parallel, uses `carla.Client()` directly to spawn a
     shadow camera at the SAME pose, capture N frames, save as PNG.
  5. For matched pairs, computes PSNR / SSIM / ΔE (over a
     user-specified ROI polygon, default = center 25 % of frame).
  6. Writes `report.md` with the tables specified in §3.1.4,
     §3.2.4, §3.2.5, §3.3.1, §3.3.2.

### 4.2 ROI specification for road surface
Use a normalized-coordinate ROI that is known to contain only road
surface at street-level camera positions — e.g. `[(0.3, 0.7),
(0.7, 0.7), (0.7, 0.9), (0.3, 0.9)]` as fractions of image
dimensions. Allow override via CLI.

### 4.3 ΔE implementation
Use CIE76 for simplicity (or CIE2000 if available via colormath /
skimage). State which one in the report.

---

## 5. Workflow

1. Investigation phase (§2). No code changes yet.
2. Build the measurement harness (§4).
3. Run baseline measurements on current unmodified code. Save as
   `baseline/`.
4. Apply fix for C1 (gamma). Rerun. Save as `post-c1/`.
5. Apply fixes for C2 (one subsection per commit). Rerun.
6. Apply fixes for C3. Rerun.
7. Run codec comparison (§3.4) once, save results.
8. Final report (§6).

---

## 6. Acceptance criteria

  [ ] CARLA `gamma` semantics documented with plugin source
      citation.
  [ ] Chosen gamma value: PSNR ≥ 32 dB vs. editor reference;
      ΔE-median on road ROI ≤ 3.0.
  [ ] `compress_bgra_to_jpeg` channel order verified by test.
  [ ] JPEG ICC profile decision implemented and documented.
  [ ] Chroma subsampling choice justified by size/SSIM table.
  [ ] JPEG quality choice justified by Pareto curve.
  [ ] Depth decode formula matches CARLA source (citation + round-
      trip test < 0.5 % error).
  [ ] Segmentation palette matches CARLA official (byte-for-byte
      test passes).
  [ ] Codec comparison table + Pareto plot produced.
  [ ] `run_audit.py` produces the full report with one command.

---

## 7. Report format

  1. Color-path diagram from §1 annotated with your measured
     values at each stage.
  2. Gamma decision table (§3.1.4).
  3. Channel-order test output.
  4. ICC profile decision rationale.
  5. Chroma subsampling table (3 rows).
  6. JPEG quality Pareto curve + chosen value.
  7. Depth round-trip test output.
  8. Segmentation palette diff (before) and match confirmation
     (after).
  9. Codec comparison Pareto + recommendation.
 10. A "limitations" section: things your audit does NOT cover
     (e.g. color under non-default weather, tonemap at extreme
     exposures). At least three.

Banned phrases (per `feedback_no_unreproducible` +
verification-honesty rules): "looks correct", "roughly matches",
"good enough for now", "not reproducible due to rendering
differences". Every claim is backed by a number in a table.
