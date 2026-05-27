from fastapi import APIRouter, BackgroundTasks, Depends

from backend.app.core.schemas import (
    ApiResponse,
    ExtensionSubmitManyRequest,
    ExtensionSubmitRequest,
)
from backend.app.core.security import require_extension_token
from backend.app.services.task_runner import task_runner
from backend.app.services.task_service import task_service

router = APIRouter(prefix="/api/extension", tags=["extension"])


@router.get("/status", response_model=ApiResponse)
async def extension_status(_: None = Depends(require_extension_token)):
    return ApiResponse(
        data={
            "connected": True,
            "paired": True,
            "server": "WNACG Downloader",
            "version": "2.0.0-dev",
        }
    )


@router.post("/submit", response_model=ApiResponse)
async def submit_from_extension(
    payload: ExtensionSubmitRequest,
    background_tasks: BackgroundTasks,
    _: None = Depends(require_extension_token),
):
    task = await task_service.create_from_extension(payload)
    if task.get("status") == "queued" and "dedupe_reason" not in task:
        background_tasks.add_task(task_runner.run, task["task_id"])
    return ApiResponse(data=task)


@router.post("/submit-many", response_model=ApiResponse)
async def submit_many_from_extension(
    payload: ExtensionSubmitManyRequest,
    background_tasks: BackgroundTasks,
    _: None = Depends(require_extension_token),
):
    result = await task_service.create_many_from_extension(payload)
    task_ids = [task["task_id"] for task in result["created"] if task.get("status") == "queued"]
    if task_ids:
        background_tasks.add_task(task_runner.run_many, task_ids)
    return ApiResponse(data=result)


@router.get("/item/{manga_id}", response_model=ApiResponse)
async def extension_item_status(
    manga_id: str,
    _: None = Depends(require_extension_token),
):
    return ApiResponse(data=await task_service.item_status(manga_id))
