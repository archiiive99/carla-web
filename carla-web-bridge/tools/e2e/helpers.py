"""Shared helpers for the Agent E integration-test harness.

Uses the production WS codec (src.ws.protocol / src.ws.channels) — no
reimplementation of the wire format per §3.3.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass
from typing import Any

import httpx
import websockets

from src.ws.channels import CHANNEL_NAMES, Channel
from src.ws.protocol import (
    decode_camera_payload,
    decode_frame,
    decode_frame_header,
    encode_frame,
)

logger = logging.getLogger("e2e.helpers")

WS_OPEN_TIMEOUT = 5.0
WS_RECV_TIMEOUT = 5.0
DEFAULT_VEHICLE_BLUEPRINTS = (
    "vehicle.taxi.ford",
    "vehicle.ue4.ford.mustang",
    "vehicle.lincoln.mkz_2020",
    "vehicle.lincoln.mkz",
    "vehicle.ue4.bmw.grantourer",
)


@dataclass(slots=True)
class DecodedCameraFrame:
    channel: int
    sensor_id: int
    width: int
    height: int
    frame: int
    timestamp: float
    jpeg: bytes


def build_subscribe_text(sensor_id: int) -> str:
    return json.dumps({"action": "subscribe", "sensor_id": int(sensor_id)})


def build_subscribe_binary(sensor_id: int) -> bytes:
    """Binary subscribe using the production encoder + Channel.SUBSCRIBE."""
    payload = json.dumps({"sensor_id": int(sensor_id)}).encode()
    return encode_frame(Channel.SUBSCRIBE, payload)


def build_unsubscribe_binary(sensor_id: int) -> bytes:
    payload = json.dumps({"sensor_id": int(sensor_id)}).encode()
    return encode_frame(Channel.UNSUBSCRIBE, payload)


def decode_camera_frame(raw: bytes) -> DecodedCameraFrame:
    channel, payload = decode_frame(raw)
    sensor_id, width, height, frame, timestamp, jpeg = decode_camera_payload(payload)
    return DecodedCameraFrame(
        channel=channel,
        sensor_id=sensor_id,
        width=width,
        height=height,
        frame=frame,
        timestamp=timestamp,
        jpeg=jpeg,
    )


async def ws_connect(url: str, open_timeout: float = WS_OPEN_TIMEOUT):
    """Open a WS connection with a hard timeout."""
    return await asyncio.wait_for(
        websockets.connect(url, max_size=16 * 1024 * 1024, open_timeout=open_timeout),
        timeout=open_timeout + 1.0,
    )


async def fetch_actors(client: httpx.AsyncClient, *, timeout: float = 10.0) -> list[dict[str, Any]]:
    deadline = time.monotonic() + timeout
    last_exc: Exception | None = None
    while time.monotonic() < deadline:
        try:
            resp = await client.get("/api/actors")
            if resp.status_code == 200:
                return resp.json().get("actors", [])
            if resp.status_code in {404, 503}:
                await asyncio.sleep(0.5)
                continue
            resp.raise_for_status()
        except Exception as exc:
            last_exc = exc
            await asyncio.sleep(0.5)
    if last_exc is not None:
        raise last_exc
    raise RuntimeError(f"/api/actors unavailable within {timeout:.1f}s")


async def get_vehicle_blueprint(client: httpx.AsyncClient) -> str:
    resp = await client.get("/api/blueprints/vehicles")
    resp.raise_for_status()
    blueprints = [bp["id"] for bp in resp.json().get("blueprints", [])]
    for preferred in DEFAULT_VEHICLE_BLUEPRINTS:
        if preferred in blueprints:
            return preferred
    if not blueprints:
        raise RuntimeError("bridge returned no vehicle blueprints")
    return blueprints[0]


async def get_spawn_point(client: httpx.AsyncClient, *, index: int = 0) -> dict[str, Any]:
    resp = await client.get("/api/world/spawn-points")
    resp.raise_for_status()
    spawn_points = resp.json().get("spawn_points", [])
    if not spawn_points:
        raise RuntimeError("bridge returned no spawn points")
    return spawn_points[index % len(spawn_points)]


async def wait_for_actor_presence(
    client: httpx.AsyncClient,
    actor_id: int,
    *,
    present: bool,
    timeout: float = 5.0,
) -> dict[str, Any] | None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        actors = await fetch_actors(client, timeout=min(timeout, 5.0))
        match = next((actor for actor in actors if int(actor["id"]) == int(actor_id)), None)
        if present and match is not None:
            return match
        if not present and match is None:
            return None
        await asyncio.sleep(0.2)
    if present:
        raise AssertionError(f"actor {actor_id} did not appear within {timeout:.1f}s")
    raise AssertionError(f"actor {actor_id} still present after {timeout:.1f}s")


async def spawn_test_vehicle(
    client: httpx.AsyncClient,
    blueprint: str | None = None,
    *,
    spawn_index: int = 7,
    autopilot: bool = False,
) -> int:
    """Spawn a non-managed test vehicle and wait until it is listable."""
    blueprint_id = blueprint or await get_vehicle_blueprint(client)
    spawn_point = await get_spawn_point(client, index=spawn_index)
    resp = await client.post(
        "/api/actors/spawn/vehicle",
        json={
            "blueprint": blueprint_id,
            "transform": spawn_point,
            "autopilot": autopilot,
        },
    )
    resp.raise_for_status()
    actor_id = int(resp.json()["id"])
    actor = await wait_for_actor_presence(client, actor_id, present=True, timeout=5.0)
    logger.info(
        "spawn_test_vehicle: id=%s blueprint=%s listed_role=%s",
        actor_id,
        blueprint_id,
        actor.get("role_name") if actor else None,
    )
    return actor_id


async def spawn_test_camera(
    client: httpx.AsyncClient,
    parent_id: int,
    *,
    width: int = 320,
    height: int = 240,
    sensor_tick: str = "0.05",
) -> int:
    """Spawn a small RGB camera attached to parent_id."""
    resp = await client.post(
        "/api/actors/spawn/sensor",
        json={
            "type": "sensor.camera.rgb",
            "parent_id": int(parent_id),
            "transform": {
                "location": {"x": -6.0, "y": 0.0, "z": 2.8},
                "rotation": {"pitch": -10.0, "yaw": 0.0, "roll": 0.0},
            },
            "attributes": {
                "image_size_x": int(width),
                "image_size_y": int(height),
                "fov": 90,
                "sensor_tick": str(sensor_tick),
            },
        },
    )
    resp.raise_for_status()
    sensor_id = int(resp.json()["id"])
    await wait_for_actor_presence(client, sensor_id, present=True, timeout=5.0)
    return sensor_id


async def destroy_actor(client: httpx.AsyncClient, actor_id: int) -> None:
    try:
        await client.delete(f"/api/actors/{actor_id}")
    except Exception as exc:
        logger.warning("destroy_actor(%s) swallowed: %s", actor_id, exc)
        return
    try:
        await wait_for_actor_presence(client, actor_id, present=False, timeout=5.0)
    except Exception as exc:
        logger.warning("actor %s lingered after destroy: %s", actor_id, exc)


async def wait_for_first_binary(ws, expected_channel: int, timeout: float = 8.0) -> bytes:
    """Return the first binary message whose channel byte matches."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        remaining = max(0.1, deadline - time.monotonic())
        try:
            msg = await asyncio.wait_for(ws.recv(), timeout=remaining)
        except asyncio.TimeoutError:
            break
        if isinstance(msg, (bytes, bytearray)) and len(msg) >= 5:
            channel, _ = decode_frame_header(msg)
            if channel == expected_channel:
                return bytes(msg)
    raise TimeoutError(
        f"No binary frame on channel {CHANNEL_NAMES.get(expected_channel, expected_channel)} "
        f"within {timeout:.1f}s"
    )


async def collect_camera_frames(
    ws,
    sensor_id: int,
    n: int,
    *,
    timeout: float = 15.0,
) -> list[DecodedCameraFrame]:
    """Read N camera frames for this sensor id from the WS."""
    frames: list[DecodedCameraFrame] = []
    deadline = time.monotonic() + timeout
    while len(frames) < n and time.monotonic() < deadline:
        remaining = max(0.1, deadline - time.monotonic())
        try:
            msg = await asyncio.wait_for(ws.recv(), timeout=remaining)
        except asyncio.TimeoutError:
            break
        if not isinstance(msg, (bytes, bytearray)) or len(msg) < 5:
            continue
        channel, _ = decode_frame_header(msg)
        if channel != Channel.CAMERA:
            continue
        decoded = decode_camera_frame(bytes(msg))
        if decoded.sensor_id != sensor_id:
            continue
        frames.append(decoded)
    return frames


async def drain_for(ws, duration: float, *, only_channel: int | None = None) -> list[bytes]:
    """Drain the WS for `duration` seconds and return matching messages."""
    messages: list[bytes] = []
    deadline = time.monotonic() + duration
    while time.monotonic() < deadline:
        remaining = max(0.01, deadline - time.monotonic())
        try:
            msg = await asyncio.wait_for(ws.recv(), timeout=remaining)
        except asyncio.TimeoutError:
            break
        if not isinstance(msg, (bytes, bytearray)) or len(msg) < 5:
            continue
        if only_channel is None:
            messages.append(bytes(msg))
            continue
        channel, _ = decode_frame_header(msg)
        if channel == only_channel:
            messages.append(bytes(msg))
    return messages


async def get_actor_snapshot(client: httpx.AsyncClient, actor_id: int) -> dict[str, Any] | None:
    resp = await client.get(f"/api/actors/{actor_id}")
    if resp.status_code != 200:
        return None
    body = resp.json()
    return body if isinstance(body, dict) else None


async def find_bridge_ego_and_camera(client: httpx.AsyncClient) -> tuple[int | None, int | None]:
    actors = await fetch_actors(client, timeout=10.0)
    bridge_ego = next((actor for actor in actors if actor.get("role_name") == "bridge_ego"), None)
    if bridge_ego is None:
        return None, None
    vehicle_id = int(bridge_ego["id"])
    camera = next(
        (
            actor
            for actor in actors
            if actor.get("parent_id") == vehicle_id and actor.get("type_id", "").startswith("sensor.camera.")
        ),
        None,
    )
    return vehicle_id, (int(camera["id"]) if camera else None)


def displacement(samples: list[tuple[float, float, float]]) -> float:
    if len(samples) < 2:
        return 0.0
    start = samples[0]
    end = samples[-1]
    return ((start[0] - end[0]) ** 2 + (start[1] - end[1]) ** 2 + (start[2] - end[2]) ** 2) ** 0.5
