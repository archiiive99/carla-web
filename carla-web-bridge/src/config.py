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

JPEG_QUALITY: int = int(os.getenv("JPEG_QUALITY", "80"))
MAX_CLIENTS: int = int(os.getenv("MAX_CLIENTS", "50"))
MAX_SENSORS: int = int(os.getenv("MAX_SENSORS", "20"))
SENSOR_FRAME_SKIP: int = int(os.getenv("SENSOR_FRAME_SKIP", "0"))

CORS_ORIGINS: list[str] = _csv(
    os.getenv("CORS_ORIGINS", "http://localhost:58336,http://127.0.0.1:58336")
)

HEARTBEAT_INTERVAL: float = float(os.getenv("HEARTBEAT_INTERVAL", "5.0"))
RECONNECT_MAX_DELAY: float = float(os.getenv("RECONNECT_MAX_DELAY", "30.0"))

WS_MAX_SEND_BUFFER: int = int(
    os.getenv("WS_MAX_SEND_BUFFER", str(10 * 1024 * 1024))  # 10 MB
)
