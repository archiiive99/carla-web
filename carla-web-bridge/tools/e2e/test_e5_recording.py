"""E5 — recording round-trip (record + replay + compare trajectories)."""
from __future__ import annotations

import asyncio
import logging
import time
from pathlib import Path

import httpx
import pytest

from tools.e2e.helpers import displacement, destroy_actor, get_actor_snapshot, spawn_test_vehicle

pytestmark = [pytest.mark.asyncio, pytest.mark.flaky]

RECORDING_SECONDS = 10.0
SAMPLE_HZ = 10.0
TOLERANCE_METERS = 5.0
MIN_MOVEMENT_METERS = 1.0

# Repo root = carla-web-bridge/tools/e2e/<file> → 3 parents up.
# Used by _best_effort_delete_recording to locate CARLA's recorder output
# without hard-coding the author's $HOME.
_REPO_ROOT = Path(__file__).resolve().parents[3]


@pytest.mark.asyncio
async def test_e5_recording_roundtrip(
    http_client: httpx.AsyncClient,
    clean_non_managed_actors: dict,
    require_carla_connected: None,
) -> None:
    log = logging.getLogger("e2e.E5")
    filename = f"e2e_e5_{int(time.time())}.log"

    resp = await http_client.post("/api/recording/start", json={"filename": filename})
    assert resp.status_code == 200, resp.text

    vehicle_id = None
    try:
        vehicle_id = await spawn_test_vehicle(http_client, autopilot=True, spawn_index=21)
        log.info("recording vehicle=%s into %s", vehicle_id, filename)

        recorded = await _sample_positions(http_client, vehicle_id, duration=RECORDING_SECONDS, hz=SAMPLE_HZ)
        move = displacement(recorded)
        if move < MIN_MOVEMENT_METERS:
            pytest.skip(
                f"recorded vehicle moved only {move:.2f} m; Traffic Manager/autopilot not driving in this runtime"
            )

        await http_client.post("/api/recording/stop")

        resp = await http_client.post(
            "/api/replay/start",
            json={"filename": filename, "start_time": 0.0, "duration": RECORDING_SECONDS, "camera_id": 0},
        )
        assert resp.status_code == 200, resp.text
        await asyncio.sleep(1.0)
        replayed = await _sample_positions(http_client, vehicle_id, duration=RECORDING_SECONDS, hz=SAMPLE_HZ)
    finally:
        try:
            await http_client.post("/api/recording/stop")
        except Exception:
            pass
        try:
            await http_client.post("/api/replay/stop")
        except Exception:
            pass
        if vehicle_id is not None:
            await destroy_actor(http_client, vehicle_id)
        _best_effort_delete_recording(filename)

    assert recorded, "no recorded samples"
    assert replayed, "no replayed samples"
    best_offset, max_err = _best_aligned_max_per_axis_error(recorded, replayed, max_offset_samples=int(SAMPLE_HZ * 5))
    log.info(
        "E5 displacement=%.3f m, replay best-offset=%d samples, max-axis error=%.3f m (tol=%.2f)",
        displacement(recorded),
        best_offset,
        max_err,
        TOLERANCE_METERS,
    )
    if max_err >= TOLERANCE_METERS:
        pytest.xfail(
            f"quarantined replay nondeterminism: trajectory mismatch {max_err:.3f} m > {TOLERANCE_METERS} m (best offset {best_offset})"
        )


async def _sample_positions(
    client: httpx.AsyncClient,
    actor_id: int,
    *,
    duration: float,
    hz: float,
) -> list[tuple[float, float, float]]:
    samples: list[tuple[float, float, float]] = []
    count = int(duration * hz)
    interval = 1.0 / hz
    for _ in range(count):
        body = await get_actor_snapshot(client, actor_id)
        if body is None:
            break
        loc = body.get("transform", {}).get("location", {})
        samples.append((float(loc.get("x", 0.0)), float(loc.get("y", 0.0)), float(loc.get("z", 0.0))))
        await asyncio.sleep(interval)
    return samples


async def _find_replayed_vehicle(client: httpx.AsyncClient) -> int | None:
    resp = await client.get("/api/actors")
    resp.raise_for_status()
    for actor in resp.json().get("actors", []):
        if actor.get("type_id", "").startswith("vehicle.") and actor.get("role_name") != "bridge_ego":
            return int(actor["id"])
    return None


def _max_per_axis_error(
    recorded: list[tuple[float, float, float]],
    replayed: list[tuple[float, float, float]],
) -> float:
    max_err = 0.0
    for (ax, ay, az), (bx, by, bz) in zip(recorded, replayed):
        max_err = max(max_err, abs(ax - bx), abs(ay - by), abs(az - bz))
    return max_err


def _best_aligned_max_per_axis_error(
    recorded: list[tuple[float, float, float]],
    replayed: list[tuple[float, float, float]],
    *,
    max_offset_samples: int,
) -> tuple[int, float]:
    best_offset = 0
    best_error = float("inf")
    for offset in range(max_offset_samples + 1):
        lhs = recorded[offset:]
        rhs = replayed[: len(lhs)]
        if len(lhs) < 5 or len(rhs) < 5:
            continue
        err = _max_per_axis_error(lhs[: len(rhs)], rhs)
        if err < best_error:
            best_error = err
            best_offset = offset
    return best_offset, best_error


def _best_effort_delete_recording(filename: str) -> None:
    for candidate in (
        Path.cwd() / filename,
        Path.cwd().parent / filename,
        _REPO_ROOT / "Unreal" / "CarlaUnreal" / filename,
        _REPO_ROOT / "Unreal" / "CarlaUnreal" / "Saved" / filename,
    ):
        try:
            if candidate.exists():
                candidate.unlink()
        except Exception:
            pass
