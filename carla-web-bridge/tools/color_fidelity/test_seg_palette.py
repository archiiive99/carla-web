"""Byte-for-byte parity between src/compression/image.py:CITYSCAPES_PALETTE and
LibCarla/source/carla/image/CityScapesPalette.h.

Per §3.3.2. The CARLA header is the source of truth — any drift here means
the browser paints semantic classes with wrong colors.

Usage:
    python3 -m tools.color_fidelity.test_seg_palette        # exit 0/1
"""
from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path

THIS_DIR = Path(__file__).resolve().parent
REPO_ROOT = THIS_DIR.parent.parent.parent
sys.path.insert(0, str(THIS_DIR.parent.parent))

from src.compression.image import CITYSCAPES_PALETTE  # noqa: E402


CARLA_HEADER = (
    REPO_ROOT / "LibCarla" / "source" / "carla" / "image" / "CityScapesPalette.h"
)


@dataclass
class PaletteEntry:
    idx: int
    name: str
    rgb: tuple[int, int, int]


def parse_carla_header(path: Path) -> list[PaletteEntry]:
    text = path.read_text()
    pat = re.compile(
        r"\{\s*(\d+)u?,\s*(\d+)u?,\s*(\d+)u?\s*\},\s*//\s*([A-Za-z ]+?)\s*=\s*(\d+)u"
    )
    entries: list[PaletteEntry] = []
    for m in pat.finditer(text):
        r, g, b = int(m.group(1)), int(m.group(2)), int(m.group(3))
        name = m.group(4).strip()
        idx = int(m.group(5))
        entries.append(PaletteEntry(idx, name, (r, g, b)))
    entries.sort(key=lambda e: e.idx)
    return entries


def main() -> int:
    if not CARLA_HEADER.exists():
        print(f"FAIL: cannot locate CARLA header at {CARLA_HEADER}")
        return 2
    carla = parse_carla_header(CARLA_HEADER)
    ours = [tuple(int(x) for x in row) for row in CITYSCAPES_PALETTE]

    print(f"CARLA header entries: {len(carla)}; bridge palette entries: {len(ours)}")
    mismatches = 0
    for e in carla:
        if e.idx >= len(ours):
            print(f"MISS idx={e.idx:>2} {e.name:<14} carla={e.rgb}")
            mismatches += 1
            continue
        if ours[e.idx] != e.rgb:
            print(f"DIFF idx={e.idx:>2} {e.name:<14} carla={e.rgb} ours={ours[e.idx]}")
            mismatches += 1

    # Extras in our palette not in CARLA's header
    if len(ours) > len(carla):
        for i in range(len(carla), len(ours)):
            print(f"XTRA idx={i:>2} ours={ours[i]}")
            mismatches += 1

    print(f"\nSEG-PALETTE TEST: mismatches={mismatches} {'OK' if mismatches == 0 else 'FAIL'}")
    return 0 if mismatches == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
