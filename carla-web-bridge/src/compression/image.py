"""High-performance image compression for CARLA sensor data.
from typing import Any

Color-pipeline notes (audited 2026-04-14 under the Agent C fidelity task):
- CARLA's RGB camera writes a BGRA buffer whose pixels are already
  gamma-encoded (UE5 tonemap + hardcoded render-target TargetGamma=2.4,
  see Unreal/.../SceneCaptureSensor.cpp:889 and PixelReader.cpp:98-99
  where SetLinearToGamma(true) is applied on readback). Do NOT apply
  additional gamma here — that's double-encoding.
- The browser decodes JPEGs as sRGB when no ICC profile is embedded.
  UE5's sRGB curve ≈ gamma 2.2 ≈ sRGB piecewise, so the conversion is
  approximately round-trip. `JPEG_EMBED_SRGB_ICC=1` embeds an explicit
  sRGB ICC profile (Pillow path only; TurboJPEG doesn't expose ICC).
- `JPEG_AUTO_EXPOSE=0` disables the server-side tonemap hack (used to
  brighten dusk/night frames but distorts daytime road colors when it
  engages). The audited bridge now defaults this to **off** so the wire
  bytes match CARLA's raw RGB output instead of an extra server-side
  tone adjustment.
- `JPEG_SUBSAMPLING=` overrides Pillow's chroma subsampling
  ("0"=4:4:4, "1"=4:2:2, "2"=4:2:0, default Pillow picks 4:2:0 below
  q=95). For road fidelity at q<90, 4:4:4 matters.
"""

from __future__ import annotations

import logging
from io import BytesIO

import numpy as np
from PIL import Image

from src.config import (
    JPEG_AUTO_EXPOSE,
    JPEG_BACKEND,
    JPEG_EMBED_SRGB_ICC,
    JPEG_SUBSAMPLING,
)

logger = logging.getLogger(__name__)

# src.config already resolves all four flags from os.getenv at import time,
# with the same normalisation (strip+lower for strings, "1/true/yes" parsing
# for bools, int coercion for subsampling). Reading os.environ a second time
# here was pure duplication and could diverge if the environment mutated
# between the two module loads.
_turbojpeg = None
_turbojpeg_available = False
_jpeg_backend: str = JPEG_BACKEND
_auto_expose_enabled: bool = JPEG_AUTO_EXPOSE
_embed_srgb_icc: bool = JPEG_EMBED_SRGB_ICC
# Pillow subsampling: 0=4:4:4, 1=4:2:2, 2=4:2:0. -1 means "Pillow default".
_jpeg_subsampling: int = JPEG_SUBSAMPLING

_turbojpeg_subsample = None

try:
    from turbojpeg import TurboJPEG, TJFLAG_FASTDCT, TJPF_BGRA

    _turbojpeg = TurboJPEG()
    _turbojpeg_available = True
    logger.info("TurboJPEG available")

    # Map JPEG_SUBSAMPLING to TurboJPEG enum. The Python `PyTurboJPEG`
    # binding exposes TJSAMP_444/TJSAMP_422/TJSAMP_420 as module-level ints
    # and accepts them via the `jpeg_subsample=` kwarg of encode(). If the
    # constants aren't available (older binding), leave it at None and let
    # the library pick its default (4:2:0).
    try:
        from turbojpeg import TJSAMP_444, TJSAMP_422, TJSAMP_420

        _turbojpeg_subsample = {
            0: TJSAMP_444,
            1: TJSAMP_422,
            2: TJSAMP_420,
        }.get(_jpeg_subsampling)
    except ImportError:
        _turbojpeg_subsample = None
except ImportError:
    logger.warning("TurboJPEG not available")

if (_jpeg_backend in {"auto", "turbojpeg"}) and _turbojpeg_available:
    logger.info("JPEG backend: turbojpeg")
else:
    if _jpeg_backend == "turbojpeg" and not _turbojpeg_available:
        logger.warning("JPEG backend requested turbojpeg but it is unavailable; using Pillow")
    logger.info("JPEG backend: pillow")

logger.info(
    "Image pipeline flags: auto_expose=%s embed_srgb_icc=%s subsampling=%s",
    _auto_expose_enabled, _embed_srgb_icc, _jpeg_subsampling,
)


def _sRGB_icc_bytes() -> bytes | None:
    """Return bytes of a tiny sRGB ICC profile, or None if Pillow can't build one.

    Pillow bundles `ImageCms` with `createProfile("sRGB")` which produces a
    standards-compliant sRGB profile. Cache at module scope.
    """
    try:
        from PIL import ImageCms

        prof = ImageCms.createProfile("sRGB")
        # Pillow's API changes across versions; try the modern one first.
        try:
            return ImageCms.ImageCmsProfile(prof).tobytes()
        except AttributeError:
            # Older Pillow: `createProfile` already returns a profile-like
            # object with `.tobytes()` via buffer.
            from io import BytesIO

            buf = BytesIO()
            ImageCms.ImageCmsProfile(prof).save(buf)
            return buf.getvalue()
    except Exception as exc:
        logger.debug("Could not build sRGB ICC profile: %s", exc)
        return None


_SRGB_ICC_BYTES: bytes | None = _sRGB_icc_bytes() if _embed_srgb_icc else None
if _embed_srgb_icc and _SRGB_ICC_BYTES is None:
    logger.info(
        "JPEG_EMBED_SRGB_ICC=1 but Pillow couldn't build an sRGB profile; "
        "falling back to the browser default (which assumes sRGB for untagged JPEGs)."
    )


def _inject_icc_app2(jpeg: bytes, icc: bytes) -> bytes:
    """Insert an ICC APP2 marker right after SOI (0xFFD8).

    JPEG allows APP segments anywhere after SOI; decoders keyed on the
    "ICC_PROFILE\\0" identifier will pick it up. The profile is split into
    chunks of ≤ 65_519 bytes (the APP2 payload limit minus 14 header
    bytes) across (current, total) indices. sRGB ICC is ~600 B so we
    virtually always fit in one chunk, but we handle multi-chunk in
    case a wide-gamut profile is plugged in later.

    Used to patch the TurboJPEG path, which doesn't expose ICC insertion
    through its Python `encode()` API.
    """
    if not jpeg.startswith(b"\xff\xd8"):
        return jpeg  # not a JPEG; refuse to corrupt

    max_chunk_payload = 65519 - 14  # 2-byte length + 12-byte id + 2-byte chunk hdr
    chunks: list[bytes] = [
        icc[i:i + max_chunk_payload] for i in range(0, len(icc), max_chunk_payload)
    ] or [b""]
    total = len(chunks)
    segments: list[bytes] = []
    for i, chunk in enumerate(chunks, start=1):
        seg_body = b"ICC_PROFILE\x00" + bytes([i, total]) + chunk
        seg_len = len(seg_body) + 2  # +2 for the length field itself
        segments.append(b"\xff\xe2" + seg_len.to_bytes(2, "big") + seg_body)

    # Insert right after SOI
    return jpeg[:2] + b"".join(segments) + jpeg[2:]


# Mirror of CARLA's official CityScapesPalette (see
# LibCarla/source/carla/image/CityScapesPalette.h — detail::CITYSCAPES_PALETTE_MAP).
# Any edit here must keep that file as the source of truth; drifting from it
# means the browser will show semantic classes with the wrong colors.
CITYSCAPES_PALETTE = np.array(
    [
        [0, 0, 0],         # 0  Unlabeled
        [128, 64, 128],    # 1  Road
        [244, 35, 232],    # 2  Sidewalk
        [70, 70, 70],      # 3  Building
        [102, 102, 156],   # 4  Wall
        [190, 153, 153],   # 5  Fence
        [153, 153, 153],   # 6  Pole
        [250, 170, 30],    # 7  Traffic light
        [220, 220, 0],     # 8  Traffic sign
        [107, 142, 35],    # 9  Vegetation
        [152, 251, 152],   # 10 Terrain
        [70, 130, 180],    # 11 Sky
        [220, 20, 60],     # 12 Pedestrian
        [255, 0, 0],       # 13 Rider
        [0, 0, 142],       # 14 Car
        [0, 0, 70],        # 15 Truck
        [0, 60, 100],      # 16 Bus
        [0, 80, 100],      # 17 Train
        [0, 0, 230],       # 18 Motorcycle
        [119, 11, 32],     # 19 Bicycle
        [110, 190, 160],   # 20 Static
        [170, 120, 50],    # 21 Dynamic
        [55, 90, 80],      # 22 Other
        [45, 60, 150],     # 23 Water
        [157, 234, 50],    # 24 RoadLines  (was clipped to class 22 — the
                           #    reason lane markings looked olive in the browser)
        [81, 0, 81],       # 25 Ground
        [150, 100, 100],   # 26 Bridge
        [230, 150, 140],   # 27 RailTrack
        [180, 165, 180],   # 28 GuardRail
        [180, 130, 70],    # 29 Rock
    ],
    dtype=np.uint8,
)


class ImageCompressor:
    """Compress BGRA sensor images to JPEG/WebP."""

    def __init__(self) -> None:
        self._cached_lut: np.ndarray | None = None
        self._cached_gain: float = 0.0

    def compress_bgra_to_jpeg(
        self, raw_data: bytes, width: int, height: int, quality: int = 80
    ) -> bytes:
        """BGRA raw buffer -> JPEG bytes."""
        if _jpeg_backend in {"auto", "turbojpeg"} and _turbojpeg_available:
            return self._turbojpeg_encode(raw_data, width, height, quality)
        return self._pillow_encode(raw_data, width, height, quality, "JPEG")

    def apply_depth_colormap(
        self, raw_data: bytes, width: int, height: int
    ) -> bytes:
        """Apply logarithmic depth visualization colormap, return JPEG."""
        arr = np.frombuffer(raw_data, dtype=np.uint8).reshape(height, width, 4)
        # CARLA depth: R + G*256 + B*65536 normalized to [0, 1]
        r = arr[:, :, 2].astype(np.float32)
        g = arr[:, :, 1].astype(np.float32)
        b = arr[:, :, 0].astype(np.float32)
        depth = (r + g * 256.0 + b * 65536.0) / (256.0 * 256.0 * 256.0 - 1.0)
        # Logarithmic scale for better near-range visibility
        depth = np.clip(np.log(depth * 1000.0 + 1.0) / np.log(1001.0), 0, 1)
        gray = (depth * 255).astype(np.uint8)
        # Apply a simple blue-to-red colormap
        rgb = np.stack([gray, 255 - gray, 128 - np.abs(gray.astype(np.int16) - 128).astype(np.uint8)], axis=-1)
        bgra = np.zeros((height, width, 4), dtype=np.uint8)
        bgra[:, :, 0] = rgb[:, :, 2]  # B
        bgra[:, :, 1] = rgb[:, :, 1]  # G
        bgra[:, :, 2] = rgb[:, :, 0]  # R
        bgra[:, :, 3] = 255
        return self.compress_bgra_to_jpeg(bgra.tobytes(), width, height, 85)

    def apply_segmentation_palette(
        self, raw_data: bytes, width: int, height: int
    ) -> bytes:
        """Apply CityScapes palette to semantic segmentation, return JPEG."""
        arr = np.frombuffer(raw_data, dtype=np.uint8).reshape(height, width, 4)
        # CARLA semantic seg: class index stored in R channel of BGRA buffer
        # (Tagger.cpp::GetActorLabelColor — R = CityObjectLabel, G|B = instance ID).
        labels = arr[:, :, 2]
        # Wrap like CARLA's CityScapesPalette::GetColor(tag):
        #   `tag % GetNumberOfTags()` — out-of-range tags map deterministically
        #   rather than all collapsing onto the last valid class.
        safe_labels = labels.astype(np.uint8) % np.uint8(len(CITYSCAPES_PALETTE))
        rgb = CITYSCAPES_PALETTE[safe_labels]
        bgra = np.zeros((height, width, 4), dtype=np.uint8)
        bgra[:, :, 0] = rgb[:, :, 2]
        bgra[:, :, 1] = rgb[:, :, 1]
        bgra[:, :, 2] = rgb[:, :, 0]
        bgra[:, :, 3] = 255
        return self.compress_bgra_to_jpeg(bgra.tobytes(), width, height, 90)

    # --- internal ------------------------------------------------------------

    def _turbojpeg_encode(
        self, raw_data: bytes, width: int, height: int, quality: int
    ) -> bytes:
        arr = np.frombuffer(raw_data, dtype=np.uint8).reshape(height, width, 4)
        arr = self._auto_expose_bgra(arr)
        kwargs: dict = {
            "quality": quality,
            "pixel_format": TJPF_BGRA,
            "flags": TJFLAG_FASTDCT,
        }
        if _turbojpeg_subsample is not None:
            kwargs["jpeg_subsample"] = _turbojpeg_subsample
        jpeg = _turbojpeg.encode(arr, **kwargs)
        # TurboJPEG's encode() has no ICC path. Post-inject the APP2
        # marker so the production default (turbojpeg) matches the
        # Pillow-path guarantee. Cheap: memcpy of ~600 B once per frame.
        if _SRGB_ICC_BYTES is not None:
            jpeg = _inject_icc_app2(jpeg, _SRGB_ICC_BYTES)
        return jpeg

    def _pillow_encode(
        self,
        raw_data: bytes,
        width: int,
        height: int,
        quality: int,
        fmt: str,
    ) -> bytes:
        # BytesIO + Image imports moved to module scope — re-importing
        # them every frame was a 20fps × N-sensor dict-lookup cost.
        arr = np.frombuffer(raw_data, dtype=np.uint8).reshape(height, width, 4)
        arr = self._auto_expose_bgra(arr)
        # BGRA -> RGB (alpha is dropped here; see test_pattern harness in
        # tools/compare_render.py for channel-order evidence). Mode param is
        # omitted — PIL infers "RGB" from the (H, W, 3) uint8 shape, and the
        # explicit form was deprecated in Pillow 11 / removed in Pillow 13.
        rgb = arr[:, :, [2, 1, 0]]
        img = Image.fromarray(rgb)
        buf = BytesIO()
        save_kwargs: dict = {"format": fmt, "quality": quality}
        if fmt == "JPEG":
            if _jpeg_subsampling in (0, 1, 2):
                save_kwargs["subsampling"] = _jpeg_subsampling
            if _SRGB_ICC_BYTES is not None:
                save_kwargs["icc_profile"] = _SRGB_ICC_BYTES
        img.save(buf, **save_kwargs)
        return buf.getvalue()

    def _auto_expose_bgra(self, arr: np.ndarray) -> np.ndarray:
        """Simulate auto-exposure for underexposed frames from UE5.

        Uses percentile-based exposure and a precomputed LUT for gamma
        correction. Only activates when the frame is genuinely underexposed
        (downsampled mean < 15/255). Optimized for 1280x720 at 20 FPS.

        NOTE: This is a *server-side* tonemap on top of UE5's own tonemap.
        It applies gain × `x**0.55` (effective 1/1.82 extra gamma). When it
        engages at dusk/night it recovers visibility, but when misfiring it
        crushes mid-tones on daytime frames. Set `JPEG_AUTO_EXPOSE=0` to
        disable for color-fidelity comparisons — the UE5 pipeline already
        exposes correctly under the clear-weather preset the bridge installs.
        """
        if not _auto_expose_enabled:
            return arr
        rgb = arr[:, :, :3]

        # Fast mean check on downsampled data (every 8th pixel)
        sample = rgb[::8, ::8, :]
        mean_lum = float(sample.mean())

        if mean_lum >= 15.0:
            return arr

        # Calculate exposure from downsampled luminance
        lum_sample = (
            0.299 * sample[:, :, 2].astype(np.float32)
            + 0.587 * sample[:, :, 1].astype(np.float32)
            + 0.114 * sample[:, :, 0].astype(np.float32)
        )
        p98 = max(float(np.percentile(lum_sample, 98)), 1.0)
        exposure_gain = min(200.0 / p98, 80.0)

        # Reuse cached LUT if gain is similar (avoids recompute every frame)
        if self._cached_lut is not None and abs(exposure_gain - self._cached_gain) < 2.0:
            lut = self._cached_lut
        else:
            lut = np.arange(256, dtype=np.float32) * exposure_gain / 255.0
            lut = np.clip(lut, 0, 1)
            lut = np.power(lut, 0.55) * 255.0
            lut = np.clip(lut, 0, 255).astype(np.uint8)
            self._cached_lut = lut
            self._cached_gain = exposure_gain

        # Apply LUT to all 3 color channels at once (fast vectorized op)
        result = arr.copy()
        result[:, :, :3] = lut[rgb]
        return result


# Singleton
image_compressor = ImageCompressor()
