"""CARLA Web Bridge — FastAPI entry point."""

from __future__ import annotations

import asyncio
import logging
import time

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from src.carla_client import carla_manager
from src.config import BRIDGE_HOST, BRIDGE_PORT, CORS_ORIGINS
from src.sensor_manager import SensorManager
from src.ws_broadcaster import ws_broadcaster

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Global sensor manager (needs references to carla_manager and ws_broadcaster)
sensor_manager = SensorManager(carla_manager, ws_broadcaster)


_tick_task: asyncio.Task | None = None


async def _world_tick_loop() -> None:
    """Broadcast all actor transforms every tick when connected."""
    from src.utils.serialization import encode_world_tick

    while True:
        await asyncio.sleep(0.05)  # 20Hz
        if not carla_manager.is_connected or ws_broadcaster.client_count == 0:
            continue
        try:
            def _get_tick_data():
                world = carla_manager.world
                snapshot = world.get_snapshot()
                actors = world.get_actors()
                return encode_world_tick(
                    snapshot.frame,
                    snapshot.elapsed_seconds,
                    list(actors),
                )
            tick_data = await asyncio.to_thread(_get_tick_data)
            await ws_broadcaster.broadcast_world_tick(tick_data)
        except Exception as exc:
            logger.debug("World tick error: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: connect to CARLA. Shutdown: cleanup."""
    global _tick_task
    logger.info("CARLA Web Bridge starting…")
    sensor_manager.set_loop(asyncio.get_running_loop())

    # Start CARLA connection in background (non-blocking)
    connect_task = asyncio.create_task(carla_manager.connect())
    _tick_task = asyncio.create_task(_world_tick_loop())

    yield

    # Shutdown
    logger.info("Shutting down…")
    if _tick_task:
        _tick_task.cancel()
        try:
            await _tick_task
        except asyncio.CancelledError:
            pass
    connect_task.cancel()
    await sensor_manager.destroy_all()
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
    }


@app.get("/api/info")
async def get_info():
    return {
        "bridge_version": "0.1.0",
        "carla_connected": carla_manager.is_connected,
        "carla_version": carla_manager.client.get_server_version() if carla_manager.is_connected else None,
        "active_sensors": len(sensor_manager.get_sensor_ids()),
        "ws_clients": ws_broadcaster.client_count,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host=BRIDGE_HOST,
        port=BRIDGE_PORT,
        reload=True,
    )
