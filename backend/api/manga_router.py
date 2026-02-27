import asyncio
from enum import Enum
from typing import Dict, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from backend.db.database import get_session_factory
from backend.db.repository import MangaRepository
from backend.service.manga_service import manga_service

router = APIRouter(prefix="/api")


class TaskStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    ERROR = "error"


# 内存任务状态表（生产场景可移至 DB）
_tasks: Dict[str, TaskStatus] = {}
_task_lock = asyncio.Lock()


class AddTaskRequest(BaseModel):
    manga_id: str


class TaskInfo(BaseModel):
    manga_id: str
    status: TaskStatus
    name: Optional[str] = None


@router.post("/tasks", summary="添加下载任务")
async def add_task(req: AddTaskRequest, background_tasks: BackgroundTasks):
    manga_id = req.manga_id.strip()
    if not manga_id:
        raise HTTPException(400, "manga_id 不能为空")

    async with _task_lock:
        if manga_id in _tasks and _tasks[manga_id] == TaskStatus.RUNNING:
            return {"status": "already_running", "manga_id": manga_id}
        _tasks[manga_id] = TaskStatus.QUEUED

    background_tasks.add_task(_run_task, manga_id)
    return {"status": "queued", "manga_id": manga_id}


async def _run_task(manga_id: str):
    from backend.api.ws_router import manager

    async with _task_lock:
        _tasks[manga_id] = TaskStatus.RUNNING

    async def broadcast(msg: dict):
        await manager.broadcast(msg)

    try:
        await manga_service.run(manga_id, broadcast)
        async with _task_lock:
            _tasks[manga_id] = TaskStatus.DONE
    except Exception as e:
        async with _task_lock:
            _tasks[manga_id] = TaskStatus.ERROR
        await manager.broadcast({"stage": "error", "manga_id": manga_id, "message": str(e)})


@router.get("/tasks", summary="获取所有任务状态")
async def list_tasks():
    session_factory = get_session_factory()
    result = []
    for manga_id, status in _tasks.items():
        name = None
        try:
            async with session_factory() as session:
                repo = MangaRepository(session)
                info = await repo.get_manga_info(manga_id)
                if info:
                    name = info.name
        except Exception:
            pass
        result.append({"manga_id": manga_id, "status": status, "name": name})
    return result


@router.delete("/tasks/{manga_id}", summary="从列表中移除任务记录")
async def remove_task(manga_id: str):
    async with _task_lock:
        if manga_id not in _tasks:
            raise HTTPException(404, "任务不存在")
        del _tasks[manga_id]
    return {"status": "removed", "manga_id": manga_id}


@router.get("/config", summary="获取当前配置")
async def get_config_api():
    from backend.config import get_config
    config = get_config()
    return config.model_dump()


@router.post("/config", summary="更新配置（立即生效）")
async def update_config_api(data: dict):
    import json
    from pathlib import Path
    from backend.config import reload_config
    from backend.crawler.downloader import downloader

    config_path = Path("/config/config.json")
    try:
        config_path.parent.mkdir(parents=True, exist_ok=True)
        test = config_path.parent / ".write_test"
        test.touch()
        test.unlink()
    except OSError:
        config_path = Path("./config/config.json")
        config_path.parent.mkdir(parents=True, exist_ok=True)

    config_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    # 热重载：无需重启服务
    reload_config()
    await downloader.reload()

    return {"status": "saved", "path": str(config_path)}
