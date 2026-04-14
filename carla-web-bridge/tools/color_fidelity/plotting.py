"""Tiny dependency-free plotting helpers backed by Pillow."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


@dataclass(frozen=True)
class PlotSeries:
    label: str
    points: list[tuple[float, float, str]]
    color: tuple[int, int, int]


def write_scatter_plot(
    path: Path,
    title: str,
    x_label: str,
    y_label: str,
    series: list[PlotSeries],
    *,
    log_x: bool = False,
    width: int = 900,
    height: int = 620,
) -> None:
    if not series:
        return

    xs = [x for s in series for x, _y, _label in s.points if x > 0]
    ys = [y for s in series for _x, y, _label in s.points]
    if not xs or not ys:
        return

    font = ImageFont.load_default()
    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)

    left, top, right, bottom = 90, 55, width - 35, height - 85
    plot_w = right - left
    plot_h = bottom - top

    min_x = min(xs)
    max_x = max(xs)
    min_y = min(ys)
    max_y = max(ys)
    if min_x == max_x:
        max_x += 1.0
    if min_y == max_y:
        max_y += 1.0

    def x_pos(x: float) -> int:
        if log_x:
            import math

            lo = math.log10(min_x)
            hi = math.log10(max_x)
            xx = math.log10(max(x, min_x))
            norm = (xx - lo) / max(hi - lo, 1e-9)
        else:
            norm = (x - min_x) / (max_x - min_x)
        return int(left + norm * plot_w)

    def y_pos(y: float) -> int:
        norm = (y - min_y) / (max_y - min_y)
        return int(bottom - norm * plot_h)

    for step in range(6):
        y = top + int(step * plot_h / 5)
        draw.line((left, y, right, y), fill=(230, 230, 230), width=1)
        val = max_y - step * (max_y - min_y) / 5
        draw.text((8, y - 7), f"{val:.4f}" if max_y <= 2 else f"{val:.1f}", fill="black", font=font)

    for step in range(6):
        x = left + int(step * plot_w / 5)
        draw.line((x, top, x, bottom), fill=(240, 240, 240), width=1)
        if log_x:
            import math

            lo = math.log10(min_x)
            hi = math.log10(max_x)
            val = 10 ** (lo + step * (hi - lo) / 5)
            label = f"{val:.0f}"
        else:
            val = min_x + step * (max_x - min_x) / 5
            label = f"{val:.0f}" if max_x >= 10 else f"{val:.2f}"
        draw.text((x - 12, bottom + 8), label, fill="black", font=font)

    draw.rectangle((left, top, right, bottom), outline="black", width=2)

    legend_x = left
    legend_y = height - 34
    for s in series:
        draw.rectangle((legend_x, legend_y, legend_x + 14, legend_y + 10), fill=s.color, outline=s.color)
        draw.text((legend_x + 20, legend_y - 1), s.label, fill="black", font=font)
        legend_x += 135

    draw.text((width // 2 - len(title) * 3, 14), title, fill="black", font=font)
    draw.text((width // 2 - len(x_label) * 3, height - 24), x_label, fill="black", font=font)
    draw.text((16, 24), y_label, fill="black", font=font)

    for s in series:
        ordered = sorted(s.points, key=lambda p: p[0])
        pix = [(x_pos(x), y_pos(y)) for x, y, _label in ordered]
        if len(pix) > 1:
            draw.line(pix, fill=s.color, width=2)
        for (x, y, label), (px, py) in zip(ordered, pix):
            draw.ellipse((px - 4, py - 4, px + 4, py + 4), fill=s.color, outline="black")
            draw.text((px + 6, py - 10), label, fill=s.color, font=font)

    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)
