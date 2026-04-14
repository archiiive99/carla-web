from __future__ import annotations

import argparse
import asyncio

from pathlib import Path

from _common import (  # type: ignore[import-not-found]
    FakeConnection,
    build_sensor_manager,
    emit_frame,
    rss_bytes,
    write_json,
)


async def run(duration_s: int, out_dir: Path) -> dict:
    sm, broadcaster = build_sensor_manager({5: (30.0, "sensor.camera.rgb"), 9: (30.0, "sensor.lidar.ray_cast")})
    fast = FakeConnection("fast")
    slow = FakeConnection("slow")
    broadcaster.add(fast)
    broadcaster.add(slow)

    for sensor_id in (5, 9):
        sm.subscribe(sensor_id, fast.client_id)
        sm.subscribe(sensor_id, slow.client_id)
        sm.set_subscriber_rate(sensor_id, fast.client_id, 30.0)
        sm.set_subscriber_rate(sensor_id, slow.client_id, 30.0)

    start_rss = rss_bytes()
    frame_no = 0
    for second in range(1, duration_s + 1):
        fast.last_stats = {
            "action": "stats",
            "ts_client_ms": second * 1000,
            "viewport_active": True,
            "rtt_ms": 16.0,
            "sensors": {
                "5": {"queue_backlog": 0, "decode_lag_ms": 8, "frames_dropped": 0, "frames_received": 30},
                "9": {"queue_backlog": 0, "decode_lag_ms": 8, "frames_dropped": 0, "frames_received": 30},
            },
        }
        slow.last_stats = {
            "action": "stats",
            "ts_client_ms": second * 1000,
            "viewport_active": True,
            "rtt_ms": 36.0,
            "sensors": {
                "5": {"queue_backlog": 4, "decode_lag_ms": 180, "frames_dropped": 4, "frames_received": 20},
                "9": {"queue_backlog": 4, "decode_lag_ms": 180, "frames_dropped": 4, "frames_received": 20},
            },
        }
        sm.rate_controller.tick(broadcaster.get_clients(), now_monotonic=float(second))
        for _ in range(30):
            frame_no += 1
            for sensor_id in (5, 9):
                await emit_frame(sm, sensor_id, frame_no, frame_no / 30.0)
        broadcaster.frames.clear()

    end_rss = rss_bytes()
    summary = {
        "duration_s": duration_s,
        "rss_start_bytes": start_rss,
        "rss_end_bytes": end_rss,
        "rss_delta_bytes": end_rss - start_rss,
        "rss_delta_mb": round((end_rss - start_rss) / (1024 * 1024), 3),
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    write_json(out_dir / "memory_summary.json", summary)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--duration", type=int, default=600)
    parser.add_argument("--out-dir", type=Path, default=Path("tools/adaptive_rate/out/memory"))
    args = parser.parse_args()
    summary = asyncio.run(run(args.duration, args.out_dir))
    print(summary)


if __name__ == "__main__":
    main()
