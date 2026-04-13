"""WebSocket multiplexed broadcaster for real-time sensor data."""

from __future__ import annotations

import asyncio
import json
import logging
import struct
import time
import uuid

from fastapi import WebSocket, WebSocketDisconnect

from src.config import MAX_CLIENTS, WS_MAX_SEND_BUFFER
from src.ws.channels import Channel

logger = logging.getLogger(__name__)


class ClientConnection:
    """Tracks a single WebSocket client."""

    __slots__ = ("ws", "client_id", "subscriptions", "connected_at", "last_stats")

    def __init__(self, ws: WebSocket, client_id: str) -> None:
        self.ws = ws
        self.client_id = client_id
        self.subscriptions: set[int] = set()
        self.connected_at = time.time()
        self.last_stats: dict | None = None


class WebSocketBroadcaster:
    """Manages WebSocket connections and broadcasts sensor data."""

    def __init__(self) -> None:
        self._clients: dict[str, ClientConnection] = {}
        self._lock = asyncio.Lock()

    @property
    def client_count(self) -> int:
        return len(self._clients)

    def get_client_ids(self) -> list[str]:
        return list(self._clients.keys())

    # --- connection lifecycle ------------------------------------------------

    async def handle_connection(
        self,
        ws: WebSocket,
        on_subscribe: callable | None = None,
        on_unsubscribe: callable | None = None,
    ) -> None:
        if len(self._clients) >= MAX_CLIENTS:
            await ws.close(code=1013, reason="Max clients reached")
            return

        await ws.accept()
        client_id = str(uuid.uuid4())[:8]
        conn = ClientConnection(ws, client_id)

        async with self._lock:
            self._clients[client_id] = conn

        logger.info("Client %s connected (%d total)", client_id, len(self._clients))

        try:
            while True:
                message = await ws.receive()
                if message.get("type") == "websocket.disconnect":
                    break

                raw = message.get("bytes") or message.get("text")
                if not raw:
                    continue

                if isinstance(raw, str):
                    await self._handle_text_message(conn, raw, on_subscribe, on_unsubscribe)
                elif isinstance(raw, bytes) and len(raw) >= 5:
                    await self._handle_binary_message(conn, raw, on_subscribe, on_unsubscribe)
        except WebSocketDisconnect:
            pass
        except Exception as exc:
            logger.error("Client %s error: %s", client_id, exc)
        finally:
            async with self._lock:
                self._clients.pop(client_id, None)
            if on_unsubscribe:
                for sid in conn.subscriptions:
                    on_unsubscribe(sid, client_id)
            logger.info("Client %s disconnected (%d remain)", client_id, len(self._clients))

    # --- message handling ----------------------------------------------------

    async def _handle_text_message(
        self, conn: ClientConnection, text: str,
        on_subscribe: callable | None,
        on_unsubscribe: callable | None,
    ) -> None:
        try:
            msg = json.loads(text)
        except json.JSONDecodeError:
            return

        action = msg.get("action")
        sensor_id = msg.get("sensor_id")

        if action == "subscribe" and sensor_id is not None:
            conn.subscriptions.add(sensor_id)
            if on_subscribe:
                on_subscribe(sensor_id, conn.client_id)
        elif action == "unsubscribe" and sensor_id is not None:
            conn.subscriptions.discard(sensor_id)
            if on_unsubscribe:
                on_unsubscribe(sensor_id, conn.client_id)
        elif action == "stats":
            conn.last_stats = msg

    async def _handle_binary_message(
        self, conn: ClientConnection, data: bytes,
        on_subscribe: callable | None,
        on_unsubscribe: callable | None,
    ) -> None:
        channel = data[0]
        if channel == Channel.SUBSCRIBE:
            try:
                msg = json.loads(data[5:])
                sensor_id = msg.get("sensor_id")
                if sensor_id is not None:
                    conn.subscriptions.add(sensor_id)
                    if on_subscribe:
                        on_subscribe(sensor_id, conn.client_id)
            except (json.JSONDecodeError, IndexError):
                pass
        elif channel == Channel.UNSUBSCRIBE:
            try:
                msg = json.loads(data[5:])
                sensor_id = msg.get("sensor_id")
                if sensor_id is not None:
                    conn.subscriptions.discard(sensor_id)
                    if on_unsubscribe:
                        on_unsubscribe(sensor_id, conn.client_id)
            except (json.JSONDecodeError, IndexError):
                pass
        elif channel == Channel.CLIENT_STATS:
            try:
                conn.last_stats = json.loads(data[5:])
            except (json.JSONDecodeError, IndexError):
                pass

    # --- broadcasting --------------------------------------------------------

    async def broadcast_raw(self, data: bytes, target_clients: set[str] | None = None) -> None:
        """Send raw binary data to target clients (or all if None)."""
        clients = list(self._clients.values())
        for conn in clients:
            if target_clients and conn.client_id not in target_clients:
                continue
            try:
                await conn.ws.send_bytes(data)
            except Exception:
                pass

    async def broadcast_sensor_data(
        self,
        channel: int,
        sensor_id: int,
        frame: int,
        timestamp: float,
        payload: bytes,
    ) -> None:
        """Encode and broadcast sensor data to subscribed clients."""
        header = struct.pack("<BI", channel, len(payload))
        message = header + payload

        clients = list(self._clients.values())
        for conn in clients:
            if sensor_id not in conn.subscriptions:
                continue
            try:
                await conn.ws.send_bytes(message)
            except Exception:
                pass

    async def broadcast_world_tick(self, tick_data: bytes) -> None:
        """Send world tick to ALL connected clients."""
        header = struct.pack("<BI", Channel.WORLD_TICK, len(tick_data))
        message = header + tick_data

        clients = list(self._clients.values())
        for conn in clients:
            try:
                await conn.ws.send_bytes(message)
            except Exception:
                pass


# Singleton
ws_broadcaster = WebSocketBroadcaster()
