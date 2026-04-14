"""E1 — spawn -> list -> destroy -> list (leak invariant)."""
from __future__ import annotations

import logging

import httpx
import pytest

from tools.e2e.helpers import get_vehicle_blueprint, spawn_test_vehicle, wait_for_actor_presence

pytestmark = pytest.mark.asyncio


@pytest.mark.asyncio
async def test_e1_actor_lifecycle(
    http_client: httpx.AsyncClient,
    clean_non_managed_actors: dict,
    require_carla_connected: None,
) -> None:
    log = logging.getLogger("e2e.E1")
    blueprint = await get_vehicle_blueprint(http_client)

    actor_id = await spawn_test_vehicle(http_client, blueprint=blueprint, spawn_index=11)
    log.info("spawned actor id=%s blueprint=%s", actor_id, blueprint)

    actor = await wait_for_actor_presence(http_client, actor_id, present=True, timeout=5.0)
    assert actor is not None
    assert int(actor["id"]) == actor_id

    resp = await http_client.delete(f"/api/actors/{actor_id}")
    assert resp.status_code == 200, f"destroy status {resp.status_code}: {resp.text}"

    await wait_for_actor_presence(http_client, actor_id, present=False, timeout=5.0)
