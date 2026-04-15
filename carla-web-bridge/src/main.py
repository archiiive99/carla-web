"""CARLA Web Bridge — FastAPI entry point."""

from __future__ import annotations

import asyncio
import logging
import os
import time

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from src.adaptive_rate import AdaptiveRateController
from src.carla_client import carla_manager
from src.config import BRIDGE_HOST, BRIDGE_PORT, CORS_ORIGINS, WORLD_TICK_INTERVAL
from src.control_helpers import apply_vehicle_control
from src.models.schemas import VehicleControl
from src.realtime_session import RealtimeSessionManager
from src.sensor_manager import SensorManager
from src.ws_broadcaster import ws_broadcaster

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def _is_test_mode() -> bool:
    return os.getenv("CARLA_WEB_BRIDGE_TESTING") in {"1", "true", "yes"} or os.getenv("PYTEST_CURRENT_TEST") is not None

# Global sensor manager (needs references to carla_manager and ws_broadcaster)
sensor_manager = SensorManager(carla_manager, ws_broadcaster)
realtime_session = RealtimeSessionManager(carla_manager, sensor_manager)
adaptive_controller = AdaptiveRateController(sensor_manager, ws_broadcaster)


_tick_task: asyncio.Task | None = None


async def _world_tick_loop() -> None:
    """Drive the CARLA simulation and broadcast tick metadata.

    CARLA runs in synchronous mode with fixed_delta_seconds=0.05 (20 FPS).
    We must call world.tick() each cycle to advance the physics simulation.
    Without this, vehicles don't move and the world is frozen.
    """
    from src.utils.serialization import encode_world_tick

    while True:
        await asyncio.sleep(WORLD_TICK_INTERVAL)
        if not carla_manager.is_connected:
            continue
        try:
            def _tick_and_get_data():
                world = carla_manager.world
                # Advance the simulation one step (required for sync mode)
                world.tick()
                snapshot = world.get_snapshot()
                # Include ego vehicle snapshot for real-time camera following
                actors = []
                ego_id = realtime_session.default_vehicle_id
                if ego_id is not None:
                    ego_snap = snapshot.find(ego_id)
                    if ego_snap is not None:
                        actors.append(ego_snap)
                return encode_world_tick(
                    snapshot.frame,
                    snapshot.elapsed_seconds,
                    actors,
                )
            tick_data = await asyncio.to_thread(_tick_and_get_data)
            if ws_broadcaster.client_count > 0:
                await ws_broadcaster.broadcast_world_tick(tick_data)
        except Exception as exc:
            logger.debug("World tick error: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: connect to CARLA. Shutdown: cleanup."""
    global _tick_task
    logger.info("CARLA Web Bridge starting…")
    sensor_manager.set_loop(asyncio.get_running_loop())
    if _is_test_mode():
        logger.info("CARLA Web Bridge test mode: skipping background CARLA connect/tick tasks")
        yield
        logger.info("CARLA Web Bridge test mode stopped.")
        return
    adaptive_controller.start()

    # Start CARLA connection in background (non-blocking)
    connect_task = asyncio.create_task(carla_manager.connect())
    _tick_task = asyncio.create_task(_world_tick_loop())

    yield

    # Shutdown
    logger.info("Shutting down…")
    adaptive_controller.stop()
    if _tick_task:
        _tick_task.cancel()
        try:
            await _tick_task
        except asyncio.CancelledError:
            pass
    connect_task.cancel()
    # Hot reload must not tear down live CARLA actors. The next bridge worker
    # rehydrates existing sensors/actors from the running simulator.
    await carla_manager.disconnect()
    logger.info("CARLA Web Bridge stopped.")


app = FastAPI(
    title="CARLA Web Bridge",
    description="REST API and WebSocket bridge for the CARLA simulator",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=3600,
)

app.add_middleware(GZipMiddleware, minimum_size=1000)

# Register REST API routes
from src.routes.simulation import router as simulation_router
from src.routes.world import router as world_router
from src.routes.actors import router as actors_router
from src.routes.sensors import router as sensors_router
from src.routes.traffic import router as traffic_router
from src.routes.blueprints import router as blueprints_router
from src.routes.recording import router as recording_router
from src.routes.navigation import router as navigation_router

app.include_router(simulation_router)
app.include_router(world_router)
app.include_router(actors_router)
app.include_router(sensors_router)
app.include_router(traffic_router)
app.include_router(blueprints_router)
app.include_router(recording_router)
app.include_router(navigation_router)

# Register WebSocket endpoint
from src.ws.handler import router as ws_router

app.include_router(ws_router)


@app.middleware("http")
async def log_requests(request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = (time.time() - start) * 1000
    if request.url.path != "/health":
        logger.info(f"{request.method} {request.url.path} → {response.status_code} ({duration:.0f}ms)")
    return response


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "carla_connected": carla_manager.is_connected,
        "ws_clients": ws_broadcaster.client_count,
        "active_sensors": len(sensor_manager.get_sensor_ids()),
        **realtime_session.snapshot(),
    }


@app.get("/api/realtime/session")
async def get_realtime_session():
    if carla_manager.is_connected:
        realtime_session.arm()
        try:
            await realtime_session.ensure_running()
        except Exception as exc:
            logger.warning("Realtime session request failed softly: %s", exc)
    return realtime_session.snapshot()


@app.post("/api/realtime/control")
async def apply_realtime_control(req: VehicleControl):
    if not carla_manager.is_connected:
        raise HTTPException(status_code=503, detail="Not connected to CARLA server")

    vehicle_id = realtime_session.default_vehicle_id
    if vehicle_id is None:
        raise HTTPException(status_code=409, detail="Managed ego vehicle is not ready")

    def _ctrl():
        try:
            import carla

            actor = carla_manager.world.get_actor(vehicle_id)
            if actor is None:
                raise HTTPException(status_code=404, detail=f"Managed ego vehicle {vehicle_id} not found")
            apply_vehicle_control(actor, req, carla)
            return {"status": "control_applied", "id": vehicle_id, "managed_ego": True}
        except HTTPException:
            raise
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return await asyncio.to_thread(_ctrl)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host=BRIDGE_HOST,
        port=BRIDGE_PORT,
        reload=True,
    )
