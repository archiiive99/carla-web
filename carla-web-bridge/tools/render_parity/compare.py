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

    # Force clear/midday so the measured pair is under identical lighting.
    weather = carla.WeatherParameters(
        cloudiness=10.0,
        precipitation=0.0,
        precipitation_deposits=0.0,
        wind_intensity=5.0,
        sun_azimuth_angle=220.0,
        sun_altitude_angle=60.0,
        fog_density=0.0,
        fog_distance=0.0,
        fog_falloff=0.0,
        wetness=0.0,
    )
    world.set_weather(weather)
    # Give the engine ~2 s (10 @ 20Hz) to propagate weather + sun-position
    # changes through its render targets. Running CARLA is -benchmark
    # -fps=20; a shorter wait captures frames rendered during the weather
    # transition and bakes that into the reference.
    for _ in range(10):
        try:
            world.tick()
        except RuntimeError:
            time.sleep(0.1)

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

    # Drain ~8 frames with no listener so the render target converges on
    # the new camera pose + weather. Without this the first captured frame
    # is often the render target's previous contents (dark or stale).
    for _ in range(8):
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
        "roi_polygon_frac": ROAD_ROI.tolist(),
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


def draw_roi_overlay(out_path: Path, image_path: Path) -> None:
    from PIL import ImageDraw

    img = Image.open(image_path).convert("RGB")
    w, h = img.size
    draw = ImageDraw.Draw(img, "RGBA")
    pts = [(float(p[0]) * w, float(p[1]) * h) for p in ROAD_ROI]
    pts_closed = pts + [pts[0]]
    # Semi-transparent yellow polygon outline so the ROI is easy to eyeball.
    draw.line(pts_closed, fill=(255, 225, 0, 220), width=4)
    img.save(out_path)


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
    args = parser.parse_args()

    pose = POSES.get(args.pose)
    if pose is None:
        print(f"unknown pose: {args.pose}. known: {list(POSES)}", file=sys.stderr)
        return 2

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
    mask = polygon_mask(h, w, ROAD_ROI)
    metrics = {
        "psnr_db": psnr_masked(ref, meas, mask),
        "ssim": ssim_masked(ref, meas, mask),
        "delta_e_mean": mean_delta_e_masked(ref, meas, mask),
        "roi_pixel_count": int(mask.sum()),
    }
    print(
        f"[harness] metrics: PSNR={metrics['psnr_db']:.2f} dB  "
        f"SSIM={metrics['ssim']:.4f}  ΔE={metrics['delta_e_mean']:.2f}"
    )

    draw_roi_overlay(roi_overlay_path, meas_path)
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
