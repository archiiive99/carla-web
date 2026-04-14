"""Two-client adaptive-rate harness (Agent D §D4).

Exercises the per-subscriber frame-skip gate (D1) and the AdaptiveRate
controller (D2) end-to-end, without depending on a live CARLA server.

Set-up:
  * One fake camera sensor (id=42, native 30 fps).
  * Two synthetic subscribers:
        - "healthy"  → reports backlog=0, decode_lag_ms=10
        - "slow"     → reports backlog=4, decode_lag_ms=180
  * Both start with target_fps = 30 (native).
  * The adaptive controller ticks at 1 Hz over a simulated 30 s run.
  * Per-second per-client effective fps is computed from the gate's
    pass count and written to CSV.

Usage:
    python -m tools.test_adaptive_rate --duration 30 --out d4_out.csv

Output:
    - <out>.csv  : columns t,client,target_fps,emitted_frames
    - Adjustment log lines printed to stderr by the controller
    - Final summary table printed to stdout
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import logging
import os
import sys
import time
from dataclasses import dataclass

# Make src.* importable when run from repo root.
_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from src.adaptive_rate import AdaptiveRateController  # noqa: E402
from src.sensor_manager import SensorManager  # noqa: E402


# ---------- Stubs ---------------------------------------------------------

class _FakeCarlaClient:
    """Minimal CarlaClientManager stand-in."""
    def track_actor(self, _id: int) -> None: ...
    def untrack_actor(self, _id: int) -> None: ...
    def get_actor(self, _id: int):
        return None
    def refresh_world(self):
        return None


class _FakeBroadcaster:
    """Minimal WebSocketBroadcaster stand-in."""

    def __init__(self) -> None:
        self._clients: dict[str, _FakeConn] = {}

    def get_clients(self) -> dict[str, "_FakeConn"]:
        return dict(self._clients)

    def add(self, conn: "_FakeConn") -> None:
        self._clients[conn.client_id] = conn

    async def broadcast_raw(self, _data: bytes, target_clients=None) -> None:
        # No-op: the harness counts emits via the gate, not the wire.
        return


@dataclass(slots=True)
class _FakeConn:
    client_id: str
    last_stats: dict | None = None


# ---------- Harness -------------------------------------------------------

async def run(duration_s: float, out_csv: str) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    bcast = _FakeBroadcaster()
    sm = SensorManager(_FakeCarlaClient(), bcast)
    sm.set_loop(asyncio.get_running_loop())

    sensor_id = 42
    native_fps = 30.0

    class _FakeSensor:
        attributes = {"sensor_tick": "0.033"}
        def listen(self, _cb): ...

    # Inject sensor state without going through spawn_sensor (avoids CARLA).
    sm._sensors[sensor_id] = _FakeSensor()                        # noqa: SLF001
    sm._sensor_type_ids[sensor_id] = "sensor.camera.rgb"          # noqa: SLF001
    sm._subscriptions[sensor_id] = set()                          # noqa: SLF001
    sm._frame_counters[sensor_id] = 0                             # noqa: SLF001
    sm._native_fps[sensor_id] = native_fps                        # noqa: SLF001
    sm._spawn_params[sensor_id] = {                               # noqa: SLF001
        "sensor_type": "sensor.camera.rgb",
        "transform": {},
        "parent_id": 0,
        "attributes": {"sensor_tick": "0.033"},
    }

    healthy = _FakeConn("healthy")
    slow = _FakeConn("slow")
    bcast.add(healthy)
    bcast.add(slow)
    sm.subscribe(sensor_id, healthy.client_id)
    sm.subscribe(sensor_id, slow.client_id)
    sm.set_subscriber_rate(sensor_id, healthy.client_id, native_fps, is_ceiling=True)
    sm.set_subscriber_rate(sensor_id, slow.client_id, native_fps, is_ceiling=True)

    controller = AdaptiveRateController(sm, bcast, sample_hz=1.0)

    # Drive frames at native cadence and bookkeep per-second emits.
    period = 1.0 / native_fps
    rows: list[tuple[float, str, float, int]] = []
    emits = {healthy.client_id: 0, slow.client_id: 0}

    start = time.monotonic()
    next_sec = 1.0
    next_frame = 0.0
    next_stats = 0.0

    while True:
        t = time.monotonic() - start
        if t >= duration_s:
            break

        if t >= next_frame:
            # Re-run the gate logic identical to _on_sensor_data without
            # building/encoding a packet (we only need the recipient set).
            sm._frame_counters[sensor_id] += 1                     # noqa: SLF001
            now = time.time()
            for cid in (healthy.client_id, slow.client_id):
                key = (cid, sensor_id)
                target = sm._target_fps.get(key)                   # noqa: SLF001
                if target is None or target <= 0:
                    continue
                last = sm._last_emit_ts.get(key, 0.0)               # noqa: SLF001
                if now - last + 1e-3 >= 1.0 / target:
                    sm._last_emit_ts[key] = now                     # noqa: SLF001
                    emits[cid] += 1
            next_frame += period

        # Stats reports at 1 Hz. Three-phase scenario:
        #   t < 1/3  : both healthy            → no adjustments
        #   1/3 ≤ t < 2/3 : slow degrades      → step-down chain
        #   t ≥ 2/3 : slow recovers            → climb-back chain
        if t >= next_stats:
            phase_two_start = duration_s / 3.0
            phase_three_start = 2.0 * duration_s / 3.0
            healthy.last_stats = {
                "action": "stats",
                "client_queue_backlog": 0,
                "decode_lag_ms": 10.0,
                "rtt_ms": 25.0,
                "frames_dropped": 0,
                "_recv_ts": time.time(),
            }
            if t < phase_two_start or t >= phase_three_start:
                slow_backlog, slow_lag, slow_drops = 0, 12.0, 0
            else:
                slow_backlog, slow_lag, slow_drops = 4, 180.0, 12
            slow.last_stats = {
                "action": "stats",
                "client_queue_backlog": slow_backlog,
                "decode_lag_ms": slow_lag,
                "rtt_ms": 60.0,
                "frames_dropped": slow_drops,
                "_recv_ts": time.time(),
            }
            controller.tick()
            next_stats += 1.0

        # Per-second snapshot.
        if t >= next_sec:
            for cid in (healthy.client_id, slow.client_id):
                rows.append((
                    round(next_sec, 3),
                    cid,
                    sm.get_subscriber_rate(sensor_id, cid) or 0.0,
                    emits[cid],
                ))
            emits[healthy.client_id] = 0
            emits[slow.client_id] = 0
            next_sec += 1.0

        await asyncio.sleep(0.005)

    # Write CSV.
    with open(out_csv, "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["t_seconds", "client_id", "target_fps", "emitted_in_last_second"])
        for r in rows:
            w.writerow(r)

    # Summary.
    print()
    print(f"=== Adaptive-rate harness summary ({duration_s:.0f}s, native={native_fps:.0f} fps) ===")
    print(f"{'t':>4}  {'healthy_fps':>11}  {'healthy_tgt':>11}  {'slow_fps':>9}  {'slow_tgt':>9}")
    by_t: dict[float, dict[str, tuple[float, int]]] = {}
    for t, cid, tgt, emitted in rows:
        by_t.setdefault(t, {})[cid] = (tgt, emitted)
    for t in sorted(by_t):
        h = by_t[t].get("healthy", (0.0, 0))
        s = by_t[t].get("slow", (0.0, 0))
        print(f"{t:>4.0f}  {h[1]:>11d}  {h[0]:>11.1f}  {s[1]:>9d}  {s[0]:>9.1f}")
    print(f"\nCSV → {out_csv}")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--duration", type=float, default=30.0)
    p.add_argument("--out", type=str, default="d4_out.csv")
    args = p.parse_args()
    asyncio.run(run(args.duration, args.out))


if __name__ == "__main__":
    main()
