from __future__ import annotations

import argparse
import asyncio

from pathlib import Path

from _common import (  # type: ignore[import-not-found]
    FakeConnection,
    aggregate_observed_fps,
    build_sensor_manager,
    emit_frame,
    save_plot,
    write_csv,
    write_json,
)

SENSOR_IDS = {5: "camera", 9: "lidar"}
TARGET_FPS = 30.0


def _count_crossings(values: list[float], baseline: float) -> int:
    lower = baseline * 0.9
    upper = baseline * 1.1
    state = None
    crossings = 0
    for value in values:
        current = "inside"
        if value < lower:
            current = "below"
        elif value > upper:
            current = "above"
        if state is not None and current != state and {current, state} != {"inside"}:
            crossings += 1
        state = current
    return crossings


async def run(duration_s: int, decode_delay_ms: float, out_dir: Path) -> dict:
    sm, broadcaster = build_sensor_manager({5: (30.0, "sensor.camera.rgb"), 9: (30.0, "sensor.lidar.ray_cast")})
    fast = FakeConnection("fast")
    slow = FakeConnection("slow")
    broadcaster.add(fast)
    broadcaster.add(slow)

    for sensor_id in SENSOR_IDS:
        sm.subscribe(sensor_id, fast.client_id)
        sm.subscribe(sensor_id, slow.client_id)
        sm.set_subscriber_rate(sensor_id, fast.client_id, TARGET_FPS)
        sm.set_subscriber_rate(sensor_id, slow.client_id, TARGET_FPS)

    rows: list[dict] = []
    frame_no = 0
    for second in range(1, duration_s + 1):
        backlog = 0.0 if second <= 5 else min(6.0, float(second - 3))
        lag = 10.0 if second <= 5 else decode_delay_ms
        fast.last_stats = {
            "action": "stats",
            "ts_client_ms": second * 1000,
            "viewport_active": True,
            "rtt_ms": 18.0,
            "sensors": {
                str(sensor_id): {
                    "queue_backlog": 0,
                    "decode_lag_ms": 10,
                    "frames_dropped": 0,
                    "frames_received": 30,
                }
                for sensor_id in SENSOR_IDS
            },
        }
        slow.last_stats = {
            "action": "stats",
            "ts_client_ms": second * 1000,
            "viewport_active": True,
            "rtt_ms": 42.0,
            "sensors": {
                str(sensor_id): {
                    "queue_backlog": backlog,
                    "decode_lag_ms": lag,
                    "frames_dropped": max(0.0, backlog - 1.0),
                    "frames_received": max(1.0, TARGET_FPS - backlog),
                }
                for sensor_id in SENSOR_IDS
            },
        }
        sm.rate_controller.tick(broadcaster.get_clients(), now_monotonic=float(second))

        counts: dict[tuple[int, str], int] = {}
        for _ in range(int(TARGET_FPS)):
            frame_no += 1
            timestamp = frame_no / TARGET_FPS
            for sensor_id in SENSOR_IDS:
                before = len(broadcaster.frames)
                await emit_frame(sm, sensor_id, frame_no, timestamp)
                for _payload, recipients in broadcaster.frames[before:]:
                    if not recipients:
                        continue
                    for client_id in recipients:
                        counts[(sensor_id, client_id)] = counts.get((sensor_id, client_id), 0) + 1
        broadcaster.frames.clear()

        for row in aggregate_observed_fps(counts, second):
            state = sm.rate_controller.get_state(row["client_id"], row["sensor_id"])
            rows.append(
                {
                    **row,
                    "sensor_name": SENSOR_IDS[row["sensor_id"]],
                    "target_fps": state.target_fps,
                    "effective_fps": state.effective_fps,
                }
            )

    out_dir.mkdir(parents=True, exist_ok=True)
    csv_path = out_dir / "two_client.csv"
    plot_path = out_dir / "two_client.png"

    write_csv(csv_path, rows)
    save_plot(plot_path, "Two-client adaptive-rate divergence", rows, sensor_ids=SENSOR_IDS.keys())

    camera_fast = [row for row in rows if row["sensor_id"] == 5 and row["client_id"] == "fast" and row["second"] > 5]
    camera_slow = [row for row in rows if row["sensor_id"] == 5 and row["client_id"] == "slow"]
    fast_ok_fraction = sum(row["effective_fps"] >= 0.9 * TARGET_FPS for row in camera_fast) / max(1, len(camera_fast))
    slow_by_15 = next(row for row in camera_slow if row["second"] == 15)
    slow_drop_fraction = 1.0 - (slow_by_15["effective_fps"] / TARGET_FPS)
    tail = [row["effective_fps"] for row in camera_slow if row["second"] > duration_s - 30]
    baseline = sum(tail) / max(1, len(tail))
    crossings = _count_crossings(tail, baseline)

    summary = {
        "duration_s": duration_s,
        "decode_delay_ms": decode_delay_ms,
        "fast_ok_fraction": fast_ok_fraction,
        "slow_drop_fraction_at_15s": slow_drop_fraction,
        "slow_post_downgrade_baseline_fps": baseline,
        "slow_tail_crossings": crossings,
        "artifacts": {
            "csv": str(csv_path),
            "plot": str(plot_path),
        },
    }
    write_json(out_dir / "two_client_summary.json", summary)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--duration", type=int, default=60)
    parser.add_argument("--decode-delay-ms", type=float, default=180.0)
    parser.add_argument("--out-dir", type=Path, default=Path("tools/adaptive_rate/out/two_client"))
    args = parser.parse_args()
    summary = asyncio.run(run(args.duration, args.decode_delay_ms, args.out_dir))
    print(summary)


if __name__ == "__main__":
    main()
