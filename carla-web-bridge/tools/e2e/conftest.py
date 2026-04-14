"""Shared fixtures for the Agent E integration-test harness.

All tests attach to the already-running bridge + CARLA. The harness never
restarts anything. If the bridge is unreachable, tests fail fast (< 5 s)
rather than hanging.
"""
from __future__ import annotations

import asyncio
import logging
import os
import socket
import sys
import time
from pathlib import Path
from typing import Any, AsyncIterator, Awaitable, Callable

import httpx
import pytest
import pytest_asyncio

# Make the bridge source tree importable so tests can use the production
# decoder helpers (src.ws.protocol, src.ws.channels) per §3.3.
_BRIDGE_ROOT = Path(__file__).resolve().parents[2]
if str(_BRIDGE_ROOT) not in sys.path:
    sys.path.insert(0, str(_BRIDGE_ROOT))

logger = logging.getLogger("e2e")


def _read_bridge_port() -> int:
    """Read BRIDGE_PORT from src/config.py once when possible."""
    try:
        from src.config import BRIDGE_PORT  # noqa: WPS433

        return int(BRIDGE_PORT)
    except Exception:
        return int(os.environ.get("BRIDGE_PORT", "58337"))


def _bridge_host_from_env() -> str:
    return os.environ.get("BRIDGE_HOST_E2E", "127.0.0.1")


@pytest.fixture(scope="session")
def bridge_urls() -> dict[str, str]:
    """HTTP + WS base URLs for the running bridge."""
    host = _bridge_host_from_env()
    port = _read_bridge_port()
    ws_url = os.environ.get("BRIDGE_WS_URL_E2E", f"ws://{host}:{port}/ws")
    return {
        "http": f"http://{host}:{port}",
        "ws": ws_url,
        "host": host,
        "port": port,
    }


@pytest.fixture(scope="session", autouse=True)
def _fast_fail_if_bridge_down(bridge_urls: dict[str, str]) -> None:
    """§4.3: exit with a clear error within 5 s if the bridge isn't up."""
    with socket.socket() as s:
        s.settimeout(2.0)
        try:
            s.connect((bridge_urls["host"], bridge_urls["port"]))
        except (OSError, socket.timeout) as exc:
            pytest.exit(
                f"Bridge not reachable at {bridge_urls['http']}: {exc}. "
                "The no-restart contract forbids reviving it from this suite; "
                "restore the existing bridge supervisor/session first.",
                returncode=2,
            )


@pytest.fixture(scope="session")
def bridge_log_path() -> Path | None:
    """Best-effort bridge log path for ERROR-grep assertions (E7)."""
    candidates = [
        Path("/tmp/bridge.log"),
        _BRIDGE_ROOT / "supervisor.log",
        _BRIDGE_ROOT / "bridge.log",
        _BRIDGE_ROOT.parent / "supervisor.log",
        _BRIDGE_ROOT.parent / "bridge.log",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None




@pytest.fixture(scope="session", autouse=True)
def _fast_fail_if_carla_down(bridge_urls: dict[str, str]) -> None:
    """All E1-E8 scenarios require a live CARLA connection; fail fast if absent."""
    deadline = time.monotonic() + 5.0
    last_status: dict[str, Any] = {}
    while time.monotonic() < deadline:
        try:
            with httpx.Client(base_url=bridge_urls["http"], timeout=2.0) as client:
                resp = client.get("/health")
                if resp.status_code == 200:
                    last_status = resp.json()
                    if last_status.get("carla_connected"):
                        return
        except Exception:
            pass
        time.sleep(0.5)
    pytest.exit(
        f"CARLA not reachable through {bridge_urls['http']} within 5 s: {last_status}. "
        "The no-restart contract forbids reviving it from this suite; restore the existing runtime first.",
        returncode=2,
    )


@pytest_asyncio.fixture
async def http_client(bridge_urls: dict[str, str]) -> AsyncIterator[httpx.AsyncClient]:
    """Per-test async HTTP client with conservative timeouts.

    Contract wanted aiohttp, but this repo's bridge venv already ships httpx and
    not aiohttp. Reusing installed dependencies keeps the harness dependency-free.
    """
    timeout = httpx.Timeout(15.0, connect=5.0)
    async with httpx.AsyncClient(base_url=bridge_urls["http"], timeout=timeout) as client:
        yield client


@pytest.fixture
def ws_connect(bridge_urls: dict[str, str]) -> Callable[..., Awaitable[Any]]:
    """Per §3.2: helper that opens a WS connection with timeouts."""
    from tools.e2e.helpers import ws_connect as _ws_connect

    async def _connect(url: str | None = None, **kwargs: Any):
        return await _ws_connect(url or bridge_urls["ws"], **kwargs)

    return _connect


async def _fetch_actors(client: httpx.AsyncClient, *, timeout_s: float = 10.0) -> list[dict[str, Any]]:
    deadline = time.monotonic() + timeout_s
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            resp = await client.get("/api/actors")
            if resp.status_code == 200:
                return resp.json().get("actors", [])
            if resp.status_code in {503, 404}:
                await asyncio.sleep(0.5)
                continue
            resp.raise_for_status()
        except Exception as exc:
            last_error = exc
            await asyncio.sleep(0.5)
    if last_error is not None:
        raise last_error
    raise RuntimeError(f"/api/actors not available within {timeout_s}s")


async def _get_json_if_ok(client: httpx.AsyncClient, path: str) -> dict[str, Any] | None:
    try:
        resp = await client.get(path)
    except Exception:
        return None
    if resp.status_code != 200:
        return None
    body = resp.json()
    return body if isinstance(body, dict) else None


def _infer_managed_ids_from_actors(actors: list[dict[str, Any]]) -> set[int]:
    managed_ids: set[int] = set()
    bridge_ego = next((actor for actor in actors if actor.get("role_name") == "bridge_ego"), None)
    if bridge_ego is None:
        return managed_ids
    vehicle_id = int(bridge_ego["id"])
    managed_ids.add(vehicle_id)
    for actor in actors:
        if actor.get("parent_id") == vehicle_id and actor.get("type_id", "").startswith("sensor.camera."):
            managed_ids.add(int(actor["id"]))
    return managed_ids


async def fetch_session_snapshot(client: httpx.AsyncClient) -> dict[str, Any]:
    """Best-effort managed-session snapshot.

    The repo code defines `/api/realtime/session`, but the live bridge may lag the
    checkout. Fall back to `/health`, `/api/info`, then actor-role inference.
    """
    actors: list[dict[str, Any]] = []
    for path in ("/api/realtime/session", "/health", "/api/info"):
        body = await _get_json_if_ok(client, path)
        if body and any(key in body for key in ("default_vehicle_id", "default_camera_id", "session_ready")):
            if body.get("default_vehicle_id") is not None and body.get("default_camera_id") is not None:
                return body
            break

    try:
        actors = await _fetch_actors(client, timeout_s=5.0)
    except Exception:
        actors = []
    managed_ids = _infer_managed_ids_from_actors(actors)
    vehicle_id = next(iter([aid for aid in managed_ids if any(int(a["id"]) == aid and a.get("role_name") == "bridge_ego" for a in actors)]), None)
    if vehicle_id is None:
        bridge_ego = next((actor for actor in actors if actor.get("role_name") == "bridge_ego"), None)
        vehicle_id = int(bridge_ego["id"]) if bridge_ego else None
    camera_id = next((aid for aid in managed_ids if aid != vehicle_id), None)
    return {
        "default_vehicle_id": vehicle_id,
        "default_camera_id": camera_id,
        "session_armed": vehicle_id is not None,
        "camera_arm_ready": camera_id is not None,
        "session_ready": vehicle_id is not None and camera_id is not None,
        "state": "INFERRED_READY" if vehicle_id and camera_id else "INFERRED_PARTIAL",
    }


def _is_traffic_light(actor: dict[str, Any]) -> bool:
    type_id = actor.get("type_id", "")
    return "traffic_light" in type_id or type_id.startswith("traffic.")


async def _count_non_managed(client: httpx.AsyncClient) -> tuple[int, list[int]]:
    """Count non-managed, non-traffic actors. Returns (count, ids)."""
    actors = await _fetch_actors(client)
    snap = await fetch_session_snapshot(client)
    managed_ids = _infer_managed_ids_from_actors(actors)
    for key in ("default_vehicle_id", "default_camera_id"):
        value = snap.get(key)
        if value is not None:
            managed_ids.add(int(value))

    filtered = [
        actor
        for actor in actors
        if int(actor["id"]) not in managed_ids
        and actor.get("role_name") != "bridge_ego"
        and actor.get("parent_id") not in managed_ids
        and not _is_traffic_light(actor)
    ]
    return len(filtered), [int(actor["id"]) for actor in filtered]


@pytest_asyncio.fixture
async def clean_non_managed_actors(http_client: httpx.AsyncClient) -> AsyncIterator[dict[str, Any]]:
    """Pre-test: record non-managed actor count. Post-test: assert unchanged."""
    before_count, before_ids = await _count_non_managed(http_client)
    state: dict[str, Any] = {
        "before_count": before_count,
        "before_ids": set(before_ids),
        "skip_check": False,
    }
    yield state
    if state["skip_check"]:
        return
    await asyncio.sleep(0.5)
    after_count, after_ids = await _count_non_managed(http_client)
    after_set = set(after_ids)
    leaked = after_set - state["before_ids"]
    missing = state["before_ids"] - after_set
    if leaked:
        for actor_id in leaked:
            try:
                await http_client.delete(f"/api/actors/{actor_id}")
            except Exception:
                pass
        await asyncio.sleep(0.5)
        repaired_count, repaired_ids = await _count_non_managed(http_client)
        after_count, after_set = repaired_count, set(repaired_ids)
        leaked = after_set - state["before_ids"]
    assert not leaked, (
        f"Test leaked actors {sorted(leaked)} "
        f"(before={sorted(state['before_ids'])}, after={sorted(after_set)})"
    )
    if missing:
        logger.warning("pre-existing non-managed actors disappeared during test: %s", sorted(missing))
    assert after_count == before_count, f"non-managed actor count drifted {before_count} -> {after_count}"


@pytest_asyncio.fixture
async def weather_snapshot(http_client: httpx.AsyncClient) -> AsyncIterator[dict[str, Any]]:
    """Capture weather at entry, restore at exit. §0.3 item 6."""
    resp = await http_client.get("/api/world/weather")
    resp.raise_for_status()
    original = resp.json()
    yield original
    try:
        await http_client.post("/api/world/weather", json={"params": original})
    except Exception as exc:
        logger.warning("Failed to restore weather: %s", exc)


@pytest_asyncio.fixture
async def require_carla_connected(http_client: httpx.AsyncClient) -> None:
    """Skip the test if CARLA RPC is disconnected."""
    deadline = time.monotonic() + 10.0
    last_status: dict[str, Any] = {}
    while time.monotonic() < deadline:
        try:
            resp = await http_client.get("/health")
            last_status = resp.json()
            if last_status.get("carla_connected"):
                return
        except Exception:
            pass
        await asyncio.sleep(0.5)
    pytest.skip(f"CARLA not connected within 10 s: {last_status}")


@pytest_asyncio.fixture
async def require_managed_session(
    http_client: httpx.AsyncClient,
    require_carla_connected: None,
) -> dict[str, Any]:
    """Wait for the managed bridge_ego session to be discoverable."""
    deadline = time.monotonic() + 20.0
    last: dict[str, Any] = {}
    while time.monotonic() < deadline:
        last = await fetch_session_snapshot(http_client)
        if last.get("session_ready"):
            return last
        await asyncio.sleep(0.5)
    pytest.skip(f"Managed session not ready within 20 s: {last}")


@pytest_asyncio.fixture
async def session_snapshot(http_client: httpx.AsyncClient) -> dict[str, Any]:
    return await fetch_session_snapshot(http_client)


def pytest_runtest_logstart(nodeid, location):  # noqa: D401
    """Emit `--- Exx start ---` headers per §4.4."""
    tag = _scenario_tag(nodeid)
    logging.getLogger("e2e").info("--- %s start --- (%s)", tag, nodeid)


def pytest_runtest_logreport(report):  # noqa: D401
    if report.when != "call":
        return
    tag = _scenario_tag(report.nodeid)
    status = "PASS" if report.passed else ("SKIP" if report.skipped else "FAIL")
    logging.getLogger("e2e").info("--- %s end: %s in %.2f s ---", tag, status, report.duration)


def _scenario_tag(nodeid: str) -> str:
    for tag in ("e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8"):
        if f"test_{tag}_" in nodeid:
            return tag.upper()
    return "E?"
