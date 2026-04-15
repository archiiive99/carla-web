"""Tests for binary protocol encoder/decoder."""

import struct

from src.ws.channels import Channel
from src.ws.protocol import (
    decode_camera_payload,
    decode_frame,
    decode_frame_header,
    decode_gnss_payload,
    decode_imu_payload,
    decode_lidar_payload,
    decode_world_tick_payload,
    encode_camera_payload,
    encode_frame,
    encode_gnss_payload,
    encode_imu_payload,
    encode_lidar_payload,
    encode_world_tick_payload,
)


def test_frame_encode_decode():
    payload = b"hello world"
    frame = encode_frame(Channel.CAMERA, payload)
    assert len(frame) == 5 + len(payload)

    channel, decoded_payload = decode_frame(frame)
    assert channel == Channel.CAMERA
    assert decoded_payload == payload


def test_frame_header():
    payload = b"test"
    frame = encode_frame(0x07, payload)
    channel, length = decode_frame_header(frame)
    assert channel == 0x07
    assert length == len(payload)


def test_camera_payload_roundtrip():
    jpeg_data = b"\xff\xd8\xff\xe0" + b"\x00" * 100  # fake JPEG
    payload = encode_camera_payload(
        sensor_id=42, width=1920, height=1080, frame=10, timestamp=1234.5, jpeg_data=jpeg_data
    )
    sid, w, h, f, ts, jpeg = decode_camera_payload(payload)
    assert sid == 42
    assert w == 1920
    assert h == 1080
    assert f == 10
    assert abs(ts - 1234.5) < 1e-6
    assert jpeg == jpeg_data


def test_lidar_payload_roundtrip():
    # 3 points, each 4 floats (x, y, z, intensity) = 48 bytes
    raw_points = struct.pack("<12f", *([1.0, 2.0, 3.0, 0.5] * 3))
    payload = encode_lidar_payload(
        sensor_id=7, point_count=3, frame=20, timestamp=5678.9, raw_points=raw_points
    )
    sid, count, f, ts, points = decode_lidar_payload(payload)
    assert sid == 7
    assert count == 3
    assert f == 20
    assert abs(ts - 5678.9) < 1e-6
    assert points == raw_points


def test_imu_payload_roundtrip():
    payload = encode_imu_payload(
        sensor_id=99, frame=5, timestamp=100.0,
        accel=(1.0, 2.0, 3.0), gyro=(0.1, 0.2, 0.3), compass=180.0,
    )
    sid, f, ts, accel, gyro, compass = decode_imu_payload(payload)
    assert sid == 99
    assert f == 5
    assert abs(ts - 100.0) < 1e-6
    assert abs(accel[0] - 1.0) < 1e-6
    assert abs(gyro[2] - 0.3) < 1e-6
    assert abs(compass - 180.0) < 1e-6


def test_gnss_payload_roundtrip():
    payload = encode_gnss_payload(
        sensor_id=11, frame=1, timestamp=50.0,
        lat=37.7749, lon=-122.4194, alt=10.0,
    )
    sid, f, ts, lat, lon, alt = decode_gnss_payload(payload)
    assert sid == 11
    assert abs(lat - 37.7749) < 1e-6
    assert abs(lon - (-122.4194)) < 1e-6
    assert abs(alt - 10.0) < 1e-6


def test_world_tick_roundtrip():
    actors = [
        (101, (10.0, 20.0, 0.5), (0.0, 90.0, 0.0), (5.0, 0.0, 0.0)),
        (202, (30.0, 40.0, 1.0), (0.0, 180.0, 0.0), (0.0, 3.0, 0.0)),
    ]
    payload = encode_world_tick_payload(frame=100, timestamp=999.9, actors=actors)
    frame, ts, decoded = decode_world_tick_payload(payload)
    assert frame == 100
    assert abs(ts - 999.9) < 1e-6
    assert len(decoded) == 2
    assert decoded[0]["id"] == 101
    assert abs(decoded[0]["position"]["x"] - 10.0) < 1e-6
    assert abs(decoded[1]["velocity"]["y"] - 3.0) < 1e-6


def test_frame_too_short():
    import pytest

    with pytest.raises(ValueError, match="Frame too short"):
        decode_frame_header(b"\x01\x02")


def test_frame_truncated():
    import pytest

    # Header says 100 bytes of payload but only 5 bytes total
    frame = struct.pack("<BI", 0x01, 100)
    with pytest.raises(ValueError, match="Frame truncated"):
        decode_frame(frame)
