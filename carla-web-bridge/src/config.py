from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()


def _csv(val: str) -> list[str]:
    return [v.strip() for v in val.split(",") if v.strip()]


CARLA_HOST: str = os.getenv("CARLA_HOST", "localhost")
CARLA_PORT: int = int(os.getenv("CARLA_PORT", "58338"))
CARLA_TIMEOUT: float = float(os.getenv("CARLA_TIMEOUT", "10.0"))

BRIDGE_HOST: str = os.getenv("BRIDGE_HOST", "0.0.0.0")
BRIDGE_PORT: int = int(os.getenv("BRIDGE_PORT", "58337"))

JPEG_BACKEND: str = os.getenv("JPEG_BACKEND", "auto").strip().lower() or "auto"
JPEG_QUALITY: int = int(os.getenv("JPEG_QUALITY", "85"))
JPEG_SUBSAMPLING: int = int(os.getenv("JPEG_SUBSAMPLING", "1"))
JPEG_AUTO_EXPOSE: bool = os.getenv("JPEG_AUTO_EXPOSE", "0").lower() in ("1", "true", "yes")
JPEG_EMBED_SRGB_ICC: bool = os.getenv("JPEG_EMBED_SRGB_ICC", "1").lower() in ("1", "true", "yes")
MAX_CLIENTS: int = int(os.getenv("MAX_CLIENTS", "50"))
MAX_SENSORS: int = int(os.getenv("MAX_SENSORS", "20"))
SENSOR_FRAME_SKIP: int = int(os.getenv("SENSOR_FRAME_SKIP", "0"))

# Per-subscriber adaptive-rate defaults (D1/D2). The feature flag defaults to
# false so Agent D's logic can land safely before Agent A's queue/worker API is
# considered stable everywhere.
ADAPTIVE_RATE_ENABLED: bool = os.getenv("ADAPTIVE_RATE_ENABLED", "false").lower() in (
    "1", "true", "yes"
)
MIN_CLIENT_FPS: float = float(os.getenv("MIN_CLIENT_FPS", "1"))
ADAPTIVE_MIN_FPS: float = MIN_CLIENT_FPS
ADAPTIVE_MAX_FPS: float = float(os.getenv("ADAPTIVE_MAX_FPS", "60"))
ADAPTIVE_SAMPLE_HZ: float = float(os.getenv("ADAPTIVE_SAMPLE_HZ", "1"))
ADAPTIVE_STATS_HISTORY: int = int(os.getenv("ADAPTIVE_STATS_HISTORY", "10"))
ADAPTIVE_BACKLOG_HIGH: int = int(os.getenv("ADAPTIVE_BACKLOG_HIGH", "3"))
ADAPTIVE_BACKLOG_HEALTHY: int = int(os.getenv("ADAPTIVE_BACKLOG_HEALTHY", "1"))
ADAPTIVE_DECODE_LAG_HIGH_MS: float = float(os.getenv("ADAPTIVE_DECODE_LAG_HIGH_MS", "100"))
ADAPTIVE_DECODE_LAG_HEALTHY_MS: float = float(
    os.getenv("ADAPTIVE_DECODE_LAG_HEALTHY_MS", "40")
)
ADAPTIVE_BACKLOG_TREND_SAMPLES: int = int(os.getenv("ADAPTIVE_BACKLOG_TREND_SAMPLES", "3"))
ADAPTIVE_HEALTHY_SAMPLE_WINDOW: int = int(os.getenv("ADAPTIVE_HEALTHY_SAMPLE_WINDOW", "5"))
ADAPTIVE_DOWNGRADE_FACTOR: float = float(os.getenv("ADAPTIVE_DOWNGRADE_FACTOR", "0.75"))
ADAPTIVE_UPGRADE_FACTOR: float = float(os.getenv("ADAPTIVE_UPGRADE_FACTOR", "1.25"))
ADAPTIVE_UPGRADE_COOLDOWN_SECONDS: float = float(
    os.getenv("ADAPTIVE_UPGRADE_COOLDOWN_SECONDS", "10")
)
ADAPTIVE_DOWNGRADE_HYSTERESIS_SECONDS: float = float(
    os.getenv("ADAPTIVE_DOWNGRADE_HYSTERESIS_SECONDS", "2")
)
ADAPTIVE_VIEWPORT_INACTIVE_FPS: float = float(
    os.getenv("ADAPTIVE_VIEWPORT_INACTIVE_FPS", "1")
)
# Compatibility aliases for the simpler controller surface used by
# src/adaptive_rate.py. These preserve existing semantics while keeping the
# newer env names authoritative.
ADAPTIVE_BAD_BACKLOG: int = int(os.getenv("ADAPTIVE_BAD_BACKLOG", str(ADAPTIVE_BACKLOG_HIGH)))
ADAPTIVE_BAD_DECODE_MS: float = float(
    os.getenv("ADAPTIVE_BAD_DECODE_MS", str(ADAPTIVE_DECODE_LAG_HIGH_MS))
)
ADAPTIVE_DOWN_AFTER: int = int(
    os.getenv("ADAPTIVE_DOWN_AFTER", str(ADAPTIVE_BACKLOG_TREND_SAMPLES))
)
ADAPTIVE_UP_AFTER: int = int(
    os.getenv("ADAPTIVE_UP_AFTER", str(ADAPTIVE_HEALTHY_SAMPLE_WINDOW))
)
ADAPTIVE_STEP_FPS: float = float(os.getenv("ADAPTIVE_STEP_FPS", "1"))
DEFAULT_CAMERA_WIDTH: int = int(os.getenv("DEFAULT_CAMERA_WIDTH", "1280"))
DEFAULT_CAMERA_HEIGHT: int = int(os.getenv("DEFAULT_CAMERA_HEIGHT", "720"))
DEFAULT_CAMERA_FOV: int = int(os.getenv("DEFAULT_CAMERA_FOV", "100"))
DEFAULT_CAMERA_SENSOR_TICK: str = os.getenv("DEFAULT_CAMERA_SENSOR_TICK", "0.05")
SESSION_ARM_DELAY_SECONDS: float = float(os.getenv("SESSION_ARM_DELAY_SECONDS", "2.0"))
CAMERA_ARM_DELAY_SECONDS: float = float(os.getenv("CAMERA_ARM_DELAY_SECONDS", "1.0"))

CORS_ORIGINS: list[str] = _csv(
    os.getenv("CORS_ORIGINS", "http://localhost:58336,http://127.0.0.1:58336")
)

HEARTBEAT_INTERVAL: float = float(os.getenv("HEARTBEAT_INTERVAL", "5.0"))
RECONNECT_MAX_DELAY: float = float(os.getenv("RECONNECT_MAX_DELAY", "30.0"))
RECONNECT_STD_EXCEPTION_DELAY: float = float(os.getenv("RECONNECT_STD_EXCEPTION_DELAY", "2.0"))
WORLD_TICK_INTERVAL: float = float(os.getenv("WORLD_TICK_INTERVAL", "0.05"))

WS_MAX_SEND_BUFFER: int = int(
    os.getenv("WS_MAX_SEND_BUFFER", str(10 * 1024 * 1024))  # 10 MB
)
WS_SEND_TIMEOUT: float = float(os.getenv("WS_SEND_TIMEOUT", "0.5"))

# Sensor data-plane per-sensor queue sizes (see Agent A spec §2.1.3).
# Spatial streams (camera/lidar) keep only the latest sweep/frame; small
# bounded buffers absorb short bursts for scalar/event streams. Collision and
# lane-invasion queues start at 16 and are enlarged with a WARN if they fill,
# rather than dropping discrete events.
SENSOR_QUEUE_MAX_CAMERA: int = int(os.getenv("SENSOR_QUEUE_MAX_CAMERA", "1"))
SENSOR_QUEUE_MAX_LIDAR: int = int(os.getenv("SENSOR_QUEUE_MAX_LIDAR", "1"))
SENSOR_QUEUE_MAX_SEMANTIC_LIDAR: int = int(
    os.getenv("SENSOR_QUEUE_MAX_SEMANTIC_LIDAR", "1")
)
SENSOR_QUEUE_MAX_RADAR: int = int(os.getenv("SENSOR_QUEUE_MAX_RADAR", "2"))
SENSOR_QUEUE_MAX_IMU: int = int(os.getenv("SENSOR_QUEUE_MAX_IMU", "4"))
SENSOR_QUEUE_MAX_GNSS: int = int(os.getenv("SENSOR_QUEUE_MAX_GNSS", "4"))
SENSOR_QUEUE_MAX_DVS: int = int(os.getenv("SENSOR_QUEUE_MAX_DVS", "4"))
SENSOR_QUEUE_MAX_COLLISION: int = int(os.getenv("SENSOR_QUEUE_MAX_COLLISION", "16"))
SENSOR_QUEUE_MAX_LANE_INVASION: int = int(
    os.getenv("SENSOR_QUEUE_MAX_LANE_INVASION", "16")
)
SENSOR_EVENT_QUEUE_WARN: int = int(os.getenv("SENSOR_EVENT_QUEUE_WARN", "16"))
