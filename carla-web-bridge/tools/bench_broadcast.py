"""Benchmark: sequential vs gather-based fan-out, and bounded sensor queues.

Run from repo root:
    cd carla-web-bridge && python -m tools.bench_broadcast

Exercises WebSocketBroadcaster._fanout and the SensorManager per-sensor queue
pattern in-process using mock clients — no CARLA / network required.
"""

from __future__ import annotations

import asyncio
import os
import resource
import statistics
import time
from dataclasses import dataclass
from typing import Callable

# Bridge imports
from src.config import WS_SEND_TIMEOUT  # noqa: E402
from src.ws_broadcaster import ClientConnection, WebSocketBroadcaster  # noqa: E402


@dataclass
class FakeWebSocket:
    client_id: str
    delay: float = 0.0
    received_at: list[float] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.received_at is None:
            self.received_at = []

    async def send_bytes(self, data: bytes) -> None:
        if self.delay > 0:
            await asyncio.sleep(self.delay)
        self.received_at.append(time.perf_counter())

    async def close(self) -> None:
        pass


def _make_conn(client_id: str, delay: float = 0.0) -> tuple[ClientConnection, FakeWebSocket]:
    fake = FakeWebSocket(client_id=client_id, delay=delay)
    conn = ClientConnection(ws=fake, client_id=client_id)  # type: ignore[arg-type]
    return conn, fake


async def _sequential_fanout(
    bcaster: WebSocketBroadcaster, data: bytes, recipients: list[ClientConnection]
) -> None:
    """Reimplementation of the old pre-A4 serialization for benchmarking."""
    stale: list[str] = []
    for conn in recipients:
        try:
            await asyncio.wait_for(conn.ws.send_bytes(data), timeout=WS_SEND_TIMEOUT)
        except Exception:
            stale.append(conn.client_id)
    await bcaster._drop_clients(stale)  # noqa: SLF001 — benchmark-only


async def _bench_fanout(
    label: str,
    fan: Callable,
    n_frames: int,
    slow_delays: list[float],
) -> tuple[float, float, float]:
    """Run n_frames fan-outs with 1 fast + len(slow_delays) slow clients.

    The fast client is always inserted LAST; slow clients are inserted
    first, which is the worst case for sequential iteration.
    Returns (mean_fanout_time, fast_send_mean, fast_send_stdev) in seconds.
    """
    bcaster = WebSocketBroadcaster()
    slow_conns: list[ClientConnection] = []
    for idx, d in enumerate(slow_delays):
        slow, _ = _make_conn(f"slow-{idx}-{label}", delay=d)
        bcaster._clients[slow.client_id] = slow  # noqa: SLF001
        slow_conns.append(slow)
    fast, fast_ws = _make_conn(f"fast-{label}", delay=0.0)
    bcaster._clients[fast.client_id] = fast  # noqa: SLF001
    recipients = slow_conns + [fast]

    fanout_times: list[float] = []
    fast_offsets: list[float] = []  # when fast got its bytes within the fan-out

    interval = 0.05
    start = time.perf_counter()
    for i in range(n_frames):
        target = start + (i + 1) * interval
        now = time.perf_counter()
        if target > now:
            await asyncio.sleep(target - now)
        t0 = time.perf_counter()
        prev_fast_arrivals = len(fast_ws.received_at)
        await fan(bcaster, f"frame-{i}".encode(), recipients)
        t1 = time.perf_counter()
        fanout_times.append(t1 - t0)
        if len(fast_ws.received_at) > prev_fast_arrivals:
            fast_offsets.append(fast_ws.received_at[-1] - t0)

    if len(fanout_times) < 3 or len(fast_offsets) < 3:
        return (float("nan"), float("nan"), float("nan"))
    mean_fanout = statistics.mean(fanout_times)
    mean_fast = statistics.mean(fast_offsets)
    std_fast = statistics.stdev(fast_offsets)
    print(
        f"[{label}] fanout_mean={mean_fanout*1000:.2f}ms  "
        f"fast_send_offset mean={mean_fast*1000:.2f}ms stdev={std_fast*1000:.2f}ms"
    )
    return mean_fanout, mean_fast, std_fast


async def bench_a4_hol_blocking() -> None:
    print("=== A4: Head-of-line blocking ===")
    # 2 slow clients (0.3s each) force sequential to sum delays (~0.6s) while
    # gather takes max (~0.3s). Fast client is inserted last.
    slow_delays = [0.3, 0.3]
    n_frames = 20

    mean_fo_seq, mean_off_seq, std_off_seq = await _bench_fanout(
        "sequential-pre-A4", _sequential_fanout, n_frames, slow_delays
    )

    async def gather_fan(bcaster, data, recipients):
        await bcaster._fanout(data, recipients)  # noqa: SLF001

    mean_fo_gth, mean_off_gth, std_off_gth = await _bench_fanout(
        "gather-post-A4", gather_fan, n_frames, slow_delays
    )

    ratio_stdev = (std_off_gth / std_off_seq) if std_off_seq else float("nan")
    print(
        f"SUMMARY A4:\n"
        f"  fan-out latency    before={mean_fo_seq*1000:.1f}ms  after={mean_fo_gth*1000:.1f}ms\n"
        f"  fast send offset   before={mean_off_seq*1000:.1f}ms  after={mean_off_gth*1000:.1f}ms\n"
        f"  fast send stdev    before={std_off_seq*1000:.1f}ms  after={std_off_gth*1000:.1f}ms  "
        f"ratio={ratio_stdev:.3f} (acceptance: after/before <=1.20)"
    )


async def bench_a1_queue_bounded() -> None:
    print("\n=== A1: Bounded queue under slow consumer — memory stays flat ===")
    # Simulate the SensorManager pattern: producer (CARLA callback) pushes at
    # 20 Hz, consumer is slow. Without drops, the queue would grow unbounded.
    from src.sensor_manager import SensorPacket, KIND_LIDAR  # noqa: E402
    from src.ws.channels import Channel  # noqa: E402

    queue: asyncio.Queue[SensorPacket] = asyncio.Queue(maxsize=1)
    dropped = 0
    delivered = 0

    async def consumer():
        nonlocal delivered
        while True:
            pkt = await queue.get()
            await asyncio.sleep(0.25)  # deliberately slow
            delivered += 1
            _ = pkt  # use

    consumer_task = asyncio.create_task(consumer())

    rss_samples: list[tuple[float, int]] = []
    page_size = resource.getpagesize() if hasattr(resource, "getpagesize") else 4096
    def rss_kb() -> int:
        usage = resource.getrusage(resource.RUSAGE_SELF)
        # ru_maxrss is KB on Linux.
        return int(usage.ru_maxrss)

    t0 = time.perf_counter()
    rss_samples.append((0.0, rss_kb()))
    # Producer: 20 Hz × 60 s = 1200 frames, each carries 1MB payload.
    payload = bytes(1024 * 1024)
    n_frames = 1200
    interval = 0.05
    for i in range(n_frames):
        target = t0 + (i + 1) * interval
        now = time.perf_counter()
        if target > now:
            await asyncio.sleep(target - now)

        pkt = SensorPacket(
            kind=KIND_LIDAR,
            sensor_id=1,
            channel=Channel.LIDAR,
            frame=i,
            timestamp=time.time(),
            subscribers={"x"},
            raw_data=payload,
        )
        # Simulate the drop-oldest behaviour of _enqueue_packet.
        if queue.full():
            try:
                queue.get_nowait()
                dropped += 1
            except asyncio.QueueEmpty:
                pass
        try:
            queue.put_nowait(pkt)
        except asyncio.QueueFull:
            dropped += 1

        elapsed = time.perf_counter() - t0
        if 29.9 < elapsed < 30.1 and len(rss_samples) == 1:
            rss_samples.append((elapsed, rss_kb()))
        if elapsed > 59.9 and len(rss_samples) == 2:
            rss_samples.append((elapsed, rss_kb()))

    consumer_task.cancel()
    try:
        await consumer_task
    except asyncio.CancelledError:
        pass

    print(f"frames produced: {n_frames}  delivered: {delivered}  dropped: {dropped}")
    for t, rss in rss_samples:
        print(f"  t={t:5.1f}s  RSS={rss} KB")
    deltas = [rss_samples[1][1] - rss_samples[0][1], rss_samples[-1][1] - rss_samples[0][1]]
    print(f"SUMMARY A1: RSS delta 0->30s = {deltas[0]} KB   0->60s = {deltas[1]} KB")


async def main() -> None:
    print(f"pid={os.getpid()}  WS_SEND_TIMEOUT={WS_SEND_TIMEOUT}s")
    await bench_a4_hol_blocking()
    await bench_a1_queue_bounded()


if __name__ == "__main__":
    asyncio.run(main())
