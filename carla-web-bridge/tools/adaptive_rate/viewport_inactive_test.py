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


async def run(duration_s: int, out_dir: Path) -> dict:
    sensor_id = 5
    target_fps = 30.0
    sm, broadcaster = build_sensor_manager({sensor_id: (target_fps, "sensor.camera.rgb")})
    conn = FakeConnection("client")
    broadcaster.add(conn)
    sm.subscribe(sensor_id, conn.client_id)
    sm.set_subscriber_rate(sensor_id, conn.client_id, target_fps)

    rows: list[dict] = []
    frame_no = 0
    for second in range(1, duration_s + 1):
        viewport_active = second <= 30 or second > 60
        conn.last_stats = {
            "action": "stats",
            "ts_client_ms": second * 1000,
            "viewport_active": viewport_active,
            "rtt_ms": 16.0,
            "sensors": {
                str(sensor_id): {
                    "queue_backlog": 0,
                    "decode_lag_ms": 8,
                    "frames_dropped": 0,
                    "frames_received": 30,
                }
            },
        }
        sm.rate_controller.tick(broadcaster.get_clients(), now_monotonic=float(second))

        counts: dict[tuple[int, str], int] = {}
        for _ in range(int(target_fps)):
            frame_no += 1
            before = len(broadcaster.frames)
            await emit_frame(sm, sensor_id, frame_no, frame_no / target_fps)
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
                    "target_fps": state.target_fps,
                    "effective_fps": state.effective_fps,
                    "viewport_active": viewport_active,
                }
            )

    out_dir.mkdir(parents=True, exist_ok=True)
    csv_path = out_dir / "viewport_inactive.csv"
    plot_path = out_dir / "viewport_inactive.png"
    write_csv(csv_path, rows)
    save_plot(plot_path, "Viewport inactive adaptive-rate response", rows, sensor_ids=[sensor_id])

    drop_second = next(row for row in rows if row["second"] == 32)
    restore_second = next(row for row in rows if row["second"] == 62)
    summary = {
        "duration_s": duration_s,
        "fps_at_30s": next(row for row in rows if row["second"] == 30)["effective_fps"],
        "fps_at_32s": drop_second["effective_fps"],
        "fps_at_62s": restore_second["effective_fps"],
        "artifacts": {
            "csv": str(csv_path),
            "plot": str(plot_path),
        },
    }
    write_json(out_dir / "viewport_inactive_summary.json", summary)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--duration", type=int, default=90)
    parser.add_argument("--out-dir", type=Path, default=Path("tools/adaptive_rate/out/viewport_inactive"))
    args = parser.parse_args()
    summary = asyncio.run(run(args.duration, args.out_dir))
    print(summary)


if __name__ == "__main__":
    main()
