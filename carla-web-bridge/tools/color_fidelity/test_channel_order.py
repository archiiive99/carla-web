"""Channel-order + alpha-handling tests for compress_bgra_to_jpeg.

Per §3.2.1 of the audit spec. Runs both backends (TurboJPEG and Pillow)
when available and asserts decoded pixels match the expected RGB.

Usage:
    python3 -m tools.color_fidelity.test_channel_order    # quiet, exit 0/1
    python3 tools/color_fidelity/test_channel_order.py -v # verbose
"""
from __future__ import annotations

import os
import sys
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image

THIS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(THIS_DIR.parent.parent))

from tools.color_fidelity.color import delta_e_76  # noqa: E402


# BGRA memory layout: (B, G, R, A). This mirrors exactly what CARLA's
# raw_data hands us.
CASES: dict[str, tuple[tuple[int, int, int, int], tuple[int, int, int]]] = {
    "red":        ((0, 0, 255, 255), (255, 0, 0)),
    "green":      ((0, 255, 0, 255), (0, 255, 0)),
    "blue":       ((255, 0, 0, 255), (0, 0, 255)),
    "mid_gray":   ((128, 128, 128, 255), (128, 128, 128)),
    "black":      ((0, 0, 0, 255), (0, 0, 0)),
    "white":      ((255, 255, 255, 255), (255, 255, 255)),
    # Alpha = 0 must NOT bleed into RGB (no premultiplication).
    "alpha_zero": ((50, 100, 200, 0), (200, 100, 50)),
    # Distinct non-neutral triple so a swap shows up loudly.
    "mixed":      ((40, 80, 160, 255), (160, 80, 40)),
}


def _make_bgra(bgra_pixel: tuple[int, int, int, int], w: int = 16, h: int = 16) -> bytes:
    arr = np.tile(np.array(bgra_pixel, dtype=np.uint8), (h, w, 1))
    return arr.tobytes()


def _decode(jpg: bytes) -> np.ndarray:
    return np.asarray(Image.open(BytesIO(jpg)).convert("RGB"), dtype=np.uint8)


def run_backend(backend: str, quality: int, verbose: bool) -> tuple[int, int]:
    """Returns (passed, total) for one backend."""
    # Reload with the requested backend picked up via JPEG_BACKEND env.
    os.environ["JPEG_BACKEND"] = backend
    import importlib

    import src.compression.image as image_mod  # noqa: E402

    importlib.reload(image_mod)
    compressor = image_mod.image_compressor

    W, H = 16, 16
    passed = 0
    for name, (bgra, expected_rgb) in CASES.items():
        raw = _make_bgra(bgra, W, H)
        jpg = compressor.compress_bgra_to_jpeg(raw, W, H, quality=quality)
        decoded = _decode(jpg)
        center = tuple(int(x) for x in decoded[H // 2, W // 2])
        expected = tuple(expected_rgb)
        de = float(delta_e_76(
            np.array(expected, dtype=np.uint8).reshape(1, 1, 3),
            np.array(center, dtype=np.uint8).reshape(1, 1, 3),
        )[0, 0])
        # At q=95 on a solid patch we expect ΔE < 3.
        ok = de < 3.0
        if ok:
            passed += 1
        status = "OK  " if ok else "FAIL"
        if verbose or not ok:
            print(f"[{backend:>9}] {status} {name:<11} BGRA={bgra!s:<22} "
                  f"expected_rgb={expected!s:<17} got={center!s:<17} ΔE={de:.2f}")
    return passed, len(CASES)


def main() -> int:
    verbose = "-v" in sys.argv or "--verbose" in sys.argv
    total_pass = 0
    total = 0
    backends = ["pillow"]
    try:
        import turbojpeg  # noqa

        backends.append("turbojpeg")
    except ImportError:
        print("# turbojpeg not installed — skipping turbojpeg backend")
    for backend in backends:
        p, n = run_backend(backend, quality=95, verbose=verbose)
        total_pass += p
        total += n
        print(f"[{backend}] {p}/{n} passed")
    ok = total_pass == total
    print(f"\nCHANNEL-ORDER TEST: {total_pass}/{total} {'OK' if ok else 'FAIL'}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
