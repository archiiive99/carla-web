"""High-performance image compression for CARLA sensor data."""

from __future__ import annotations

import logging

import numpy as np

logger = logging.getLogger(__name__)

_turbojpeg = None
_turbojpeg_available = False

try:
    from turbojpeg import TurboJPEG, TJFLAG_FASTDCT, TJPF_BGRA

    _turbojpeg = TurboJPEG()
    _turbojpeg_available = True
    logger.info("TurboJPEG available — using hardware-accelerated JPEG encoding")
except ImportError:
    logger.warning("TurboJPEG not available — falling back to Pillow")


# CityScapes color palette for semantic segmentation (first 23 classes)
CITYSCAPES_PALETTE = np.array(
    [
        [0, 0, 0],        # 0  Unlabeled
        [128, 64, 128],   # 1  Roads
        [244, 35, 232],   # 2  Sidewalks
        [70, 70, 70],     # 3  Buildings
        [102, 102, 156],  # 4  Walls
        [190, 153, 153],  # 5  Fences
        [153, 153, 153],  # 6  Poles
        [250, 170, 30],   # 7  Traffic lights
        [220, 220, 0],    # 8  Traffic signs
        [107, 142, 35],   # 9  Vegetation
        [152, 251, 152],  # 10 Terrain
        [70, 130, 180],   # 11 Sky
        [220, 20, 60],    # 12 Pedestrians
        [255, 0, 0],      # 13 Rider
        [0, 0, 142],      # 14 Car
        [0, 0, 70],       # 15 Truck
        [0, 60, 100],     # 16 Bus
        [0, 80, 100],     # 17 Train
        [0, 0, 230],      # 18 Motorcycle
        [119, 11, 32],    # 19 Bicycle
        [110, 190, 160],  # 20 Static
        [170, 120, 50],   # 21 Dynamic
        [55, 90, 80],     # 22 Other
    ],
    dtype=np.uint8,
)


class ImageCompressor:
    """Compress BGRA sensor images to JPEG/WebP."""

    def compress_bgra_to_jpeg(
        self, raw_data: bytes, width: int, height: int, quality: int = 80
    ) -> bytes:
        """BGRA raw buffer -> JPEG bytes."""
        if _turbojpeg_available:
            return self._turbojpeg_encode(raw_data, width, height, quality)
        return self._pillow_encode(raw_data, width, height, quality, "JPEG")

    def compress_bgra_to_webp(
        self, raw_data: bytes, width: int, height: int, quality: int = 80
    ) -> bytes:
        """BGRA raw buffer -> WebP bytes."""
        return self._pillow_encode(raw_data, width, height, quality, "WEBP")

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
        # CARLA semantic seg: class index stored in R channel
        labels = arr[:, :, 2]  # Red channel = class label
        # Map labels to palette colors
        safe_labels = np.clip(labels, 0, len(CITYSCAPES_PALETTE) - 1)
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
        return _turbojpeg.encode(
            arr,
            quality=quality,
            pixel_format=TJPF_BGRA,
            flags=TJFLAG_FASTDCT,
        )

    def _pillow_encode(
        self,
        raw_data: bytes,
        width: int,
        height: int,
        quality: int,
        fmt: str,
    ) -> bytes:
        from io import BytesIO
        from PIL import Image

        arr = np.frombuffer(raw_data, dtype=np.uint8).reshape(height, width, 4)
        # BGRA -> RGB
        rgb = arr[:, :, [2, 1, 0]]
        img = Image.fromarray(rgb, "RGB")
        buf = BytesIO()
        img.save(buf, format=fmt, quality=quality)
        return buf.getvalue()


# Singleton
image_compressor = ImageCompressor()
