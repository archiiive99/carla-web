"""Codec comparison harness — §3.4 of the audit spec.

Measures encode time, output size, and SSIM for JPEG / WebP / AVIF /
H.264-keyframe on the same reference frame over N trials. Returns a
Pareto table and (optionally) a CSV.

Notes:
- Encode time is measured in Python userland with time.perf_counter around
  the encode call. TurboJPEG is in-process; WebP/AVIF go through PIL;
  H.264 shells out to `ffmpeg` so encode time includes process overhead.
- Browser decode time is NOT measured here (would need a headless
  browser). Leave that to the frontend agent; we emit the bytes.

Usage:
    python3 -m tools.color_fidelity.codec_bench --frames 1000 --csv out.csv
    python3 -m tools.color_fidelity.codec_bench --input ref.png --frames 50
"""
from __future__ import annotations

import argparse
import csv
import shutil
import statistics
import subprocess
import sys
import tempfile
import time
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image

THIS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(THIS_DIR.parent.parent))

from tools.color_fidelity.metrics import ssim  # noqa: E402


def make_reference(w: int = 1280, h: int = 720, seed: int = 42) -> np.ndarray:
    """Synthetic road-ish frame with colored lane markings + sky."""
    rng = np.random.default_rng(seed)
    img = rng.integers(45, 75, size=(h, w, 3), dtype=np.uint8)
    # Sky band (top 25%)
    img[: h // 4, :, 0] = 135
    img[: h // 4, :, 1] = 185
    img[: h // 4, :, 2] = 225
    # Horizon gradient (next 10%)
    grad = np.linspace(135, 75, h // 10, dtype=np.uint8).reshape(-1, 1)
    img[h // 4:h // 4 + h // 10, :, 0] = grad
    img[h // 4:h // 4 + h // 10, :, 1] = np.linspace(185, 110, h // 10, dtype=np.uint8).reshape(-1, 1)
    img[h // 4:h // 4 + h // 10, :, 2] = np.linspace(225, 180, h // 10, dtype=np.uint8).reshape(-1, 1)
    # Yellow solid line
    y1 = int(h * 0.75)
    img[y1 - 2:y1 + 2, 50:-50, 0] = 255
    img[y1 - 2:y1 + 2, 50:-50, 1] = 210
    img[y1 - 2:y1 + 2, 50:-50, 2] = 30
    # White dashed center line
    y2 = int(h * 0.85)
    for x in range(50, w - 50, 80):
        img[y2 - 3:y2 + 3, x:x + 40, :] = 235
    # Red stop line
    y3 = int(h * 0.95)
    img[y3 - 4:y3 + 4, 100:-100, 0] = 200
    img[y3 - 4:y3 + 4, 100:-100, 1] = 20
    img[y3 - 4:y3 + 4, 100:-100, 2] = 20
    # Blue sign (upper-right)
    img[h // 20:h // 6, w - w // 8:w - 20, 0] = 30
    img[h // 20:h // 6, w - w // 8:w - 20, 1] = 90
    img[h // 20:h // 6, w - w // 8:w - 20, 2] = 220
    return img


def _pct(values: list[float], p: float) -> float:
    if not values:
        return float("nan")
    return float(np.percentile(values, p))


def bench_jpeg(img: np.ndarray, frames: int, quality: int, subsampling: int) -> dict:
    pil = Image.fromarray(img, "RGB")
    times_ns = []
    sizes = []
    last_bytes = b""
    for _ in range(frames):
        t0 = time.perf_counter_ns()
        buf = BytesIO()
        pil.save(buf, format="JPEG", quality=quality, subsampling=subsampling)
        t1 = time.perf_counter_ns()
        times_ns.append(t1 - t0)
        last_bytes = buf.getvalue()
        sizes.append(len(last_bytes))
    dec = np.asarray(Image.open(BytesIO(last_bytes)).convert("RGB"))
    return _finish("JPEG", f"q={quality} ss={subsampling}", times_ns, sizes, img, dec)


def bench_webp(img: np.ndarray, frames: int, quality: int) -> dict:
    pil = Image.fromarray(img, "RGB")
    times_ns = []
    sizes = []
    last_bytes = b""
    for _ in range(frames):
        t0 = time.perf_counter_ns()
        buf = BytesIO()
        pil.save(buf, format="WEBP", quality=quality, method=4)
        t1 = time.perf_counter_ns()
        times_ns.append(t1 - t0)
        last_bytes = buf.getvalue()
        sizes.append(len(last_bytes))
    dec = np.asarray(Image.open(BytesIO(last_bytes)).convert("RGB"))
    return _finish("WebP", f"q={quality}", times_ns, sizes, img, dec)


def bench_avif(img: np.ndarray, frames: int, quality: int) -> dict:
    pil = Image.fromarray(img, "RGB")
    times_ns = []
    sizes = []
    last_bytes = b""
    for _ in range(frames):
        t0 = time.perf_counter_ns()
        buf = BytesIO()
        # AVIF is slow, so we use the speed knob Pillow exposes.
        try:
            pil.save(buf, format="AVIF", quality=quality, speed=6)
        except Exception:
            pil.save(buf, format="AVIF", quality=quality)
        t1 = time.perf_counter_ns()
        times_ns.append(t1 - t0)
        last_bytes = buf.getvalue()
        sizes.append(len(last_bytes))
    dec = np.asarray(Image.open(BytesIO(last_bytes)).convert("RGB"))
    return _finish("AVIF", f"q={quality}", times_ns, sizes, img, dec)


def bench_h264_keyframe(img: np.ndarray, frames: int, crf: int) -> dict | None:
    if not shutil.which("ffmpeg"):
        print("# ffmpeg missing — skipping H.264 keyframe bench")
        return None
    h, w, _ = img.shape
    # Dump reference frame once as an intermediate PNG; re-run ffmpeg per
    # trial to measure single-frame encode latency.
    with tempfile.TemporaryDirectory() as td:
        in_path = Path(td) / "ref.png"
        out_path = Path(td) / "ref.h264"
        Image.fromarray(img, "RGB").save(in_path)
        times_ns = []
        sizes = []
        last_bytes = b""
        for _ in range(frames):
            t0 = time.perf_counter_ns()
            subprocess.run(
                [
                    "ffmpeg", "-y", "-loglevel", "error",
                    "-i", str(in_path),
                    "-frames:v", "1",
                    "-c:v", "libx264",
                    "-tune", "zerolatency",
                    "-preset", "ultrafast",
                    "-crf", str(crf),
                    "-x264-params", "keyint=1:scenecut=0",
                    "-f", "h264",
                    str(out_path),
                ],
                check=True,
            )
            t1 = time.perf_counter_ns()
            times_ns.append(t1 - t0)
            data = out_path.read_bytes()
            sizes.append(len(data))
            last_bytes = data
        # Decode back for SSIM comparison
        decoded_png = Path(td) / "decoded.png"
        subprocess.run(
            [
                "ffmpeg", "-y", "-loglevel", "error",
                "-f", "h264", "-i", str(out_path),
                "-frames:v", "1", str(decoded_png),
            ],
            check=True,
        )
        dec = np.asarray(Image.open(decoded_png).convert("RGB"))
        # The decoded image may have been padded — crop to source shape.
        dec = dec[:h, :w]
    return _finish("H.264-key", f"crf={crf}", times_ns, sizes, img, dec)


def _finish(codec: str, variant: str, times_ns: list[int], sizes: list[int],
            src: np.ndarray, dec: np.ndarray) -> dict:
    times_ms = [t / 1_000_000 for t in times_ns]
    sim = ssim(src, dec) if src.shape == dec.shape else float("nan")
    return {
        "codec": codec,
        "variant": variant,
        "n": len(times_ms),
        "enc_ms_p50": _pct(times_ms, 50),
        "enc_ms_p99": _pct(times_ms, 99),
        "bytes_p50": int(_pct(sizes, 50)),
        "bytes_p99": int(_pct(sizes, 99)),
        "ssim": sim,
    }


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="codec_bench")
    p.add_argument("--frames", type=int, default=100,
                   help="trials per (codec, variant) — spec asks 1000, "
                        "but 100 is enough for p50 stability during iteration")
    p.add_argument("--input", default=None, help="optional reference PNG")
    p.add_argument("--csv", default=None)
    p.add_argument("--quick", action="store_true",
                   help="run a tiny sweep; skip H.264 (ffmpeg fork overhead)")
    args = p.parse_args(argv)

    if args.input:
        src = np.asarray(Image.open(args.input).convert("RGB"))
    else:
        src = make_reference()

    rows: list[dict] = []
    print(f"# reference: {src.shape} frames={args.frames}")

    # JPEG sweep — quality Pareto point at two subsampling modes
    for q in (70, 80, 85, 90, 95):
        rows.append(bench_jpeg(src, args.frames, q, subsampling=2))  # 4:2:0
        rows.append(bench_jpeg(src, args.frames, q, subsampling=0))  # 4:4:4
    # WebP at matched-quality points
    for q in (70, 80, 85, 90, 95):
        rows.append(bench_webp(src, args.frames, q))
    # AVIF — typically 2-4× smaller at the same SSIM, at 10-20× the encode cost
    for q in (50, 65, 80):
        rows.append(bench_avif(src, args.frames, q))
    # H.264 keyframe — CRF sweep. Skip in --quick.
    if not args.quick:
        for crf in (18, 22, 28):
            row = bench_h264_keyframe(src, max(5, args.frames // 20), crf)
            if row is not None:
                rows.append(row)

    print(f"{'codec':<10} {'variant':<12} {'n':>4} "
          f"{'enc_p50_ms':>11} {'enc_p99_ms':>11} "
          f"{'B_p50':>9} {'B_p99':>9} {'SSIM':>7}")
    for r in rows:
        print(f"{r['codec']:<10} {r['variant']:<12} {r['n']:>4} "
              f"{r['enc_ms_p50']:>11.3f} {r['enc_ms_p99']:>11.3f} "
              f"{r['bytes_p50']:>9} {r['bytes_p99']:>9} {r['ssim']:>7.4f}")

    if args.csv:
        out = Path(args.csv)
        with out.open("w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)
        print(f"\nwrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
