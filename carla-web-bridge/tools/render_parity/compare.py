"""Render-parity harness MVP.

Captures matched-pair frames from CARLA UE5 (reference) vs. the browser's
shared-scene 3D viewport (measured), computes PSNR / SSIM / mean ΔE on a
road ROI, and writes a report under `reports/iter01/`.

The CARLA `sensor.camera.rgb` used here is a TEST-ONLY side channel — it
does NOT re-introduce the JPEG WebSocket stream that iteration 0 deleted.
The bridge still doesn't emit RGB camera frames to the browser; this script
talks to CARLA directly via the official Python API.

Usage:
    python tools/render_parity/compare.py \
        --pose street_clear_midday \
        --bridge-url http://localhost:58336 \
        --carla-host localhost --carla-port 58338 \
        --out ../reports/iter01 \
        [--label before|after]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict

import numpy as np
from PIL import Image

# --- Pose registry --------------------------------------------------------

@dataclass
class Pose:
    # All values in CARLA frame (X forward, Y right, Z up; degrees for rotation).
    x: float
    y: float
    z: float
    yaw: float
    pitch: float
    roll: float

    def as_query(self) -> str:
        return f"{self.x},{self.y},{self.z},{self.yaw},{self.pitch},{self.roll}"


# Pin the harness pose in code so iteration 01+ all measure the same point.
# street_clear_midday: Town01 spawn_point[0] + driver eye height +
# slight downward pitch so road surface fills the lower half of frame.
# Spawn[0] is on a clear straight section of main artery with lane
# markings, which makes it a good road-parity baseline target.
POSES: Dict[str, Pose] = {
    "street_clear_midday": Pose(
        x=118.9, y=55.8, z=1.8,
        yaw=180.0, pitch=-8.0, roll=0.0,
    ),
    # iter-13-revisit-pose-coverage: additional pinned poses for
    # multi-angle parity measurement.
    "birdseye_clear_midday": Pose(
        # Top-down at the iter-01 intersection. z=80m altitude, looking
        # straight down (pitch=-89). Tests road+overhead-asphalt at
        # different scale than the street-level pose.
        x=118.9, y=55.8, z=80.0,
        yaw=0.0, pitch=-89.0, roll=0.0,
    ),
    "chase_clear_midday": Pose(
        # Follow-cam: behind + above the street pose, slight downward
        # pitch. Approximates a typical third-person chase camera.
        x=121.5, y=55.8, z=4.0,
        yaw=180.0, pitch=-15.0, roll=0.0,
    ),
    "intersection_corner_midday": Pose(
        # Same intersection viewed from the corner — yaw+90 from the
        # street pose. Puts buildings + sidewalk + traffic light inside
        # the central frame (vs. the down-the-road framing of the
        # street pose).
        x=118.9, y=55.8, z=1.8,
        yaw=90.0, pitch=-8.0, roll=0.0,
    ),
    # iter-09: night pose. Same x/y/yaw as street_clear_midday but with
    # a sun_alt=-30 weather override (sun below horizon). Used to
    # measure the iter-09 NightStreetLights contribution.
    "street_clear_night": Pose(
        x=118.9, y=55.8, z=1.8,
        yaw=180.0, pitch=-8.0, roll=0.0,
    ),
}

# iter-09 — per-pose weather overrides. Pose name → dict of
# WeatherParameters fields to override. If a pose isn't present here
# the iter-01 default block (sun_alt=60, cloudiness=10, etc.) applies.
POSE_WEATHER_OVERRIDES: Dict[str, Dict[str, float]] = {
    "street_clear_night": {
        "sun_altitude_angle": -30.0,
    },
}


# ROI polygon (fraction-of-frame coordinates). Centered on the road
# surface itself at pose `street_clear_midday` — avoids the left
# tree-shadow band, the right-side sidewalk, and the upper strip that
# clips building walls. Picked after inspecting both reference and web
# frames from the post-engine-rebuild harness run.
ROAD_ROI = np.array([
    [0.28, 0.75],
    [0.72, 0.75],
    [0.72, 0.95],
    [0.28, 0.95],
], dtype=np.float32)

# Sky ROI — top half of the frame. Combined with a per-pixel brightness
# threshold (sky_brightness_mask) at metric-compute time so rooftops,
# distant trees, and overhead wires inside the polygon don't pollute
# what's intended to be a sky-only comparison.
SKY_ROI = np.array([
    [0.05, 0.02],
    [0.95, 0.02],
    [0.95, 0.50],
    [0.05, 0.50],
], dtype=np.float32)

# A pixel is "sky" if its luminance is above this fraction of the bright
# pixels in the polygon. Adapts to ambient: a midday capture's sky is
# bright (threshold lifts), a night capture's sky is dim (threshold
# drops). 0.55 means "anything above 55% of the polygon's 95th
# percentile luminance" — empirically separates sky from rooftops at the
# iter-01 test pose without per-pose tuning.
SKY_BRIGHTNESS_FRAC = 0.55

# Capture resolution. Matches the WebGL framebuffer (DPR-aware on the web
# side — Playwright viewport is set to this exact size, the browser canvas
# fills it).
CAPTURE_W = 1920
CAPTURE_H = 1080


# --- CARLA reference capture ---------------------------------------------

def capture_carla_reference(
    host: str,
    port: int,
    pose: Pose,
    out_path: Path,
) -> None:
    """Spawn a transient RGB camera at `pose`, capture one frame, destroy."""
    import carla  # type: ignore

    client = carla.Client(host, port)
    client.set_timeout(10.0)
    world = client.get_world()

    # Force clear/midday by default; iter-12 wetness + iter-09 night
    # overrides come through the pose object's .wetness attribute and
    # the POSE_WEATHER_OVERRIDES registry respectively.
    overrides = getattr(pose, "_weather_overrides", {}) or {}
    weather = carla.WeatherParameters(
        cloudiness=overrides.get("cloudiness", 10.0),
        precipitation=overrides.get("precipitation", 0.0),
        precipitation_deposits=overrides.get("precipitation_deposits", 0.0),
        wind_intensity=overrides.get("wind_intensity", 5.0),
        sun_azimuth_angle=overrides.get("sun_azimuth_angle", 220.0),
        sun_altitude_angle=overrides.get("sun_altitude_angle", 60.0),
        fog_density=overrides.get("fog_density", 0.0),
        fog_distance=overrides.get("fog_distance", 0.0),
        fog_falloff=overrides.get("fog_falloff", 0.0),
        wetness=overrides.get("wetness", getattr(pose, "wetness", 0.0)),
    )
    world.set_weather(weather)
    # iter-05 finding: the prior 10-tick wait was insufficient — histogram
    # auto-exposure (per the iter-01 AEM_Histogram fix) needs ~50 frames to
    # converge from a previous-weather render-target state, OR the
    # scene-capture sees the previous frame's render target before the new
    # SkyAtmosphere + DirectionalLight values propagate. Without the longer
    # wait, the captured reference is exposed for whatever the prior weather
    # was — at iter-05 measurement time the previous frame was night, so
    # the captured "midday" frame still showed streetlights and a black sky.
    # 60 ticks @ 20Hz = 3 s is the empirical floor for stable midday capture.
    for _ in range(60):
        try:
            world.tick()
        except RuntimeError:
            time.sleep(0.1)

    # iter-13-followon-harness-stabilize: clear any NPC vehicles spawned
    # at/near the camera world-coords. Without this the harness camera
    # spawns INSIDE an auto-spawned vehicle's hood, putting the hood
    # across the entire road ROI in the captured reference. iter-13's
    # measurement (PSNR=7) was contaminated by exactly this artifact.
    # Default radius 8 m covers a typical car length plus buffer; the
    # ROI starts at frame Y=0.75 which corresponds to a few meters in
    # front of the camera, so a 4-8 m clear radius is sufficient.
    npc_clear_radius_m = 8.0
    cleared_count = 0
    for actor in world.get_actors().filter("vehicle.*"):
        try:
            loc = actor.get_location()
        except Exception:
            continue
        dx = loc.x - pose.x
        dy = loc.y - pose.y
        dz = loc.z - pose.z
        if (dx * dx + dy * dy + dz * dz) ** 0.5 <= npc_clear_radius_m:
            try:
                if actor.destroy():
                    cleared_count += 1
            except Exception:
                pass
    if cleared_count > 0:
        print(f"[harness] cleared {cleared_count} NPC vehicle(s) within {npc_clear_radius_m}m of pose")
        # Tick a few frames to let the destruction propagate before the
        # camera spawn — otherwise the actor's mesh can still be in the
        # render target on the next captured frame.
        for _ in range(5):
            try:
                world.tick()
            except RuntimeError:
                time.sleep(0.05)

    blueprint_library = world.get_blueprint_library()
    cam_bp = blueprint_library.find("sensor.camera.rgb")
    cam_bp.set_attribute("image_size_x", str(CAPTURE_W))
    cam_bp.set_attribute("image_size_y", str(CAPTURE_H))
    cam_bp.set_attribute("fov", "90")
    cam_bp.set_attribute("sensor_tick", "0.0")
    # Postprocess must be on or the capture bypasses CARLA's tonemap and
    # comes out linear/dark. The default bridge camera also enables this.
    if cam_bp.has_attribute("enable_postprocess_effects"):
        cam_bp.set_attribute("enable_postprocess_effects", "true")

    transform = carla.Transform(
        carla.Location(x=pose.x, y=pose.y, z=pose.z),
        carla.Rotation(yaw=pose.yaw, pitch=pose.pitch, roll=pose.roll),
    )
    sensor = world.spawn_actor(cam_bp, transform)

    # iter-05 finding: 8 ticks isn't enough for histogram auto-exposure to
    # adapt after camera spawn; bumped to 30. With the upstream weather-wait
    # also bumped (60 ticks above), total post-set-weather wait before
    # capture is ~4.5 s which empirically lets histogram + render-target
    # converge from any previous weather state.
    for _ in range(30):
        try:
            world.tick()
        except RuntimeError:
            time.sleep(0.05)

    captured: list[np.ndarray] = []

    def on_frame(image: "carla.Image") -> None:
        # carla.Image is BGRA, row-major. Copy to np to decouple from the
        # callback's buffer lifetime.
        buf = np.frombuffer(image.raw_data, dtype=np.uint8)
        buf = buf.reshape((image.height, image.width, 4))
        # Drop alpha, swap BGR→RGB.
        captured.append(np.ascontiguousarray(buf[:, :, 2::-1]))

    sensor.listen(on_frame)
    try:
        # Drive the sim forward; the callback fires when a frame is ready.
        # Skip the first 2 frames and capture the 3rd for extra stability.
        deadline = time.monotonic() + 10.0
        while len(captured) < 3 and time.monotonic() < deadline:
            try:
                world.tick()
            except RuntimeError:
                time.sleep(0.05)
        if len(captured) < 1:
            raise RuntimeError(f"CARLA did not produce a frame within 10 s (pose={pose})")
        captured = captured[-1:]
    finally:
        sensor.stop()
        sensor.destroy()

    Image.fromarray(captured[0], mode="RGB").save(out_path)


# --- Web render capture (Playwright) -------------------------------------

async def capture_web_render(
    bridge_url: str,
    pose: Pose,
    out_path: Path,
) -> None:
    """Drive the browser to `pose` via ?camPose and screenshot the viewport."""
    from playwright.async_api import async_playwright

    query = f"view=threejs&camPose={pose.as_query()}"
    url = f"{bridge_url.rstrip('/')}/?{query}"

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--disable-dev-shm-usage",
                "--no-sandbox",
                # Force software swiftshader-like path if GPU unavailable;
                # otherwise the harness must not depend on GPU acceleration
                # being wired up inside headless Chromium.
                "--use-gl=swiftshader",
                "--enable-webgl",
            ],
        )
        context = await browser.new_context(
            viewport={"width": CAPTURE_W, "height": CAPTURE_H},
            device_scale_factor=1.0,
        )
        page = await context.new_page()

        page.on("console", lambda m: print(f"[web console {m.type}] {m.text}", file=sys.stderr))
        page.on("pageerror", lambda e: print(f"[web page error] {e}", file=sys.stderr))

        # `domcontentloaded` — the Vite dev server holds a WebSocket open
        # for HMR, so `networkidle` never fires. We wait explicitly for the
        # canvas + pose-applied debug hook below instead.
        #
        # Wipe localStorage first so the persisted cameraMode/viewMode
        # from a previous run doesn't override the URL-driven pose (a
        # follow-cam mode would ignore camPose until the user interacts).
        await page.goto(url, wait_until="domcontentloaded", timeout=45_000)
        await page.evaluate("() => localStorage.clear()")
        await page.reload(wait_until="domcontentloaded", timeout=45_000)
        await page.wait_for_function(
            "() => document.querySelectorAll('canvas').length > 0",
            timeout=30_000,
        )
        # Grace period for road geometry fetch, glTF building loads, PBR
        # textures, and shader program compile. Town01's road geometry
        # endpoint returns ~5MB of waypoints and the ~130 building GLBs
        # stream over HTTP; cold cache needs longer than this comment
        # originally assumed. 20 s observed to be enough for road-mesh +
        # buildings + PBR textures to all be on-frame.
        await page.wait_for_timeout(20_000)
        # Diagnostic: dump what ended up on window + URL params so the next
        # iteration knows whether the pose override even registered.
        diag = await page.evaluate(
            "() => ({"
            "url: location.href,"
            "search: location.search,"
            "camPoseDebug: window.__camPoseDebug || null,"
            "camMatchDebug: window.__camMatchDebug || null,"
            "canvasCount: document.querySelectorAll('canvas').length,"
            "cameraMode: (JSON.parse(localStorage.getItem('carla-ui-state')||'{}').cameraMode) || null"
            "})"
        )
        print(f"[harness][diag] {diag}", file=sys.stderr)
        try:
            await page.wait_for_function(
                "() => (window.__camPoseDebug && window.__camPoseDebug.applied) === true",
                timeout=10_000,
            )
        except Exception as e:
            print(f"[harness] camPose wait failed, capturing anyway: {e}", file=sys.stderr)
        # One more settle tick so the compositor renders with the final pose.
        await page.wait_for_timeout(1_500)

        # Extract just the main 3D viewport rect from the fullscreen
        # WorldCanvas. The canvas itself is 100vw × 100vh behind DOM
        # chrome; the main viewport div (aria-label="3D viewport") is
        # a smaller rect inside the center panel. Crop to that rect
        # and resize to CAPTURE_W × CAPTURE_H so the comparison PNG
        # represents ONLY the rendered 3D pixels, not the DOM frame.
        data_url = await page.evaluate(
            f"""
            () => new Promise((resolve, reject) => {{
              const canvases = document.querySelectorAll('canvas');
              if (canvases.length === 0) {{ reject('no canvas'); return; }}
              const src = canvases[0];
              const viewport = document.querySelector('[aria-label="3D viewport"]');
              if (!viewport) {{ reject('no 3D viewport div'); return; }}
              const vpRect = viewport.getBoundingClientRect();
              const srcRect = src.getBoundingClientRect();
              // Map vpRect into src's pixel space.
              const scaleX = src.width / srcRect.width;
              const scaleY = src.height / srcRect.height;
              const sx = (vpRect.left - srcRect.left) * scaleX;
              const sy = (vpRect.top - srcRect.top) * scaleY;
              const sw = vpRect.width * scaleX;
              const sh = vpRect.height * scaleY;
              requestAnimationFrame(() => {{
                try {{
                  const out = document.createElement('canvas');
                  out.width = {CAPTURE_W};
                  out.height = {CAPTURE_H};
                  const ctx = out.getContext('2d');
                  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, {CAPTURE_W}, {CAPTURE_H});
                  resolve(out.toDataURL('image/png'));
                }} catch (e) {{ reject(String(e)); }}
              }});
            }})
            """
        )
        import base64
        if not data_url.startswith("data:image/png;base64,"):
            raise RuntimeError(f"unexpected canvas dataURL prefix: {data_url[:40]}")
        png_bytes = base64.b64decode(data_url.split(",", 1)[1])
        out_path.write_bytes(png_bytes)

        await context.close()
        await browser.close()


# --- Metrics --------------------------------------------------------------

def polygon_mask(h: int, w: int, poly_frac: np.ndarray) -> np.ndarray:
    from PIL import ImageDraw

    img = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(img)
    pts = [(float(p[0]) * w, float(p[1]) * h) for p in poly_frac]
    draw.polygon(pts, fill=255)
    return np.asarray(img) > 0


def psnr_masked(a: np.ndarray, b: np.ndarray, mask: np.ndarray) -> float:
    a = a.astype(np.float64)
    b = b.astype(np.float64)
    diff = (a - b)[mask]
    mse = float(np.mean(diff * diff)) if diff.size else float("nan")
    if mse <= 0:
        return float("inf")
    return 10.0 * np.log10((255.0 ** 2) / mse)


def ssim_masked(a: np.ndarray, b: np.ndarray, mask: np.ndarray) -> float:
    from skimage.metrics import structural_similarity as ssim

    # SSIM doesn't support explicit masks; clamp to the mask bbox so pixels
    # outside the ROI don't contribute.
    ys, xs = np.where(mask)
    if ys.size == 0:
        return float("nan")
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    a_crop = a[y0:y1, x0:x1]
    b_crop = b[y0:y1, x0:x1]
    # Use the default Wang-Bovik-Sheikh-Simoncelli SSIM at data_range=255,
    # averaged across channels.
    return float(ssim(a_crop, b_crop, data_range=255, channel_axis=2))


def mean_delta_e_masked(a: np.ndarray, b: np.ndarray, mask: np.ndarray) -> float:
    # CIE76 ΔE: sqrt(ΔL² + Δa² + Δb²). Per spec §5 CIE76 is fine for MVP.
    from skimage.color import rgb2lab

    lab_a = rgb2lab(a / 255.0)
    lab_b = rgb2lab(b / 255.0)
    diff = (lab_a - lab_b)[mask]
    if diff.size == 0:
        return float("nan")
    return float(np.sqrt((diff * diff).sum(axis=-1)).mean())


# --- Report ---------------------------------------------------------------

def write_report(
    out_dir: Path,
    label: str,
    pose_name: str,
    pose: Pose,
    metrics: dict,
    refs: dict,
) -> None:
    report_json = out_dir / f"report_{label}.json"
    report_md = out_dir / f"report_{label}.md"
    data = {
        "label": label,
        "pose": {"name": pose_name, **asdict(pose)},
        "metrics": metrics,
        "images": refs,
        "capture": {"width": CAPTURE_W, "height": CAPTURE_H},
        "roi_polygon_frac": (SKY_ROI if metrics.get("roi_mode") == "sky" else ROAD_ROI).tolist(),
    }
    report_json.write_text(json.dumps(data, indent=2))

    lines = [
        f"# Render parity — {label.upper()}",
        "",
        f"**Pose**: `{pose_name}` = (x={pose.x}, y={pose.y}, z={pose.z}, yaw={pose.yaw}°, pitch={pose.pitch}°, roll={pose.roll}°)",
        f"**Capture**: {CAPTURE_W}×{CAPTURE_H} PNG; ROI polygon covers road surface.",
        "",
        "## Metrics (road ROI)",
        "",
        "| Metric | Value |",
        "|---|---|",
        f"| PSNR (dB) | {metrics['psnr_db']:.2f} |",
        f"| SSIM | {metrics['ssim']:.4f} |",
        f"| Mean ΔE (CIE76) | {metrics['delta_e_mean']:.2f} |",
        "",
        "## Images",
        "",
        f"- Reference (CARLA UE5 `sensor.camera.rgb`): `{refs['reference']}`",
        f"- Measured (web shared-scene 3D viewport): `{refs['measured']}`",
        f"- ROI overlay visualization: `{refs['roi_overlay']}`",
        "",
    ]
    report_md.write_text("\n".join(lines))


def draw_roi_overlay(out_path: Path, image_path: Path, roi: np.ndarray) -> None:
    from PIL import ImageDraw

    img = Image.open(image_path).convert("RGB")
    w, h = img.size
    draw = ImageDraw.Draw(img, "RGBA")
    pts = [(float(p[0]) * w, float(p[1]) * h) for p in roi]
    pts_closed = pts + [pts[0]]
    # Semi-transparent yellow polygon outline so the ROI is easy to eyeball.
    draw.line(pts_closed, fill=(255, 225, 0, 220), width=4)
    img.save(out_path)


def sky_brightness_mask(ref: np.ndarray, polygon_mask_arr: np.ndarray) -> np.ndarray:
    """Within the polygon mask, keep only pixels whose luminance is above
    SKY_BRIGHTNESS_FRAC * (95th-percentile luminance inside the polygon).
    Adapts to scene ambient — at midday the sky is bright and the threshold
    lifts; at night the sky is dim and the threshold drops with it. Removes
    rooftops/foliage from a too-large rectangular sky polygon.
    """
    luma = (0.299 * ref[..., 0] + 0.587 * ref[..., 1] + 0.114 * ref[..., 2])
    inside = luma[polygon_mask_arr]
    if inside.size == 0:
        return polygon_mask_arr
    p95 = float(np.percentile(inside, 95))
    threshold = SKY_BRIGHTNESS_FRAC * p95
    return polygon_mask_arr & (luma >= threshold)


# --- Main -----------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pose", default="street_clear_midday")
    parser.add_argument("--bridge-url", default="http://localhost:58336")
    parser.add_argument("--carla-host", default="localhost")
    parser.add_argument("--carla-port", type=int, default=58338)
    parser.add_argument("--out", default="reports/iter01", type=Path)
    parser.add_argument(
        "--label",
        default="run",
        help="Filename suffix for before/after runs (e.g. `before`, `after`).",
    )
    parser.add_argument(
        "--roi",
        default="road",
        choices=("road", "sky"),
        help="ROI to compute metrics over. road=lower-center polygon (default, "
             "iter-01 baseline); sky=upper rectangle + brightness threshold "
             "(iter-05-revisit-roi-sky, for sky-parity iterations).",
    )
    parser.add_argument(
        "--weather-wetness",
        type=float,
        default=0.0,
        help="iter-12 — override the CARLA weather wetness param [0..100]. "
             "Bridge picks this up and broadcasts it; the web RoadMesh's "
             "uWetness uniform drives lower roughness (wet asphalt).",
    )
    args = parser.parse_args()

    pose = POSES.get(args.pose)
    if pose is None:
        print(f"unknown pose: {args.pose}. known: {list(POSES)}", file=sys.stderr)
        return 2
    # iter-12: stash the wetness override on the pose so capture_carla_reference
    # can read it without a second arg-passing path.
    setattr(pose, "wetness", float(args.weather_wetness))
    # iter-09: stash per-pose weather overrides similarly.
    setattr(pose, "_weather_overrides", POSE_WEATHER_OVERRIDES.get(args.pose, {}))

    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    ref_path = out_dir / f"ue5_reference_{args.label}.png"
    meas_path = out_dir / f"web_render_{args.label}.png"
    roi_overlay_path = out_dir / f"roi_overlay_{args.label}.png"

    print(f"[harness] capturing CARLA reference at pose {args.pose}")
    capture_carla_reference(args.carla_host, args.carla_port, pose, ref_path)
    print(f"[harness] wrote {ref_path}")

    print(f"[harness] capturing web render at {args.bridge_url}")
    asyncio.run(capture_web_render(args.bridge_url, pose, meas_path))
    print(f"[harness] wrote {meas_path}")

    ref = np.asarray(Image.open(ref_path).convert("RGB"))
    meas = np.asarray(Image.open(meas_path).convert("RGB"))
    if ref.shape != meas.shape:
        # Resize measured to reference resolution if the web capture landed
        # at a slightly different size (e.g. device-scale factor). Prefer
        # lanczos for the downsample path.
        meas_img = Image.fromarray(meas).resize((ref.shape[1], ref.shape[0]), Image.LANCZOS)
        meas = np.asarray(meas_img)

    h, w = ref.shape[:2]
    roi_polygon = SKY_ROI if args.roi == "sky" else ROAD_ROI
    mask = polygon_mask(h, w, roi_polygon)
    if args.roi == "sky":
        # Restrict to actual sky pixels (above ambient-adaptive threshold).
        mask = sky_brightness_mask(ref, mask)
    metrics = {
        "psnr_db": psnr_masked(ref, meas, mask),
        "ssim": ssim_masked(ref, meas, mask),
        "delta_e_mean": mean_delta_e_masked(ref, meas, mask),
        "roi_pixel_count": int(mask.sum()),
        "roi_mode": args.roi,
    }
    print(
        f"[harness] metrics ({args.roi} ROI): PSNR={metrics['psnr_db']:.2f} dB  "
        f"SSIM={metrics['ssim']:.4f}  ΔE={metrics['delta_e_mean']:.2f}  "
        f"npix={metrics['roi_pixel_count']}"
    )

    draw_roi_overlay(roi_overlay_path, meas_path, roi_polygon)
    write_report(
        out_dir,
        args.label,
        args.pose,
        pose,
        metrics,
        {
            "reference": ref_path.name,
            "measured": meas_path.name,
            "roi_overlay": roi_overlay_path.name,
        },
    )
    print(f"[harness] report: {out_dir}/report_{args.label}.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
