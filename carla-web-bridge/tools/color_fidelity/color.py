"""sRGB → linear → XYZ → Lab and CIE76 ΔE. No external deps beyond numpy.

CIE76 is chosen per §4.3 of the audit spec. It's cheap, monotone, and
well-suited to per-pixel ROI statistics. Typical interpretation:
  ΔE < 1    imperceptible (JND for trained observer)
  1 ≤ ΔE < 3  perceptible on close inspection
  3 ≤ ΔE < 6  clearly visible
  ΔE ≥ 10   distinct colors
"""
from __future__ import annotations

import numpy as np


def srgb_to_linear(arr: np.ndarray) -> np.ndarray:
    """Input: uint8 or float [0,255] sRGB. Output: float32 linear [0,1]."""
    a = arr.astype(np.float32) / 255.0
    low = a / 12.92
    high = ((a + 0.055) / 1.055) ** 2.4
    return np.where(a <= 0.04045, low, high).astype(np.float32)


def linear_to_xyz(arr: np.ndarray) -> np.ndarray:
    """Input: linear RGB float [0,1]. Output: XYZ float (same range)."""
    M = np.array(
        [
            [0.4124564, 0.3575761, 0.1804375],
            [0.2126729, 0.7151522, 0.0721750],
            [0.0193339, 0.1191920, 0.9503041],
        ],
        dtype=np.float32,
    )
    return arr @ M.T


_EPS = 216.0 / 24389.0  # ~0.008856
_KAPPA = 24389.0 / 27.0  # ~903.3


def xyz_to_lab(xyz: np.ndarray) -> np.ndarray:
    """Input: XYZ float. Output: Lab float (L 0-100, a/b approx ±128)."""
    # D65 white
    Xn, Yn, Zn = 0.95047, 1.00000, 1.08883
    x = xyz[..., 0] / Xn
    y = xyz[..., 1] / Yn
    z = xyz[..., 2] / Zn

    def f(t: np.ndarray) -> np.ndarray:
        return np.where(t > _EPS, np.cbrt(t), (_KAPPA * t + 16.0) / 116.0)

    fx, fy, fz = f(x), f(y), f(z)
    L = 116.0 * fy - 16.0
    a = 500.0 * (fx - fy)
    b = 200.0 * (fy - fz)
    return np.stack([L, a, b], axis=-1).astype(np.float32)


def rgb_to_lab(rgb_uint8: np.ndarray) -> np.ndarray:
    """uint8 sRGB → Lab (D65)."""
    return xyz_to_lab(linear_to_xyz(srgb_to_linear(rgb_uint8)))


def delta_e_76(a_rgb: np.ndarray, b_rgb: np.ndarray) -> np.ndarray:
    """Pixelwise CIE76 ΔE between two uint8 sRGB arrays of same shape."""
    if a_rgb.shape != b_rgb.shape:
        raise ValueError(f"shape mismatch: {a_rgb.shape} vs {b_rgb.shape}")
    La = rgb_to_lab(a_rgb)
    Lb = rgb_to_lab(b_rgb)
    return np.sqrt(((La - Lb) ** 2).sum(axis=-1))
