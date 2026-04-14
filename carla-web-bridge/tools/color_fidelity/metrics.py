"""PSNR and SSIM on uint8 RGB/gray arrays. Pure numpy + cv2 (cv2 is used only
for the Gaussian blur inside SSIM, which is orders of magnitude faster than
a pure-numpy equivalent on 1280x720). Falls back to a single-window SSIM if
cv2 isn't available."""
from __future__ import annotations

import numpy as np


def psnr(a: np.ndarray, b: np.ndarray, data_range: float = 255.0) -> float:
    if a.shape != b.shape:
        raise ValueError(f"shape mismatch: {a.shape} vs {b.shape}")
    diff = a.astype(np.float64) - b.astype(np.float64)
    mse = float((diff ** 2).mean())
    if mse == 0.0:
        return float("inf")
    return 10.0 * np.log10((data_range ** 2) / mse)


def ssim(a: np.ndarray, b: np.ndarray, data_range: float = 255.0) -> float:
    """Mean SSIM on grayscale / per-channel-average 2D array.

    Matches Wang et al. (2004) with K1=0.01, K2=0.03, 11x11 Gaussian σ=1.5.
    If `a` or `b` is 3-channel, we compute on the luminance channel
    (Rec. 709 weights) so the number is comparable across color images.
    """
    if a.shape != b.shape:
        raise ValueError(f"shape mismatch: {a.shape} vs {b.shape}")

    a_f = _to_luma(a)
    b_f = _to_luma(b)

    K1, K2 = 0.01, 0.03
    C1 = (K1 * data_range) ** 2
    C2 = (K2 * data_range) ** 2

    try:
        import cv2

        ksize = (11, 11)
        sigma = 1.5
        mu_a = cv2.GaussianBlur(a_f, ksize, sigma)
        mu_b = cv2.GaussianBlur(b_f, ksize, sigma)
        mu_a2 = mu_a * mu_a
        mu_b2 = mu_b * mu_b
        mu_ab = mu_a * mu_b
        var_a = cv2.GaussianBlur(a_f * a_f, ksize, sigma) - mu_a2
        var_b = cv2.GaussianBlur(b_f * b_f, ksize, sigma) - mu_b2
        cov = cv2.GaussianBlur(a_f * b_f, ksize, sigma) - mu_ab
        num = (2 * mu_ab + C1) * (2 * cov + C2)
        den = (mu_a2 + mu_b2 + C1) * (var_a + var_b + C2)
        return float((num / den).mean())
    except ImportError:
        # Global single-window fallback — coarse but always available.
        mu_a = a_f.mean()
        mu_b = b_f.mean()
        var_a = a_f.var()
        var_b = b_f.var()
        cov = ((a_f - mu_a) * (b_f - mu_b)).mean()
        num = (2 * mu_a * mu_b + C1) * (2 * cov + C2)
        den = (mu_a ** 2 + mu_b ** 2 + C1) * (var_a + var_b + C2)
        return float(num / den) if den != 0 else 0.0


def _to_luma(x: np.ndarray) -> np.ndarray:
    if x.ndim == 2:
        return x.astype(np.float32)
    if x.ndim == 3 and x.shape[2] in (3, 4):
        r = x[..., 0].astype(np.float32)
        g = x[..., 1].astype(np.float32)
        b = x[..., 2].astype(np.float32)
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    raise ValueError(f"expected HxW or HxWxC array, got {x.shape}")


def roi_mask(shape_hw: tuple[int, int], poly: list[tuple[float, float]]) -> np.ndarray:
    """Build a boolean mask for a polygon given in normalized (x, y) ∈ [0,1]²."""
    h, w = shape_hw[:2]
    pts = np.array(
        [(int(round(x * (w - 1))), int(round(y * (h - 1)))) for x, y in poly],
        dtype=np.int32,
    )
    mask = np.zeros((h, w), dtype=np.uint8)
    try:
        import cv2

        cv2.fillPoly(mask, [pts], 255)
        return mask.astype(bool)
    except ImportError:
        # Axis-aligned bbox fallback
        xmin = int(pts[:, 0].min())
        xmax = int(pts[:, 0].max())
        ymin = int(pts[:, 1].min())
        ymax = int(pts[:, 1].max())
        mask[ymin:ymax + 1, xmin:xmax + 1] = 255
        return mask.astype(bool)


DEFAULT_ROAD_ROI = [(0.3, 0.7), (0.7, 0.7), (0.7, 0.9), (0.3, 0.9)]
