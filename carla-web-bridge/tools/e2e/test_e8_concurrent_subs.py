"""E8 — concurrent subscribers to same sensor."""
from __future__ import annotations

import asyncio
import logging
import time

import httpx
import pytest

from src.ws.channels import Channel
from src.ws.protocol import decode_frame_header
from tools.e2e.helpers import build_subscribe_text, decode_camera_frame, destroy_actor, spawn_test_camera, spawn_test_vehicle

pytestmark = pytest.mark.asyncio

N_CLIENTS = 5
DURATION = 10.0
SENSOR_TICK = 0.05


@pytest.mark.asyncio
async def test_e8_concurrent_subscribers(
    http_client: httpx.AsyncClient,
    ws_connect,
    clean_non_managed_actors: dict,
    require_carla_connected: None,
) -> None:
    log = logging.getLogger("e2e.E8")
    vehicle_id = await spawn_test_vehicle(http_client, spawn_index=27)
    sensor_id = None
    conns: list = []
    try:
        sensor_id = await spawn_test_camera(
            http_client,
            parent_id=vehicle_id,
            width=320,
            height=240,
            sensor_tick=str(SENSOR_TICK),
        )
        conns = [await ws_connect() for _ in range(N_CLIENTS)]
        await asyncio.gather(*(conn.send(build_subscribe_text(sensor_id)) for conn in conns))

        async def collect(conn):
            frames: list[int] = []
            deadline = time.monotonic() + DURATION
            while time.monotonic() < deadline:
                remaining = max(0.01, deadline - time.monotonic())
                try:
                    msg = await asyncio.wait_for(conn.recv(), timeout=remaining)
                except asyncio.TimeoutError:
                    break
                if not isinstance(msg, (bytes, bytearray)) or len(msg) < 5:
                    continue
                channel, _ = decode_frame_header(msg)
                if channel != Channel.CAMERA:
                    continue
                decoded = decode_camera_frame(bytes(msg))
                if decoded.sensor_id == sensor_id:
                    frames.append(decoded.frame)
            return frames

        streams = await asyncio.gather(*(collect(conn) for conn in conns))
        expected_min = max(20, int(DURATION / SENSOR_TICK * 0.1))
        max_len = max(len(stream) for stream in streams)
        for index, stream in enumerate(streams):
            assert len(stream) >= expected_min, f"client {index} got {len(stream)} < {expected_min} frames"
            assert len(stream) >= max(1, max_len - 2), f"client {index} diverged in frame count: {len(stream)} vs max {max_len}"

        common = set(streams[0]).intersection(*(set(stream) for stream in streams[1:]))
        union = set().union(*streams)
        overlap_ratio = len(common) / max(1, len(union))
        log.info("E8 streams=%s common=%d union=%d overlap=%.1f%%", [len(s) for s in streams], len(common), len(union), overlap_ratio * 100)
        assert overlap_ratio >= 0.9, f"frame overlap {overlap_ratio * 100:.1f}% < 90%"
    finally:
        for conn in conns:
            try:
                await conn.close()
            except Exception:
                pass
        if sensor_id is not None:
            await destroy_actor(http_client, sensor_id)
        await destroy_actor(http_client, vehicle_id)
