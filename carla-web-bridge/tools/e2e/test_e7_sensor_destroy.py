"""E7 — sensor destruction during active stream."""
from __future__ import annotations

import logging
import re
from pathlib import Path

import httpx
import pytest

from src.ws.channels import Channel
from tools.e2e.helpers import (
    build_subscribe_text,
    collect_camera_frames,
    decode_camera_frame,
    destroy_actor,
    drain_for,
    spawn_test_camera,
    spawn_test_vehicle,
)

pytestmark = pytest.mark.asyncio


@pytest.mark.asyncio
async def test_e7_sensor_destroy_midstream(
    http_client: httpx.AsyncClient,
    ws_connect,
    bridge_log_path: Path | None,
    clean_non_managed_actors: dict,
    require_carla_connected: None,
) -> None:
    log = logging.getLogger("e2e.E7")
    vehicle_id = await spawn_test_vehicle(http_client, spawn_index=25)
    sensor_id = None
    ws = None
    log_cursor: int | None = None
    if bridge_log_path is not None:
        try:
            log_cursor = bridge_log_path.stat().st_size
        except Exception:
            log_cursor = None

    try:
        sensor_id = await spawn_test_camera(http_client, parent_id=vehicle_id, width=320, height=240)
        ws = await ws_connect()
        await ws.send(build_subscribe_text(sensor_id))
        frames = await collect_camera_frames(ws, sensor_id, n=3, timeout=8.0)
        assert len(frames) >= 3, f"got {len(frames)} frames before destroy"

        await destroy_actor(http_client, sensor_id)
        destroyed_id = sensor_id
        sensor_id = None

        tail = await drain_for(ws, duration=2.0, only_channel=Channel.CAMERA)
        matched = [msg for msg in tail if decode_camera_frame(msg).sensor_id == destroyed_id]
        assert not matched, f"got {len(matched)} frames after destroy"

        resp = await http_client.get("/api/actors")
        resp.raise_for_status()
        live_ids = {int(actor["id"]) for actor in resp.json().get("actors", [])}
        assert destroyed_id not in live_ids

        if bridge_log_path is not None and log_cursor is not None:
            bad_lines = _grep_errors_for_sensor(bridge_log_path, since=log_cursor, sensor_id=destroyed_id)
            assert not bad_lines, f"bridge log ERROR for sensor {destroyed_id}: {bad_lines}"
            log.info("E7 bridge log clean for sensor %s via %s", destroyed_id, bridge_log_path)
        else:
            log.info("E7 bridge log not located — skipping log-grep assertion")
    finally:
        try:
            if ws:
                await ws.close()
        except Exception:
            pass
        if sensor_id is not None:
            await destroy_actor(http_client, sensor_id)
        await destroy_actor(http_client, vehicle_id)


def _grep_errors_for_sensor(path: Path, *, since: int, sensor_id: int) -> list[str]:
    try:
        with path.open("r", errors="replace") as handle:
            handle.seek(since)
            text = handle.read()
    except Exception:
        return []
    pattern = re.compile(r"\[ERROR\]|ERROR:")
    needle = str(sensor_id)
    return [line.strip() for line in text.splitlines() if pattern.search(line) and needle in line]
