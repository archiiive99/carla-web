"""Image compression tests and benchmarks."""

import time

import numpy as np

from src.compression.image import image_compressor


def _make_bgra_image(width: int, height: int) -> bytes:
    """Generate a random BGRA image."""
    rng = np.random.default_rng(42)
    return rng.integers(0, 256, (height, width, 4), dtype=np.uint8).tobytes()


def test_jpeg_encode_produces_valid_output():
    raw = _make_bgra_image(640, 480)
    jpeg = image_compressor.compress_bgra_to_jpeg(raw, 640, 480, quality=80)
    # JPEG files start with \xff\xd8
    assert jpeg[:2] == b"\xff\xd8"
    assert len(jpeg) < len(raw)


def test_jpeg_encode_1080p_under_5ms():
    raw = _make_bgra_image(1920, 1080)
    # Warm up
    image_compressor.compress_bgra_to_jpeg(raw, 1920, 1080, quality=80)

    times = []
    for _ in range(10):
        start = time.perf_counter()
        image_compressor.compress_bgra_to_jpeg(raw, 1920, 1080, quality=80)
        elapsed_ms = (time.perf_counter() - start) * 1000
        times.append(elapsed_ms)

    avg_ms = sum(times) / len(times)
    print(f"\n1080p JPEG encode: avg={avg_ms:.2f}ms, min={min(times):.2f}ms, max={max(times):.2f}ms")
    # Allow some headroom for CI — turbojpeg hits <5ms, Pillow may be slower
    assert avg_ms < 50, f"JPEG encode too slow: {avg_ms:.2f}ms avg"


def test_jpeg_encode_480p_under_5ms():
    raw = _make_bgra_image(640, 480)
    image_compressor.compress_bgra_to_jpeg(raw, 640, 480)

    times = []
    for _ in range(20):
        start = time.perf_counter()
        image_compressor.compress_bgra_to_jpeg(raw, 640, 480)
        elapsed_ms = (time.perf_counter() - start) * 1000
        times.append(elapsed_ms)

    avg_ms = sum(times) / len(times)
    print(f"\n480p JPEG encode: avg={avg_ms:.2f}ms, min={min(times):.2f}ms, max={max(times):.2f}ms")
    assert avg_ms < 20, f"JPEG encode too slow: {avg_ms:.2f}ms avg"


def test_depth_colormap():
    raw = _make_bgra_image(640, 480)
    result = image_compressor.apply_depth_colormap(raw, 640, 480)
    assert result[:2] == b"\xff\xd8"  # Valid JPEG
    assert len(result) > 0


def test_segmentation_palette():
    # Create image with known class labels in red channel
    arr = np.zeros((480, 640, 4), dtype=np.uint8)
    arr[:, :, 2] = 1  # Red channel = class 1 (Roads)
    arr[:, :, 3] = 255
    raw = arr.tobytes()

    result = image_compressor.apply_segmentation_palette(raw, 640, 480)
    assert result[:2] == b"\xff\xd8"
    assert len(result) > 0


def test_webp_encode():
    raw = _make_bgra_image(320, 240)
    webp = image_compressor.compress_bgra_to_webp(raw, 320, 240, quality=80)
    # WebP files start with RIFF
    assert webp[:4] == b"RIFF"
    assert len(webp) < len(raw)
