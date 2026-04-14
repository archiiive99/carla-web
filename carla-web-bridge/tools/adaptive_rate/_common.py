from __future__ import annotations

import asyncio
import json
import os
import sys

from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import matplotlib.pyplot as plt

_HERE = Path(__file__).resolve().parent
_ROOT = _HERE.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from src.sensor_manager import SensorManager  # noqa: E402
from src.ws.protocol import decode_frame  # noqa: E402


class FakeCarlaClient:
    def track_actor(self, _id: int) -> None: ...
    def untrack_actor(self, _id: int) -> None: ...
    def get_actor(self, _id: int):
        return None
    def refresh_world(self):
        return None


class FakeBroadcaster:
    def __init__(self) -> None:
        self._clients: dict[str, FakeConnection] = {}
        self.frames: list[tuple[bytes, set[str] | None]] = []

    def get_clients(self) -> dict[str, "FakeConnection"]:
        return dict(self._clients)

    def add(self, conn: "FakeConnection") -> None:
        self._clients[conn.client_id] = conn

    async def broadcast_raw(self, data: bytes, target_clients=None) -> None:
        recipients = None if target_clients is None else set(target_clients)
        self.frames.append((data, recipients))


@dataclass(slots=True)
class FakeConnection:
    client_id: str
    last_stats: dict | None = None


class FakeSensor:
    def __init__(self, sensor_tick: str, type_id: str = "sensor.camera.rgb") -> None:
        self.attributes = {
            "sensor_tick": sensor_tick,
            "fov": "100",
            "image_size_x": "1280",
            "image_size_y": "720",
        }
        self.type_id = type_id

    def listen(self, _cb): ...


class FakeImageData:
    type_id = "sensor.camera.rgb"

    def __init__(self, frame: int, timestamp: float, width: int = 4, height: int = 4) -> None:
        self.frame = frame
        self.timestamp = timestamp
        self.width = width
        self.height = height
        pixels = []
        for idx in range(width * height):
            pixels.extend([(idx * 7) % 255, (idx * 11) % 255, (idx * 13) % 255, 255])
        self.raw_data = bytes(pixels)


class ImmediateLoop:
    def call_soon_threadsafe(self, fn, *args):
        fn(*args)

    def create_task(self, coro):
        return asyncio.create_task(coro)


def install_sensor(
    sm: SensorManager,
    sensor_id: int,
    *,
    native_fps: float,
    type_id: str = "sensor.camera.rgb",
) -> None:
    tick = str(1.0 / native_fps)
    sm._sensors[sensor_id] = FakeSensor(tick, type_id=type_id)              # noqa: SLF001
    sm._sensor_type_ids[sensor_id] = type_id                                 # noqa: SLF001
    sm._subscriptions[sensor_id] = set()                                     # noqa: SLF001
    sm._frame_counters[sensor_id] = 0                                        # noqa: SLF001
    sm._native_fps[sensor_id] = native_fps                                   # noqa: SLF001
    sm._spawn_params[sensor_id] = {                                          # noqa: SLF001
        "sensor_type": type_id,
        "transform": {},
        "parent_id": 0,
        "attributes": {
            "sensor_tick": tick,
            "fov": "100",
            "image_size_x": "1280",
            "image_size_y": "720",
        },
    }
    sm._sensor_queues[sensor_id] = asyncio.Queue()                           # noqa: SLF001


def build_sensor_manager(sensor_specs: dict[int, tuple[float, str]]) -> tuple[SensorManager, FakeBroadcaster]:
    broadcaster = FakeBroadcaster()
    sm = SensorManager(FakeCarlaClient(), broadcaster)
    sm._loop = ImmediateLoop()                                               # noqa: SLF001
    for sensor_id, (native_fps, type_id) in sensor_specs.items():
        install_sensor(sm, sensor_id, native_fps=native_fps, type_id=type_id)
    return sm, broadcaster


async def emit_frame(sm: SensorManager, sensor_id: int, frame: int, timestamp: float) -> None:
    sm._on_sensor_data(sensor_id, FakeImageData(frame=frame, timestamp=timestamp))  # noqa: SLF001
    queue = sm._sensor_queues.get(sensor_id)  # noqa: SLF001
    if queue is None:
        return
    while not queue.empty():
        packet = queue.get_nowait()
        await sm._sensor_worker_once(packet)


def summarize_counts(rows: list[dict], sensor_id: int, client_id: str) -> list[dict]:
    return [row for row in rows if row["sensor_id"] == sensor_id and row["client_id"] == client_id]


def write_csv(path: Path, rows: list[dict]) -> None:
    if not rows:
        return
    import csv

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2))


def save_plot(path: Path, title: str, rows: list[dict], *, sensor_ids: Iterable[int]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    sensor_ids = list(sensor_ids)
    fig, axes = plt.subplots(len(sensor_ids), 1, figsize=(10, 4 * len(sensor_ids)), sharex=True)
    if len(sensor_ids) == 1:
        axes = [axes]
    for ax, sensor_id in zip(axes, sensor_ids):
        sensor_rows = [row for row in rows if row["sensor_id"] == sensor_id]
        for client_id in sorted({row["client_id"] for row in sensor_rows}):
            series = [row for row in sensor_rows if row["client_id"] == client_id]
            ax.plot([row["second"] for row in series], [row["effective_fps"] for row in series], label=f"{client_id} effective_fps")
            ax.plot([row["second"] for row in series], [row["observed_fps"] for row in series], linestyle="--", label=f"{client_id} observed_fps")
        ax.set_title(f"sensor {sensor_id}")
        ax.set_ylabel("fps")
        ax.grid(True, alpha=0.3)
        ax.legend(loc="upper right")
    axes[-1].set_xlabel("second")
    fig.suptitle(title)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def decode_all_frames(frames: list[tuple[bytes, set[str] | None]]) -> None:
    for payload, _targets in frames:
        decode_frame(payload)


def rss_bytes() -> int:
    with open("/proc/self/statm", "r", encoding="utf-8") as fh:
        resident_pages = int(fh.read().split()[1])
    return resident_pages * os.sysconf("SC_PAGE_SIZE")


def aggregate_observed_fps(counts: dict[tuple[int, str], int], second: int) -> list[dict]:
    rows = []
    for (sensor_id, client_id), observed in sorted(counts.items()):
        rows.append(
            {
                "second": second,
                "sensor_id": sensor_id,
                "client_id": client_id,
                "observed_fps": observed,
            }
        )
    return rows


def count_broadcast_targets(frames: list[tuple[bytes, set[str] | None]], sensor_id: int) -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    for _payload, targets in frames:
        if not targets:
            continue
        for client_id in targets:
            counts[client_id] += 1
    return counts
