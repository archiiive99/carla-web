"""Live load test for the sensor data plane (Agent A §4).

Connects M WebSocket clients to the running bridge, subscribes each to a
given set of sensors (or auto-discovers a vehicle camera + spawns a LIDAR),
optionally injects per-frame decode latency on a named "slow" client, and
records frame arrival times to CSV.

Usage:
    python -m tools.load_test_sensor_plane \
        --host 127.0.0.1 --port 58337 \
        --clients 3 --slow-client 1 --slow-delay 0.3 \
        --duration 60 --out out.csv

Produces:
  - <out>.csv — rows: client_id, sensor_id, frame, ts_recv
  - Printed summary per client: count, inter-arrival mean / stddev / p95,
    dropped frames (by sequence gap), and bridge RSS at t=0,30,60 s.

Dependencies: websockets, httpx, psutil (optional, only for RSS).
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import statistics
import struct
import subprocess
import sys
import time
import socket
from dataclasses import dataclass, field
from typing import Any

import httpx
import websockets

# Channel IDs (kept in sync with src/ws/channels.py).
CH_CAMERA = 0x01
CH_DEPTH = 0x02
CH_SEGMENTATION = 0x03
CH_LIDAR = 0x04
CH_SEMANTIC_LIDAR = 0x05
CH_WORLD_TICK = 0x10
SENSOR_CHANNELS = {CH_CAMERA, CH_DEPTH, CH_SEGMENTATION, CH_LIDAR, CH_SEMANTIC_LIDAR, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B}

CAMERA_HDR = struct.Struct("<IIIId")  # sensor_id, w, h, frame, ts
LIDAR_HDR = struct.Struct("<IIId")    # sensor_id, point_count, frame, ts
IMU_HDR = struct.Struct("<IId3f3ff")  # sensor_id, frame, ts, ax,ay,az, gx,gy,gz, compass
GNSS_HDR = struct.Struct("<IId3d")    # sensor_id, frame, ts, lat, lon, alt


@dataclass
class Arrival:
    client_id: str
    sensor_id: int
    frame: int
    ts_recv: float


@dataclass
class ClientStats:
    client_id: str
    slow: bool = False
    per_sensor: dict[int, list[Arrival]] = field(default_factory=dict)


def _parse_payload(channel: int, payload: bytes) -> tuple[int, int] | None:
    """Return (sensor_id, frame) for sensor channels, or None."""
    try:
        if channel in (CH_CAMERA, CH_DEPTH, CH_SEGMENTATION):
            sid, _w, _h, frame, _ts = CAMERA_HDR.unpack_from(payload, 0)
            return int(sid), int(frame)
        if channel in (CH_LIDAR, CH_SEMANTIC_LIDAR, 0x06, 0x0B):
            sid, _count, frame, _ts = LIDAR_HDR.unpack_from(payload, 0)
            return int(sid), int(frame)
        if channel == 0x07:
            sid, frame = IMU_HDR.unpack_from(payload, 0)[:2]
            return int(sid), int(frame)
        if channel == 0x08:
            sid, frame = GNSS_HDR.unpack_from(payload, 0)[:2]
            return int(sid), int(frame)
    except struct.error:
        return None
    return None


async def _run_client(
    uri: str,
    client_id: str,
    sensor_ids: list[int],
    slow_delay: float,
    duration: float,
    stats: ClientStats,
) -> None:
    async with websockets.connect(
        uri,
        max_size=64 * 1024 * 1024,
        max_queue=1,
        ping_interval=None,
    ) as ws:
        if slow_delay > 0:
            sock = ws.transport.get_extra_info("socket") if ws.transport else None
            if sock is not None:
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 1024)
        for sid in sensor_ids:
            await ws.send(json.dumps({"action": "subscribe", "sensor_id": sid}))
        deadline = time.perf_counter() + duration
        while time.perf_counter() < deadline:
            try:
                msg = await asyncio.wait_for(
                    ws.recv(), timeout=max(0.1, deadline - time.perf_counter())
                )
            except asyncio.TimeoutError:
                break
            if not isinstance(msg, (bytes, bytearray, memoryview)):
                continue
            ts_recv = time.perf_counter()
            data = bytes(msg)
            if len(data) < 5:
                continue
            channel = data[0]
            length = int.from_bytes(data[1:5], "little")
            if channel not in SENSOR_CHANNELS:
                continue
            payload = data[5 : 5 + length]
            parsed = _parse_payload(channel, payload)
            if parsed is None:
                continue
            sid, frame = parsed
            if sid not in sensor_ids:
                continue
            stats.per_sensor.setdefault(sid, []).append(
                Arrival(client_id, sid, frame, ts_recv)
            )
            if slow_delay > 0:
                await asyncio.sleep(slow_delay)


async def _discover_sensors(
    client: httpx.AsyncClient, base: str, want_camera: bool, want_lidar: bool
) -> list[int]:
    """Return sensor ids to subscribe to. Spawns missing ones on the default
    ego vehicle if needed (camera: reuse default; lidar: spawn fresh).
    """
    r = await client.get(f"{base}/health")
    r.raise_for_status()
    health = r.json()
    ego_id: int | None = None
    session = await (await client.get(f"{base}/api/realtime/session")).raise_for_status() \
        if False else await client.get(f"{base}/api/realtime/session")
    session.raise_for_status()
    sess = session.json()
    ego_id = sess.get("vehicle_id") or health.get("default_vehicle_id")
    cam_id = sess.get("camera_id") or health.get("default_camera_id")

    sensors: list[int] = []
    if want_camera and cam_id:
        sensors.append(int(cam_id))
    if want_lidar and ego_id:
        # Spawn a LIDAR attached to the ego.
        resp = await client.post(
            f"{base}/api/actors/spawn/sensor",
            json={
                "type": "sensor.lidar.ray_cast",
                "parent_id": int(ego_id),
                "transform": {"location": {"x": 0.0, "y": 0.0, "z": 2.4},
                              "rotation": {"pitch": 0, "yaw": 0, "roll": 0}},
                "attributes": {
                    "channels": 32,
                    "range": 50.0,
                    "points_per_second": 100000,
                    "rotation_frequency": 20,
                    "sensor_tick": 0.05,
                },
            },
            timeout=10.0,
        )
        if resp.status_code == 201:
            sensors.append(int(resp.json()["id"]))
        else:
            print(f"LIDAR spawn failed: {resp.status_code} {resp.text}", file=sys.stderr)
    return sensors


async def _spawn_measurement_rig(
    client: httpx.AsyncClient, base: str, *, with_lidar: bool
) -> tuple[list[int], list[int]]:
    """Spawn a dedicated vehicle + sensors for a repeatable measurement run."""
    world_resp = await client.get(f"{base}/api/world/spawn-points", timeout=10.0)
    world_resp.raise_for_status()
    spawn_points = world_resp.json().get("spawn_points") or []
    if not spawn_points:
        raise RuntimeError("No spawn points available for measurement rig")

    vehicle_resp = await client.post(
        f"{base}/api/actors/spawn/vehicle",
        json={
            "blueprint": "vehicle.lincoln.mkz",
            "transform": spawn_points[0],
            "autopilot": False,
        },
        timeout=10.0,
    )
    vehicle_resp.raise_for_status()
    vehicle_id = int(vehicle_resp.json()["id"])

    created_ids = [vehicle_id]
    sensor_ids: list[int] = []

    camera_resp = await client.post(
        f"{base}/api/actors/spawn/sensor",
        json={
                "type": "sensor.camera.rgb",
                "parent_id": vehicle_id,
                "transform": {
                    "location": {"x": 1.5, "y": 0.0, "z": 2.4},
                    "rotation": {"pitch": -8.0, "yaw": 0.0, "roll": 0.0},
                },
                "attributes": {
                    "image_size_x": 320,
                    "image_size_y": 180,
                    "fov": 100,
                    "sensor_tick": 0.05,
                },
        },
        timeout=10.0,
    )
    camera_resp.raise_for_status()
    camera_id = int(camera_resp.json()["id"])
    created_ids.append(camera_id)
    sensor_ids.append(camera_id)

    if with_lidar:
        lidar_resp = await client.post(
            f"{base}/api/actors/spawn/sensor",
            json={
                "type": "sensor.lidar.ray_cast",
                "parent_id": vehicle_id,
                "transform": {
                    "location": {"x": 0.0, "y": 0.0, "z": 2.4},
                    "rotation": {"pitch": 0.0, "yaw": 0.0, "roll": 0.0},
                },
                "attributes": {
                    "channels": 32,
                    "range": 50.0,
                    "points_per_second": 1000000,
                    "rotation_frequency": 20,
                    "sensor_tick": 0.05,
                },
            },
            timeout=10.0,
        )
        lidar_resp.raise_for_status()
        lidar_id = int(lidar_resp.json()["id"])
        created_ids.append(lidar_id)
        sensor_ids.append(lidar_id)

    return sensor_ids, created_ids


async def _destroy_actor(client: httpx.AsyncClient, base: str, actor_id: int) -> None:
    resp = await client.delete(f"{base}/api/actors/{actor_id}", timeout=10.0)
    if resp.status_code not in (200, 404):
        resp.raise_for_status()


def _rss_kb(pid: int) -> int | None:
    try:
        out = subprocess.check_output(["ps", "-o", "rss=", "-p", str(pid)], text=True)
        return int(out.strip())
    except (subprocess.CalledProcessError, ValueError):
        return None


def _bridge_pid(port: int) -> int | None:
    for cmd in (
        ["lsof", "-ti", f"tcp:{port}", "-sTCP:LISTEN"],
        ["fuser", f"{port}/tcp"],
    ):
        try:
            out = subprocess.check_output(cmd, text=True).split()
        except (FileNotFoundError, subprocess.CalledProcessError):
            continue
        for token in out:
            if token.isdigit():
                return int(token)
    return None


def _summarize(stats: ClientStats) -> dict[str, Any]:
    summary: dict[str, Any] = {"client_id": stats.client_id, "slow": stats.slow, "per_sensor": {}}
    for sid, arrivals in stats.per_sensor.items():
        if len(arrivals) < 2:
            continue
        arrivals.sort(key=lambda a: a.ts_recv)
        gaps = [b.ts_recv - a.ts_recv for a, b in zip(arrivals, arrivals[1:])]
        frames = [a.frame for a in arrivals]
        fmin, fmax = min(frames), max(frames)
        expected = fmax - fmin + 1
        dropped = max(0, expected - len(set(frames)))
        p95 = sorted(gaps)[int(0.95 * (len(gaps) - 1))] if gaps else 0.0
        summary["per_sensor"][sid] = {
            "n": len(arrivals),
            "mean_ms": statistics.mean(gaps) * 1000,
            "stdev_ms": statistics.stdev(gaps) * 1000 if len(gaps) > 1 else 0.0,
            "p95_ms": p95 * 1000,
            "dropped": dropped,
            "first_frame": fmin,
            "last_frame": fmax,
        }
    return summary


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=58337)
    ap.add_argument("--clients", type=int, default=3)
    ap.add_argument("--slow-client", type=int, default=-1,
                    help="0-based index of client to inject slow_delay on")
    ap.add_argument("--slow-delay", type=float, default=0.0)
    ap.add_argument("--duration", type=float, default=60.0)
    ap.add_argument("--out", default="load_test.csv")
    ap.add_argument("--sensor-ids", nargs="*", type=int, default=None,
                    help="Override auto-discovery; use these sensor ids")
    ap.add_argument("--with-lidar", action="store_true",
                    help="Spawn a LIDAR sensor on the ego (alongside camera)")
    ap.add_argument("--spawn-rig", action="store_true",
                    help="Spawn a dedicated vehicle+camera(+lidar) rig for this run")
    ap.add_argument("--bridge-pid", type=int, default=None,
                    help="Override bridge PID used for RSS sampling")
    args = ap.parse_args()

    base = f"http://{args.host}:{args.port}"
    uri = f"ws://{args.host}:{args.port}/ws"
    created_actor_ids: list[int] = []

    async with httpx.AsyncClient() as http:
        if args.sensor_ids:
            sensor_ids = list(args.sensor_ids)
        elif args.spawn_rig:
            sensor_ids, created_actor_ids = await _spawn_measurement_rig(
                http, base, with_lidar=args.with_lidar
            )
        else:
            sensor_ids = await _discover_sensors(
                http, base, want_camera=True, want_lidar=args.with_lidar
            )

    if not sensor_ids:
        print("No sensors to subscribe to. Aborting.", file=sys.stderr)
        sys.exit(2)
    print(f"Subscribing {args.clients} clients to sensors {sensor_ids}")

    pid = args.bridge_pid or _bridge_pid(args.port)
    if pid is None:
        print("WARN: could not find bridge PID; RSS sampling disabled", file=sys.stderr)

    rss_samples: list[tuple[float, int | None]] = []

    async def sampler():
        t0 = time.perf_counter()
        for target in (0.0, 30.0, args.duration):
            now = time.perf_counter() - t0
            if target > now:
                await asyncio.sleep(target - now)
            rss_samples.append((round(time.perf_counter() - t0, 2), _rss_kb(pid) if pid else None))

    stats_list: list[ClientStats] = [
        ClientStats(client_id=f"c{i}", slow=(i == args.slow_client))
        for i in range(args.clients)
    ]

    client_tasks = [
        asyncio.create_task(
            _run_client(
                uri,
                s.client_id,
                sensor_ids,
                args.slow_delay if s.slow else 0.0,
                args.duration,
                s,
            )
        )
        for s in stats_list
    ]
    sampler_task = asyncio.create_task(sampler())

    try:
        await asyncio.gather(*client_tasks, sampler_task, return_exceptions=False)
    finally:
        for t in client_tasks:
            if not t.done():
                t.cancel()
        async with httpx.AsyncClient() as http:
            for actor_id in reversed(created_actor_ids):
                try:
                    await _destroy_actor(http, base, actor_id)
                except Exception as exc:
                    print(f"WARN: cleanup failed for actor {actor_id}: {exc}", file=sys.stderr)

    # Dump CSV
    with open(args.out, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["client_id", "sensor_id", "frame", "ts_recv"])
        for s in stats_list:
            for arrivals in s.per_sensor.values():
                for a in arrivals:
                    w.writerow([a.client_id, a.sensor_id, a.frame, f"{a.ts_recv:.6f}"])

    # Summary
    print(f"\n--- scenario summary (out={args.out}) ---")
    for s in stats_list:
        summ = _summarize(s)
        tag = "SLOW" if s.slow else "fast"
        print(f"[{tag}] client={s.client_id}")
        for sid, stats_sensor in summ["per_sensor"].items():
            print(
                f"  sensor={sid}: n={stats_sensor['n']} "
                f"mean={stats_sensor['mean_ms']:.1f}ms "
                f"stdev={stats_sensor['stdev_ms']:.1f}ms "
                f"p95={stats_sensor['p95_ms']:.1f}ms "
                f"dropped={stats_sensor['dropped']} "
                f"frames=[{stats_sensor['first_frame']}..{stats_sensor['last_frame']}]"
            )
    print("RSS samples (t_s, rss_KB):")
    for t, rss in rss_samples:
        print(f"  t={t}  rss={rss}")


if __name__ == "__main__":
    asyncio.run(main())
