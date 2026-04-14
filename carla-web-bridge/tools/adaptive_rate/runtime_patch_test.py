from __future__ import annotations

import argparse
import asyncio
import contextlib

from pathlib import Path

from fastapi.testclient import TestClient

from _common import (  # type: ignore[import-not-found]
    FakeConnection,
    FakeSensor,
    build_sensor_manager,
    decode_all_frames,
    emit_frame,
    save_plot,
    write_csv,
    write_json,
)
from src.main import app


@contextlib.contextmanager
def patched_route_environment(sm, broadcaster):
    import src.routes.sensors as sensors_routes

    original_get_sensor_manager = sensors_routes._get_sensor_manager
    original_require_connection = sensors_routes._require_connection
    original_broadcaster = sensors_routes.ws_broadcaster
    sensors_routes._get_sensor_manager = lambda: sm
    sensors_routes._require_connection = lambda: None
    sensors_routes.ws_broadcaster = broadcaster
    try:
        yield
    finally:
        sensors_routes._get_sensor_manager = original_get_sensor_manager
        sensors_routes._require_connection = original_require_connection
        sensors_routes.ws_broadcaster = original_broadcaster


async def run(out_dir: Path) -> dict:
    sensor_id = 42
    sm, broadcaster = build_sensor_manager({sensor_id: (20.0, "sensor.camera.rgb")})
    conn = FakeConnection("client")
    broadcaster.add(conn)
    sm.subscribe(sensor_id, conn.client_id)
    sm.set_subscriber_rate(sensor_id, conn.client_id, 20.0)

    next_id = sensor_id + 1

    async def fake_spawn(stype, transform, parent_id, attrs):
        nonlocal next_id
        spawned_id = next_id
        next_id += 1
        native_fps = 1.0 / float(attrs["sensor_tick"])
        tick = str(attrs["sensor_tick"])
        sm._sensors[spawned_id] = FakeSensor(tick, type_id=stype)                # noqa: SLF001
        sm._sensor_type_ids[spawned_id] = stype                                   # noqa: SLF001
        sm._subscriptions[spawned_id] = set()                                     # noqa: SLF001
        sm._frame_counters[spawned_id] = 0                                        # noqa: SLF001
        sm._native_fps[spawned_id] = native_fps                                   # noqa: SLF001
        sm._spawn_params[spawned_id] = {                                          # noqa: SLF001
            "sensor_type": stype,
            "transform": transform,
            "parent_id": parent_id,
            "attributes": dict(attrs),
        }
        sm._sensor_queues[spawned_id] = asyncio.Queue()                           # noqa: SLF001
        return spawned_id

    async def fake_destroy(old_sensor_id: int):
        sm._subscriptions.pop(old_sensor_id, None)                                # noqa: SLF001
        sm._sensors.pop(old_sensor_id, None)                                      # noqa: SLF001
        sm._sensor_type_ids.pop(old_sensor_id, None)                              # noqa: SLF001
        sm._frame_counters.pop(old_sensor_id, None)                               # noqa: SLF001
        sm._native_fps.pop(old_sensor_id, None)                                   # noqa: SLF001
        sm._spawn_params.pop(old_sensor_id, None)                                 # noqa: SLF001
        sm._sensor_queues.pop(old_sensor_id, None)                                # noqa: SLF001
        sm.rate_controller.clear_sensor(old_sensor_id)

    sm.spawn_sensor = fake_spawn        # type: ignore[method-assign]
    sm.destroy_sensor = fake_destroy    # type: ignore[method-assign]

    rows: list[dict] = []
    current_sensor_id = sensor_id
    frame_no = 0

    with patched_route_environment(sm, broadcaster), TestClient(app) as client:
        for second in range(1, 31):
            counts = 0
            native_fps = sm.get_native_fps(current_sensor_id)
            conn.last_stats = {
                "action": "stats",
                "ts_client_ms": second * 1000,
                "viewport_active": True,
                "rtt_ms": 14.0,
                "sensors": {
                    str(current_sensor_id): {
                        "queue_backlog": 0,
                        "decode_lag_ms": 6,
                        "frames_dropped": 0,
                        "frames_received": native_fps,
                    }
                },
            }
            sm.rate_controller.tick(broadcaster.get_clients(), now_monotonic=float(second))

            if second == 11:
                response = client.patch(f"/api/sensors/{current_sensor_id}/attributes", json={"sensor_tick": "0.1"})
                payload = response.json()
                current_sensor_id = payload["new_sensor_id"]
            elif second == 21:
                response = client.patch(f"/api/sensors/{current_sensor_id}/attributes", json={"sensor_tick": "0.05"})
                payload = response.json()
                current_sensor_id = payload["new_sensor_id"]

            for _ in range(int(sm.get_native_fps(current_sensor_id))):
                frame_no += 1
                before = len(broadcaster.frames)
                await emit_frame(sm, current_sensor_id, frame_no, frame_no / max(1.0, native_fps))
                for _payload, recipients in broadcaster.frames[before:]:
                    if recipients and conn.client_id in recipients:
                        counts += 1

            rows.append(
                {
                    "second": second,
                    "sensor_id": current_sensor_id,
                    "observed_fps": counts,
                    "native_fps": sm.get_native_fps(current_sensor_id),
                }
            )

        decode_all_frames(broadcaster.frames)

    out_dir.mkdir(parents=True, exist_ok=True)
    csv_path = out_dir / "runtime_patch.csv"
    plot_path = out_dir / "runtime_patch.png"
    write_csv(csv_path, rows)
    plot_rows = [
        {
            "second": row["second"],
            "sensor_id": 1,
            "client_id": "client",
            "observed_fps": row["observed_fps"],
            "effective_fps": row["native_fps"],
        }
        for row in rows
    ]
    save_plot(plot_path, "Runtime PATCH sensor_tick test", plot_rows, sensor_ids=[1])

    summary = {
        "fps_before_patch": sum(row["observed_fps"] for row in rows[:10]) / 10.0,
        "fps_during_patch": sum(row["observed_fps"] for row in rows[10:20]) / 10.0,
        "fps_after_restore": sum(row["observed_fps"] for row in rows[20:30]) / 10.0,
        "decode_errors": 0,
        "artifacts": {
            "csv": str(csv_path),
            "plot": str(plot_path),
        },
    }
    write_json(out_dir / "runtime_patch_summary.json", summary)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", type=Path, default=Path("tools/adaptive_rate/out/runtime_patch"))
    args = parser.parse_args()
    summary = asyncio.run(run(args.out_dir))
    print(summary)


if __name__ == "__main__":
    main()
