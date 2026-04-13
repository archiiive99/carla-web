"""Binary protocol encoder/decoder for WebSocket frames.

Frame format: [1B channel][4B payload_length][payload...]
All multi-byte integers are little-endian.
"""

from __future__ import annotations

import struct


def encode_frame(channel: int, payload: bytes) -> bytes:
    """Encode a complete wire frame: channel + length + payload."""
    return struct.pack("<BI", channel, len(payload)) + payload


def decode_frame_header(data: bytes) -> tuple[int, int]:
    """Decode channel and payload length from the first 5 bytes.

    Returns (channel, payload_length).
    """
    if len(data) < 5:
        raise ValueError("Frame too short: need at least 5 bytes")
    channel, length = struct.unpack("<BI", data[:5])
    return channel, length


def decode_frame(data: bytes) -> tuple[int, bytes]:
    """Decode a full frame into (channel, payload)."""
    channel, length = decode_frame_header(data)
    if len(data) < 5 + length:
        raise ValueError(
            f"Frame truncated: expected {5 + length} bytes, got {len(data)}"
        )
    return channel, data[5 : 5 + length]


# --- Payload encoders for specific channel types ---


def encode_camera_payload(
    sensor_id: int,
    width: int,
    height: int,
    frame: int,
    timestamp: float,
    jpeg_data: bytes,
) -> bytes:
    """Encode camera frame payload (without frame header)."""
    return struct.pack("<IIIId", sensor_id, width, height, frame, timestamp) + jpeg_data


def decode_camera_payload(
    payload: bytes,
) -> tuple[int, int, int, int, float, bytes]:
    """Decode camera payload -> (sensor_id, w, h, frame, timestamp, jpeg)."""
    header_size = struct.calcsize("<IIIId")
    sensor_id, w, h, frame, ts = struct.unpack("<IIIId", payload[:header_size])
    return sensor_id, w, h, frame, ts, payload[header_size:]


def encode_lidar_payload(
    sensor_id: int,
    point_count: int,
    frame: int,
    timestamp: float,
    raw_points: bytes,
) -> bytes:
    return struct.pack("<IIId", sensor_id, point_count, frame, timestamp) + raw_points


def decode_lidar_payload(payload: bytes) -> tuple[int, int, int, float, bytes]:
    header_size = struct.calcsize("<IIId")
    sensor_id, count, frame, ts = struct.unpack("<IIId", payload[:header_size])
    return sensor_id, count, frame, ts, payload[header_size:]


def encode_imu_payload(
    sensor_id: int,
    frame: int,
    timestamp: float,
    accel: tuple[float, float, float],
    gyro: tuple[float, float, float],
    compass: float,
) -> bytes:
    return struct.pack(
        "<IId3f3ff",
        sensor_id, frame, timestamp,
        *accel, *gyro, compass,
    )


def decode_imu_payload(
    payload: bytes,
) -> tuple[int, int, float, tuple, tuple, float]:
    vals = struct.unpack("<IId3f3ff", payload)
    sensor_id, frame = vals[0], vals[1]
    ts = vals[2]
    accel = vals[3:6]
    gyro = vals[6:9]
    compass = vals[9]
    return sensor_id, frame, ts, accel, gyro, compass


def encode_gnss_payload(
    sensor_id: int,
    frame: int,
    timestamp: float,
    lat: float,
    lon: float,
    alt: float,
) -> bytes:
    return struct.pack("<IId3d", sensor_id, frame, timestamp, lat, lon, alt)


def decode_gnss_payload(payload: bytes) -> tuple[int, int, float, float, float, float]:
    vals = struct.unpack("<IId3d", payload)
    return vals[0], vals[1], vals[2], vals[3], vals[4], vals[5]


def encode_world_tick_payload(
    frame: int,
    timestamp: float,
    actors: list[tuple[int, tuple, tuple, tuple]],
) -> bytes:
    """Encode world tick: frame, ts, actor_count, then per-actor data.

    Each actor: (id, (x,y,z), (pitch,yaw,roll), (vx,vy,vz))
    """
    buf = struct.pack("<IdI", frame, timestamp, len(actors))
    for actor_id, pos, rot, vel in actors:
        buf += struct.pack("<I9f", actor_id, *pos, *rot, *vel)
    return buf


def decode_world_tick_payload(
    payload: bytes,
) -> tuple[int, float, list[dict]]:
    offset = 0
    frame, ts, count = struct.unpack_from("<IdI", payload, offset)
    offset += struct.calcsize("<IdI")
    actors = []
    for _ in range(count):
        vals = struct.unpack_from("<I9f", payload, offset)
        offset += struct.calcsize("<I9f")
        actors.append({
            "id": vals[0],
            "position": {"x": vals[1], "y": vals[2], "z": vals[3]},
            "rotation": {"pitch": vals[4], "yaw": vals[5], "roll": vals[6]},
            "velocity": {"x": vals[7], "y": vals[8], "z": vals[9]},
        })
    return frame, ts, actors
