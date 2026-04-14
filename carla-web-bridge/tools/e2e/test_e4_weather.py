"""E4 — weather change broadcast.

FINDING: The current WORLD_TICK payload encodes (frame, timestamp, actors)
only — no weather state (see src/utils/serialization.py:encode_world_tick).
We therefore assert:
1. weather HTTP state changes as requested, and
2. WORLD_TICK continues to arrive and remains well-formed across the change.
"""
from __future__ import annotations

import logging
import math

import httpx
import pytest

from src.ws.channels import Channel
from src.ws.protocol import decode_frame, decode_world_tick_payload
from tools.e2e.helpers import wait_for_first_binary

pytestmark = pytest.mark.asyncio

TARGET = {
    "cloudiness": 90.0,
    "precipitation": 80.0,
    "precipitation_deposits": 0.0,
    "wind_intensity": 5.0,
    "sun_azimuth_angle": 0.0,
    "sun_altitude_angle": 30.0,
    "fog_density": 0.0,
    "fog_distance": 0.0,
    "fog_falloff": 0.0,
    "wetness": 0.0,
    "scattering_intensity": 0.0,
    "mie_scattering_scale": 0.0,
    "rayleigh_scattering_scale": 0.0,
    "dust_storm": 0.0,
}


@pytest.mark.asyncio
async def test_e4_weather_change(
    http_client: httpx.AsyncClient,
    ws_connect,
    clean_non_managed_actors: dict,
    weather_snapshot: dict,
    require_carla_connected: None,
) -> None:
    log = logging.getLogger("e2e.E4")

    ws = await ws_connect()
    try:
        raw_before = await wait_for_first_binary(ws, Channel.WORLD_TICK, timeout=5.0)
        _, payload_before = decode_frame(raw_before)
        frame_before, _, actors_before = decode_world_tick_payload(payload_before)

        resp = await http_client.post("/api/world/weather", json={"params": TARGET})
        assert resp.status_code == 200, resp.text

        resp = await http_client.get("/api/world/weather")
        resp.raise_for_status()
        current = resp.json()
        for key in ("cloudiness", "precipitation", "sun_altitude_angle"):
            assert math.isclose(current[key], TARGET[key], abs_tol=0.5)

        raw_after = await wait_for_first_binary(ws, Channel.WORLD_TICK, timeout=5.0)
        _, payload_after = decode_frame(raw_after)
        frame_after, _, actors_after = decode_world_tick_payload(payload_after)
        assert frame_after >= frame_before
        log.info(
            "E4 weather applied; tick frame %d -> %d, actor_count %d -> %d",
            frame_before,
            frame_after,
            len(actors_before),
            len(actors_after),
        )
    finally:
        await ws.close()
