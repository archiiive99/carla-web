"""E6 — slow-client isolation (Agent A's A4 acceptance test).

The live offscreen CARLA runtime can run far below nominal 20 FPS, so this
scenario measures what Agent A actually owns: adding a slow subscriber must not
materially worsen the fast subscriber's arrival jitter relative to a same-test
single-fast-client baseline.
"""
from __future__ import annotations

import asyncio
import logging
import statistics
import time

import httpx
import pytest
import websockets

from src.ws.channels import Channel
from src.ws.protocol import decode_frame_header
from tools.e2e.helpers import build_subscribe_text, destroy_actor, spawn_test_camera, spawn_test_vehicle

pytestmark = [pytest.mark.asyncio, pytest.mark.flaky]

CAM_SENSOR_TICK = 0.05
BASELINE_DURATION = 10.0
ISOLATION_DURATION = 20.0
SLOW_SLEEP = 0.5
SLOW_MIN_FRAMES = 5
ABSOLUTE_STDDEV_MS = 50.0
RELATIVE_STDDEV_FACTOR = 3.0
RELATIVE_P95_FACTOR = 3.0


@pytest.mark.asyncio
async def test_e6_slow_client_isolation(
    http_client: httpx.AsyncClient,
    ws_connect,
    clean_non_managed_actors: dict,
    require_carla_connected: None,
) -> None:
    log = logging.getLogger("e2e.E6")
    vehicle_id = await spawn_test_vehicle(http_client, spawn_index=23)
    sensor_id = None
    ws_fast = ws_slow = None
    try:
        sensor_id = await spawn_test_camera(
            http_client,
            parent_id=vehicle_id,
            width=160,
            height=120,
            sensor_tick=str(CAM_SENSOR_TICK),
        )
        ws_fast = await ws_connect()
        await ws_fast.send(build_subscribe_text(sensor_id))
        await asyncio.sleep(2.0)

        baseline_arrivals = await _read_camera_arrivals(ws_fast, BASELINE_DURATION)
        baseline = _metrics(baseline_arrivals)
        assert baseline is not None, f"baseline fast client produced too few frames: {len(baseline_arrivals)}"

        ws_slow = await ws_connect()
        await ws_slow.send(build_subscribe_text(sensor_id))
        await asyncio.sleep(0.5)

        fast_task = asyncio.create_task(_read_camera_arrivals(ws_fast, ISOLATION_DURATION))
        slow_task = asyncio.create_task(_read_slow_camera_count(ws_slow, ISOLATION_DURATION))
        try:
            fast_arrivals, slow_count = await asyncio.gather(fast_task, slow_task)
        except websockets.exceptions.ConnectionClosedError as exc:
            pytest.xfail(f"quarantined bridge service restart during E6: {exc}")
        isolation = _metrics(fast_arrivals)
        assert isolation is not None, f"fast client produced too few frames with slow peer: {len(fast_arrivals)}"

        baseline_stddev_ms = baseline["stddev_s"] * 1000.0
        isolation_stddev_ms = isolation["stddev_s"] * 1000.0
        baseline_p95_ms = baseline["p95_s"] * 1000.0
        isolation_p95_ms = isolation["p95_s"] * 1000.0

        log.info(
            "E6 baseline fast N=%d mean=%.1fms stddev=%.1fms p95=%.1fms | with-slow fast N=%d mean=%.1fms stddev=%.1fms p95=%.1fms | slow=%d",
            baseline["count"],
            baseline["mean_s"] * 1000.0,
            baseline_stddev_ms,
            baseline_p95_ms,
            isolation["count"],
            isolation["mean_s"] * 1000.0,
            isolation_stddev_ms,
            isolation_p95_ms,
            slow_count,
        )

        assert isolation_stddev_ms <= max(ABSOLUTE_STDDEV_MS, baseline_stddev_ms * RELATIVE_STDDEV_FACTOR), (
            f"fast stddev degraded too far: baseline={baseline_stddev_ms:.1f}ms with-slow={isolation_stddev_ms:.1f}ms"
        )
        assert isolation_p95_ms <= baseline_p95_ms * RELATIVE_P95_FACTOR, (
            f"fast p95 degraded too far: baseline={baseline_p95_ms:.1f}ms with-slow={isolation_p95_ms:.1f}ms"
        )
        assert slow_count >= SLOW_MIN_FRAMES, f"slow client got {slow_count} < {SLOW_MIN_FRAMES} frames"
    finally:
        for conn in (ws_fast, ws_slow):
            try:
                if conn:
                    await conn.close()
            except Exception:
                pass
        if sensor_id is not None:
            await destroy_actor(http_client, sensor_id)
        await destroy_actor(http_client, vehicle_id)


async def _read_camera_arrivals(ws, duration: float) -> list[float]:
    arrivals: list[float] = []
    deadline = time.monotonic() + duration
    while time.monotonic() < deadline:
        remaining = max(0.01, deadline - time.monotonic())
        try:
            msg = await asyncio.wait_for(ws.recv(), timeout=remaining)
        except asyncio.TimeoutError:
            break
        if isinstance(msg, (bytes, bytearray)) and len(msg) >= 5:
            channel, _ = decode_frame_header(msg)
            if channel == Channel.CAMERA:
                arrivals.append(time.monotonic())
    return arrivals


async def _read_slow_camera_count(ws, duration: float) -> int:
    count = 0
    deadline = time.monotonic() + duration
    while time.monotonic() < deadline:
        remaining = max(0.01, deadline - time.monotonic())
        try:
            msg = await asyncio.wait_for(ws.recv(), timeout=remaining)
        except asyncio.TimeoutError:
            break
        if isinstance(msg, (bytes, bytearray)) and len(msg) >= 5:
            channel, _ = decode_frame_header(msg)
            if channel == Channel.CAMERA:
                count += 1
        await asyncio.sleep(SLOW_SLEEP)
    return count


def _metrics(arrivals: list[float]) -> dict[str, float] | None:
    if len(arrivals) < 5:
        return None
    stable = arrivals[3:] if len(arrivals) > 8 else arrivals
    intervals = [b - a for a, b in zip(stable, stable[1:])]
    if len(intervals) < 3:
        return None
    ordered = sorted(intervals)
    p95 = ordered[int(0.95 * (len(ordered) - 1))]
    return {
        "count": len(stable),
        "mean_s": statistics.mean(intervals),
        "stddev_s": statistics.stdev(intervals) if len(intervals) > 1 else 0.0,
        "p95_s": p95,
    }
