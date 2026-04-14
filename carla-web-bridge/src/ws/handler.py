"""WebSocket endpoint handler for FastAPI."""

from __future__ import annotations

from fastapi import APIRouter, WebSocket

from src.ws_broadcaster import ws_broadcaster

router = APIRouter()


def _get_sensor_manager():
    """Lazy import to avoid circular dependency."""
    from src.main import sensor_manager
    return sensor_manager


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    sm = _get_sensor_manager()

    def on_subscribe(sensor_id: int, client_id: str) -> None:
        sm.subscribe(sensor_id, client_id)

    def on_unsubscribe(sensor_id: int, client_id: str) -> None:
        sm.unsubscribe(sensor_id, client_id)

    def on_set_rate(sensor_id: int, client_id: str, target_fps: float) -> float:
        return sm.set_subscriber_rate(sensor_id, client_id, target_fps, is_ceiling=True)

    await ws_broadcaster.handle_connection(
        ws,
        on_subscribe=on_subscribe,
        on_unsubscribe=on_unsubscribe,
        on_set_rate=on_set_rate,
    )
