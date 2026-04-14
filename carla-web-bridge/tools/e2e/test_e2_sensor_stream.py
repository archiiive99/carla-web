"""E2 — sensor subscription + binary frame round-trip."""
from __future__ import annotations

import asyncio
import io
import logging

import httpx
import pytest

from src.ws.channels import Channel
from tools.e2e.helpers import (
    build_subscribe_binary,
    build_unsubscribe_binary,
    collect_camera_frames,
    decode_camera_frame,
    destroy_actor,
    drain_for,
    spawn_test_camera,
    spawn_test_vehicle,
)

pytestmark = pytest.mark.asyncio

CAM_W, CAM_H = 320, 240


@pytest.mark.asyncio
async def test_e2_sensor_stream_roundtrip(
    http_client: httpx.AsyncClient,
    ws_connect,
    clean_non_managed_actors: dict,
    require_carla_connected: None,
) -> None:
    log = logging.getLogger("e2e.E2")
    vehicle_id = await spawn_test_vehicle(http_client, spawn_index=13)
    sensor_id = None
    try:
        sensor_id = await spawn_test_camera(
            http_client,
            parent_id=vehicle_id,
            width=CAM_W,
            height=CAM_H,
        )
        log.info("spawned vehicle=%s camera=%s", vehicle_id, sensor_id)

        ws = await ws_connect()
        try:
            await ws.send(build_subscribe_binary(sensor_id))
            frames = await collect_camera_frames(ws, sensor_id, n=10, timeout=15.0)
            assert len(frames) >= 10, f"only got {len(frames)} frames"

            first = frames[0]
            assert first.channel == Channel.CAMERA
            assert (first.width, first.height) == (CAM_W, CAM_H)

            img_dims = _decode_jpeg_to_hw3(first.jpeg)
            assert img_dims is not None, "JPEG decode failed"
            height, width, channels = img_dims
            assert (width, height, channels) == (CAM_W, CAM_H, 3)

            duplicates = 0
            skips = 0
            previous = frames[0].frame
            for frame in frames[1:]:
                if frame.frame == previous:
                    duplicates += 1
                elif frame.frame > previous + 1:
                    skips += frame.frame - previous - 1
                previous = max(previous, frame.frame)
            log.info("E2 frame stats: duplicates=%d skips=%d frames=%s", duplicates, skips, [f.frame for f in frames])

            await ws.send(build_unsubscribe_binary(sensor_id))
            await asyncio.sleep(0.2)
            tail = await drain_for(ws, duration=2.0, only_channel=Channel.CAMERA)
            matched = [msg for msg in tail if decode_camera_frame(msg).sensor_id == sensor_id]
            assert not matched, f"received {len(matched)} camera frames for sensor {sensor_id} after unsubscribe"
        finally:
            await ws.close()
    finally:
        if sensor_id is not None:
            await destroy_actor(http_client, sensor_id)
        await destroy_actor(http_client, vehicle_id)


def _decode_jpeg_to_hw3(jpeg_bytes: bytes):
    try:
        from PIL import Image  # type: ignore

        image = Image.open(io.BytesIO(jpeg_bytes)).convert("RGB")
        return image.size[1], image.size[0], 3
    except ModuleNotFoundError:
        pass
    try:
        import cv2  # type: ignore
        import numpy as np  # type: ignore

        arr = np.frombuffer(jpeg_bytes, dtype=np.uint8)
        image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if image is None:
            return None
        return image.shape[0], image.shape[1], image.shape[2]
    except ModuleNotFoundError:
        return None
