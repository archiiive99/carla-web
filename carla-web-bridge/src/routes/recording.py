"""Recording and replay endpoints."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException

from src.carla_client import carla_manager
from src.models.schemas import StartRecordingRequest, StartReplayRequest

router = APIRouter(prefix="/api", tags=["recording"])


def _require_connection() -> None:
    if not carla_manager.is_connected:
        raise HTTPException(status_code=503, detail="Not connected to CARLA server")


@router.post("/recording/start")
async def start_recording(req: StartRecordingRequest):
    _require_connection()

    def _start():
        try:
            carla_manager.client.start_recorder(req.filename)
            return {"status": "recording", "filename": req.filename}
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return await asyncio.to_thread(_start)


@router.post("/recording/stop")
async def stop_recording():
    _require_connection()

    def _stop():
        try:
            carla_manager.client.stop_recorder()
            return {"status": "stopped"}
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return await asyncio.to_thread(_stop)


@router.get("/recording/files")
async def list_recordings():
    _require_connection()

    def _list():
        result = carla_manager.client.show_recorder_file_info("", True)
        return {"recordings": result}

    return await asyncio.to_thread(_list)


@router.post("/replay/start")
async def start_replay(req: StartReplayRequest):
    _require_connection()

    def _start():
        carla_manager.client.replay_file(
            req.filename, req.start_time, req.duration, req.camera_id
        )
        return {"status": "replaying", "filename": req.filename}

    return await asyncio.to_thread(_start)


@router.post("/replay/stop")
async def stop_replay():
    _require_connection()

    def _stop():
        carla_manager.client.stop_replayer(True)
        return {"status": "stopped"}

    return await asyncio.to_thread(_stop)
