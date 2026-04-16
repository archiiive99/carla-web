"""Recording and replay endpoints."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

from src.carla_client import carla_manager
from src.models.schemas import StartRecordingRequest, StartReplayRequest

router = APIRouter(prefix="/api", tags=["recording"])
_recording_history: list[str] = []


def _require_connection() -> None:
    if not carla_manager.is_connected:
        raise HTTPException(status_code=503, detail="Not connected to CARLA server")


@router.post("/recording/start")
async def start_recording(req: StartRecordingRequest) -> Any:
    _require_connection()

    def _start() -> dict[str, Any]:
        try:
            carla_manager.client.start_recorder(req.filename)
            if req.filename not in _recording_history:
                _recording_history.insert(0, req.filename)
            return {"status": "recording", "filename": req.filename}
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return await asyncio.to_thread(_start)


@router.post("/recording/stop")
async def stop_recording() -> Any:
    _require_connection()

    def _stop() -> dict[str, Any]:
        try:
            carla_manager.client.stop_recorder()
            return {"status": "stopped"}
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return await asyncio.to_thread(_stop)


@router.get("/recording/files")
async def list_recordings() -> Any:
    _require_connection()

    def _list() -> dict[str, Any]:
        cwd = Path.cwd()
        disk_files = sorted(
            {
                path.name
                for path in cwd.rglob("*.log")
                if path.is_file()
            },
            reverse=True,
        )
        merged = []
        for filename in [*_recording_history, *disk_files]:
            if filename not in merged:
                merged.append(filename)
        return {"recordings": merged}

    return await asyncio.to_thread(_list)


@router.post("/replay/start")
async def start_replay(req: StartReplayRequest) -> Any:
    _require_connection()

    def _start() -> dict[str, Any]:
        try:
            carla_manager.client.replay_file(
                req.filename, req.start_time, req.duration, req.camera_id
            )
            return {"status": "replaying", "filename": req.filename}
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return await asyncio.to_thread(_start)


@router.post("/replay/stop")
async def stop_replay() -> Any:
    _require_connection()

    def _stop() -> dict[str, Any]:
        try:
            carla_manager.client.stop_replayer(True)
            return {"status": "stopped"}
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return await asyncio.to_thread(_stop)
