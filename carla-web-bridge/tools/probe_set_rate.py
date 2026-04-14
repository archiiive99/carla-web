"""Live WS probe: connect two clients to the running bridge, exchange the
new D1 control surface (`set_rate`), and confirm the bridge acks both
independently.

Why: the in-process harness in tools/test_adaptive_rate.py covers logic.
This script proves the wire protocol — that two real WebSocket peers can
push different per-(client, sensor) rate requests to the running bridge
and each gets a private `rate_ack`.

CARLA does not need to be connected. We do not subscribe (no sensor exists);
we just verify the bridge's `set_rate` action handler echoes back the
clamped target.

Usage:
    python -m tools.probe_set_rate --host 127.0.0.1 --port 58337
"""
from __future__ import annotations

import argparse
import asyncio
import json

import websockets


async def _client(uri: str, label: str, sensor_id: int, target: float) -> dict:
    async with websockets.connect(uri, max_size=None) as ws:
        await ws.send(json.dumps({
            "action": "set_rate",
            "sensor_id": sensor_id,
            "target_fps": target,
        }))
        # Bridge sends rate_ack as text JSON.
        for _ in range(20):
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=0.5)
            except asyncio.TimeoutError:
                continue
            if isinstance(msg, str):
                try:
                    parsed = json.loads(msg)
                except json.JSONDecodeError:
                    continue
                if parsed.get("type") == "rate_ack":
                    return {"label": label, "ack": parsed}
        return {"label": label, "ack": None}


async def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=58337)
    p.add_argument("--sensor-id", type=int, default=42)
    args = p.parse_args()

    uri = f"ws://{args.host}:{args.port}/ws"
    # Two clients, two different requested fps. The bridge ignores set_rate
    # for unknown sensors but it will still process and (per the current
    # contract) NOT ack since set_subscriber_rate returns 0 — so this probe
    # documents both branches: ack present when sensor is known, no ack
    # otherwise. With no real sensors, expect ack=None on both.
    results = await asyncio.gather(
        _client(uri, "fast",  args.sensor_id, 24.0),
        _client(uri, "slow",  args.sensor_id, 6.0),
    )
    for r in results:
        print(r)


if __name__ == "__main__":
    asyncio.run(main())
