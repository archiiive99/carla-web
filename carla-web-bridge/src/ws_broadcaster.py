"""WebSocket multiplexed broadcaster for real-time sensor data."""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import time
import uuid
from collections.abc import Callable

from fastapi import WebSocket, WebSocketDisconnect

from src.config import MAX_CLIENTS, WS_SEND_TIMEOUT
from src.ws.channels import Channel
from src.ws.protocol import decode_frame, encode_frame

logger = logging.getLogger(__name__)


def _coerce_sensor_id(raw: object) -> int | None:
    """Coerce a JSON-decoded sensor_id to int, or None if it isn't convertible.

    The wire protocol documents sensor_id as an integer, but a buggy/hostile
    client could send "5" (string), True (bool), or a list. The CONTROL/set_rate
    branch below already runs this via try/except int(...); subscribe and
    unsubscribe used a bare `is not None` check, so a string id landed in
    `conn.subscriptions` and the sensor_manager callback, where the dict-keyed
    int lookup silently failed. Returning None on coercion failure makes all
    three protocol branches share the same defensive behavior.
    """
    if raw is None:
        return None
    # Exclude bool explicitly — bool is a subclass of int, so `int(True)` == 1
    # and would silently match sensor id 1. None of our protocol fields should
    # carry bool in the sensor_id slot.
    if isinstance(raw, bool):
        return None
    try:
        return int(raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


class ClientConnection:
    """Tracks a single WebSocket client."""

    __slots__ = ("ws", "client_id", "subscriptions", "last_stats", "on_unsubscribe")

    def __init__(
        self,
        ws: WebSocket,
        client_id: str,
        on_unsubscribe: Callable | None = None,
    ) -> None:
        self.ws = ws
        self.client_id = client_id
        self.subscriptions: set[int] = set()
        self.last_stats: dict | None = None
        self.on_unsubscribe = on_unsubscribe


class WebSocketBroadcaster:
    """Manages WebSocket connections and broadcasts sensor data."""

    def __init__(self) -> None:
        self._clients: dict[str, ClientConnection] = {}
        self._lock = asyncio.Lock()

    @property
    def client_count(self) -> int:
        return len(self._clients)

    def get_clients(self) -> dict[str, ClientConnection]:
        """Snapshot of live connections, keyed by client_id (read-only use)."""
        return dict(self._clients)

    # --- connection lifecycle ------------------------------------------------

    async def handle_connection(
        self,
        ws: WebSocket,
        on_subscribe: Callable | None = None,
        on_unsubscribe: Callable | None = None,
        on_set_rate: Callable | None = None,
    ) -> None:
        if len(self._clients) >= MAX_CLIENTS:
            await ws.close(code=1013, reason="Max clients reached")
            return

        await ws.accept()
        client_id = str(uuid.uuid4())[:8]
        conn = ClientConnection(ws, client_id, on_unsubscribe)

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
                    await self._handle_text_message(conn, raw, on_subscribe, on_unsubscribe, on_set_rate)
                elif isinstance(raw, bytes) and len(raw) >= 5:
                    await self._handle_binary_message(conn, raw, on_subscribe, on_unsubscribe, on_set_rate)
        except WebSocketDisconnect:
            pass
        except Exception as exc:
            logger.error("Client %s error: %s", client_id, exc)
        finally:
            await self._cleanup_connection(client_id, conn)

    # --- message handling ----------------------------------------------------

    async def _handle_text_message(
        self, conn: ClientConnection, text: str,
        on_subscribe: Callable | None,
        on_unsubscribe: Callable | None,
        on_set_rate: Callable | None = None,
    ) -> None:
        try:
            msg = json.loads(text)
        except json.JSONDecodeError:
            return
        # A valid JSON non-dict payload (e.g. `"42"` or `"[1,2,3]"`) would
        # crash msg.get(...) with AttributeError and propagate to
        # handle_connection's generic catch, dropping the client. Guard
        # the type up front — matches the binary handler's pattern.
        if not isinstance(msg, dict):
            return

        action = msg.get("action")
        sensor_id = _coerce_sensor_id(msg.get("sensor_id"))

        if action == "subscribe" and sensor_id is not None:
            conn.subscriptions.add(sensor_id)
            if on_subscribe:
                on_subscribe(sensor_id, conn.client_id)
        elif action == "unsubscribe" and sensor_id is not None:
            conn.subscriptions.discard(sensor_id)
            if on_unsubscribe:
                on_unsubscribe(sensor_id, conn.client_id)
        elif action == "stats":
            # Stamp arrival time so the adaptive loop can detect stale clients.
            msg.setdefault("_recv_ts", time.time())
            conn.last_stats = msg
        elif action == "set_rate" and sensor_id is not None:
            target = msg.get("target_fps")
            if target is None or on_set_rate is None:
                return
            try:
                applied = on_set_rate(sensor_id, conn.client_id, float(target))
            except (TypeError, ValueError) as exc:
                logger.debug("set_rate ignored for client %s: %s", conn.client_id, exc)
                return
            with contextlib.suppress(Exception):
                await conn.ws.send_text(json.dumps({
                    "type": "rate_ack",
                    "sensor_id": sensor_id,
                    "target_fps": applied,
                }))

    async def _handle_binary_message(
        self, conn: ClientConnection, data: bytes,
        on_subscribe: Callable | None,
        on_unsubscribe: Callable | None,
        on_set_rate: Callable | None = None,
    ) -> None:
        try:
            channel, payload = decode_frame(data)
        except ValueError:
            return
        if channel == Channel.SUBSCRIBE:
            try:
                msg = json.loads(payload)
            except json.JSONDecodeError:
                return
            # A malformed payload that's valid JSON but not a dict
            # (e.g. bare `42`) would crash msg.get(...) with
            # AttributeError and propagate out of the handler. Peer
            # branches (CLIENT_STATS, CONTROL) already guard on this
            # with isinstance — do the same here.
            if not isinstance(msg, dict):
                return
            sensor_id = _coerce_sensor_id(msg.get("sensor_id"))
            if sensor_id is not None:
                conn.subscriptions.add(sensor_id)
                if on_subscribe:
                    on_subscribe(sensor_id, conn.client_id)
        elif channel == Channel.UNSUBSCRIBE:
            try:
                msg = json.loads(payload)
            except json.JSONDecodeError:
                return
            if not isinstance(msg, dict):
                return
            sensor_id = _coerce_sensor_id(msg.get("sensor_id"))
            if sensor_id is not None:
                conn.subscriptions.discard(sensor_id)
                if on_unsubscribe:
                    on_unsubscribe(sensor_id, conn.client_id)
        elif channel == Channel.CLIENT_STATS:
            try:
                parsed = json.loads(payload)
                if isinstance(parsed, dict):
                    parsed.setdefault("_recv_ts", time.time())
                    conn.last_stats = parsed
            except (json.JSONDecodeError, IndexError):
                pass
        elif channel == Channel.CONTROL:
            try:
                msg = json.loads(payload)
            except (json.JSONDecodeError, IndexError):
                return
            if not isinstance(msg, dict):
                return
            if msg.get("action") != "set_rate" or on_set_rate is None:
                return
            sensor_id = _coerce_sensor_id(msg.get("sensor_id"))
            target = msg.get("target_fps")
            if sensor_id is None or target is None:
                return
            try:
                applied = on_set_rate(sensor_id, conn.client_id, float(target))
            except (TypeError, ValueError) as exc:
                logger.debug("binary set_rate ignored for client %s: %s", conn.client_id, exc)
                return
            try:
                ack = json.dumps({
                    "type": "rate_ack",
                    "sensor_id": sensor_id,
                    "target_fps": applied,
                }).encode("utf-8")
                await conn.ws.send_bytes(encode_frame(Channel.CONTROL, ack))
            except Exception:
                pass

    # --- broadcasting --------------------------------------------------------

    @staticmethod
    async def _send_one(conn: ClientConnection, data: bytes) -> None:
        await asyncio.wait_for(conn.ws.send_bytes(data), timeout=WS_SEND_TIMEOUT)

    async def _fanout(
        self, data: bytes, recipients: list[ClientConnection]
    ) -> None:
        if not recipients:
            return
        results = await asyncio.gather(
            *(self._send_one(conn, data) for conn in recipients),
            return_exceptions=True,
        )
        # Exception (not BaseException) — we do NOT want to treat
        # CancelledError / KeyboardInterrupt / SystemExit as "dead socket"
        # and evict the client. Those come from shutdown / task-level
        # cancellation and shouldn't nuke the client registry.
        stale = [
            conn.client_id
            for conn, result in zip(recipients, results, strict=True)
            if isinstance(result, Exception)
        ]
        await self._drop_clients(stale)

    async def broadcast_raw(self, data: bytes, target_clients: set[str] | None = None) -> None:
        """Send raw binary data to target clients (or all if None)."""
        clients = list(self._clients.values())
        if target_clients is None:
            recipients = clients
        else:
            recipients = [c for c in clients if c.client_id in target_clients]
        await self._fanout(data, recipients)

    async def broadcast_world_tick(self, tick_data: bytes) -> None:
        """Send world tick to ALL connected clients."""
        message = encode_frame(Channel.WORLD_TICK, tick_data)
        await self._fanout(message, list(self._clients.values()))

    async def _drop_clients(self, client_ids: list[str]) -> None:
        if not client_ids:
            return
        unique_ids = set(client_ids)
        for client_id in unique_ids:
            await self._cleanup_connection(client_id)

    async def _cleanup_connection(
        self,
        client_id: str,
        conn: ClientConnection | None = None,
    ) -> None:
        async with self._lock:
            removed = self._clients.pop(client_id, None)

        if removed is None and conn is None:
            return

        active_conn = removed or conn
        if active_conn is None:
            return

        if active_conn.on_unsubscribe:
            # Guard each callback so one failure doesn't skip the rest —
            # otherwise a sensor_manager.unsubscribe that raised (e.g. an
            # internal assertion, a carla_module late-import failure) would
            # leave later sids still in active_conn.subscriptions and the
            # ws.close() below un-run, orphaning the client's subscription
            # entries in sensor_manager._subscriptions forever.
            for sid in tuple(active_conn.subscriptions):
                try:
                    active_conn.on_unsubscribe(sid, client_id)
                except Exception as exc:
                    logger.warning(
                        "on_unsubscribe failed for client %s sensor %s: %s",
                        client_id, sid, exc,
                    )
                active_conn.subscriptions.discard(sid)

        with contextlib.suppress(Exception):
            await active_conn.ws.close()

        logger.info("Client %s disconnected (%d remain)", client_id, len(self._clients))


# Singleton
ws_broadcaster = WebSocketBroadcaster()
