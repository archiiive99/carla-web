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
# street_clear_midday: Town01 main north-south arterial, camera at driver eye
# height (~2.0 m above ground, ~0.0 m lateral offset from lane center),
# pitched -10° to frame the road surface filling the lower half of the image.
POSES: Dict[str, Pose] = {
    "street_clear_midday": Pose(
        x=100.0, y=133.0, z=2.0,
        yaw=90.0, pitch=-10.0, roll=0.0,
    ),
}


# ROI polygon (fraction-of-frame coordinates). Default center-bottom where
# the road fills the frame at pitch=-10° camera. Same for both reference
# and measured since both render at the same aspect + FOV.
ROAD_ROI = np.array([
    [0.20, 0.60],
    [0.80, 0.60],
    [0.80, 0.95],
    [0.20, 0.95],
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
    # Give the engine a couple of ticks to propagate weather before spawning
    # the sensor so the first frame reflects the request.
    for _ in range(4):
        try:
            world.tick()
        except RuntimeError:
            # async-mode server — no tick available, just sleep.
            time.sleep(0.1)

    blueprint_library = world.get_blueprint_library()
    cam_bp = blueprint_library.find("sensor.camera.rgb")
    cam_bp.set_attribute("image_size_x", str(CAPTURE_W))
    cam_bp.set_attribute("image_size_y", str(CAPTURE_H))
    cam_bp.set_attribute("fov", "90")
    cam_bp.set_attribute("sensor_tick", "0.0")

    transform = carla.Transform(
        carla.Location(x=pose.x, y=pose.y, z=pose.z),
        carla.Rotation(yaw=pose.yaw, pitch=pose.pitch, roll=pose.roll),
    )
    sensor = world.spawn_actor(cam_bp, transform)

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
        deadline = time.monotonic() + 6.0
        while not captured and time.monotonic() < deadline:
            try:
                world.tick()
            except RuntimeError:
                time.sleep(0.05)
        if not captured:
            raise RuntimeError(f"CARLA did not produce a frame within 6 s (pose={pose})")
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

        await page.goto(url, wait_until="networkidle", timeout=45_000)
        # Wait for the world scene canvas to exist AND for at least one frame
        # to paint past the initial clear. The __camPoseDebug hook set by
        # MainCameraController confirms the pose override landed.
        await page.wait_for_function(
            "() => document.querySelectorAll('canvas').length > 0",
            timeout=30_000,
        )
        # Grace period for glTFs and the PBR textures to load and shader to
        # compile. 4 s is generous but cheap vs a flaky capture.
        await page.wait_for_timeout(4_000)
        await page.wait_for_function(
            "() => (window.__camPoseDebug && window.__camPoseDebug.applied) === true",
            timeout=10_000,
        )
        # One more settle tick so the compositor renders with the final pose.
        await page.wait_for_timeout(500)

        # Screenshot the full viewport. The shared-scene canvas is fullscreen
        # fixed behind DOM chrome; the main viewport rect fills the middle of
        # the 1920×1080 frame and will dominate the ROI polygon.
        await page.screenshot(path=str(out_path), full_page=False, type="png")

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
