"""Verifies the sRGB ICC profile is actually embedded in JPEG output (§3.2.3).

JPEG ICC is carried in APP2 markers (0xFFE2) with the 12-byte identifier
"ICC_PROFILE\0" per Annex D of the ICC v4 spec. We binary-grep the output
bytes rather than trust the Pillow API — a library update silently
dropping the profile would be invisible at the API level.

Usage:
    python3 -m tools.color_fidelity.test_icc_embed
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import numpy as np

THIS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(THIS_DIR.parent.parent))


def _encode(backend: str, quality: int = 90) -> bytes:
    os.environ["JPEG_BACKEND"] = backend
    import importlib

    import src.compression.image as image_mod  # noqa: E402

    importlib.reload(image_mod)
    bgra = np.full((32, 32, 4), 128, dtype=np.uint8).tobytes()
    return image_mod.image_compressor.compress_bgra_to_jpeg(bgra, 32, 32, quality=quality)


def _has_icc(jpeg: bytes) -> tuple[bool, int]:
    """Returns (present, profile_bytes)."""
    # The APP2 segment is: 0xFFE2, 2-byte length, then "ICC_PROFILE\0"
    # followed by a 1-byte current chunk, 1-byte total chunks, then the
    # profile payload.
    idx = jpeg.find(b"ICC_PROFILE\x00")
    if idx < 0:
        return False, 0
    # Walk backwards to the APP2 marker just before the identifier
    if idx < 4 or jpeg[idx - 4:idx - 2] != b"\xff\xe2":
        return False, 0
    seg_len = int.from_bytes(jpeg[idx - 2:idx], "big")
    payload_len = seg_len - 2 - 12 - 2  # minus length bytes, "ICC_PROFILE\0", chunk hdr
    return True, max(0, payload_len)


def main() -> int:
    backends = ["pillow"]
    try:
        import turbojpeg  # noqa

        backends.append("turbojpeg")
    except ImportError:
        pass

    expected = {
        # Pillow path embeds via Pillow's icc_profile= kwarg.
        "pillow": True,
        # TurboJPEG path now post-injects the APP2 marker using
        # image.py::_inject_icc_app2 (covers the production default since
        # JPEG_BACKEND=auto picks turbojpeg when installed).
        "turbojpeg": True,
    }

    fails = 0
    print(f"{'backend':<10}{'embed_env':<12}{'has_ICC':<8}{'icc_bytes':<10}{'verdict':<8}")
    print("-" * 54)
    for be in backends:
        os.environ["JPEG_EMBED_SRGB_ICC"] = "1"
        jpg = _encode(be)
        present, n = _has_icc(jpg)
        ok = present == expected[be]
        if not ok:
            fails += 1
        print(f"{be:<10}{'1':<12}{str(present):<8}{n:<10}{'OK' if ok else 'FAIL':<8}")

        # Toggle off — Pillow path must now NOT embed; TurboJPEG stays off.
        os.environ["JPEG_EMBED_SRGB_ICC"] = "0"
        jpg_off = _encode(be)
        present_off, n_off = _has_icc(jpg_off)
        ok_off = (not present_off)
        if not ok_off:
            fails += 1
        print(f"{be:<10}{'0':<12}{str(present_off):<8}{n_off:<10}"
              f"{'OK' if ok_off else 'FAIL':<8}")

    print(f"\nICC-EMBED TEST: {'OK' if fails == 0 else 'FAIL'} ({fails} failures)")
    # Reset to default
    os.environ["JPEG_EMBED_SRGB_ICC"] = "1"
    return 0 if fails == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
