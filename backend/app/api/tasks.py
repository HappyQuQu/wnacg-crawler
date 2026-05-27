from fastapi import APIRouter, BackgroundTasks, HTTPException

from backend.app.core.schemas import (
    ApiResponse,
    BatchTaskCreateRequest,
    TaskCreateRequest,
    TaskRetryRequest,
)
from backend.app.services.task_runner import task_runner
from backend.app.services.task_service import InvalidTaskTransition, task_service

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("", response_model=ApiResponse)
async def list_tasks(status: str | None = None):
    return ApiResponse(data=await task_service.list(status=status))


@router.post("", response_model=ApiResponse)
async def create_task(payload: TaskCreateRequest, background_tasks: BackgroundTasks):
    task = await task_service.create(payload)
    _schedule_if_needed(task, background_tasks)
    return ApiResponse(data=task)


@router.post("/batch", response_model=ApiResponse)
async def create_tasks(payload: BatchTaskCreateRequest, background_tasks: BackgroundTasks):
    result = await task_service.create_batch(payload)
    task_ids = _schedulable_task_ids(result["created"])
    if task_ids:
        background_tasks.add_task(task_runner.run_many, task_ids)
    return ApiResponse(data=result)


@router.get("/{task_id}", response_model=ApiResponse)
async def get_task(task_id: str):
    task = await task_service.get(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    return ApiResponse(data=task)


@router.post("/{task_id}/pause", response_model=ApiResponse)
async def pause_task(task_id: str):
    try:
        task = await task_service.transition(task_id, "paused")
        await task_runner.broadcast_snapshot(task_id)
        return ApiResponse(data=task)
    except KeyError:
        raise HTTPException(status_code=404, detail="任务不存在") from None
    except InvalidTaskTransition as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None


@router.post("/{task_id}/resume", response_model=ApiResponse)
async def resume_task(task_id: str, background_tasks: BackgroundTasks):
    try:
        task = await task_service.transition(task_id, "queued")
        _schedule_if_needed(task, background_tasks)
        return ApiResponse(data=task)
    except KeyError:
        raise HTTPException(status_code=404, detail="任务不存在") from None
    except InvalidTaskTransition as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None


@router.post("/{task_id}/retry", response_model=ApiResponse)
async def retry_task(
    task_id: str,
    payload: TaskRetryRequest,
    background_tasks: BackgroundTasks,
):
    try:
        task = await task_service.retry(task_id, payload.scope)
        _schedule_if_needed(task, background_tasks)
        return ApiResponse(data=task)
    except KeyError:
        raise HTTPException(status_code=404, detail="任务不存在") from None
    except InvalidTaskTransition as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None


@router.post("/{task_id}/cancel", response_model=ApiResponse)
async def cancel_task(task_id: str):
    try:
        task = await task_service.transition(task_id, "cancelled")
        await task_runner.broadcast_snapshot(task_id)
        return ApiResponse(data=task)
    except KeyError:
        raise HTTPException(status_code=404, detail="任务不存在") from None
    except InvalidTaskTransition as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None


def _schedule_if_needed(task: dict, background_tasks: BackgroundTasks) -> None:
    if task.get("status") == "queued" and "dedupe_reason" not in task:
        background_tasks.add_task(task_runner.run, task["task_id"])


def _schedulable_task_ids(tasks: list[dict]) -> list[str]:
    return [
        task["task_id"]
        for task in tasks
        if task.get("status") == "queued" and "dedupe_reason" not in task
    ]
