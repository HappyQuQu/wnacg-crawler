from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse

from backend.app.core.schemas import ApiResponse, LibraryDeleteRequest, LibrarySelectionRequest
from backend.app.services.library_service import library_service
from backend.app.services.task_runner import task_runner

router = APIRouter(prefix="/api/library", tags=["library"])


@router.get("", response_model=ApiResponse)
async def list_library(
    q: str | None = None,
    status: str | None = None,
    sort_by: str = "updated_at",
    sort_order: Literal["asc", "desc"] = "desc",
    zip_status: Literal["zipped", "unzipped"] | None = None,
):
    return ApiResponse(data=await library_service.list(
        q=q, status=status, sort_by=sort_by, sort_order=sort_order, zip_status=zip_status,
    ))


@router.get("/{manga_id}", response_model=ApiResponse)
async def get_library_item(manga_id: str):
    item = await library_service.get(manga_id)
    if item is None:
        raise HTTPException(status_code=404, detail="资料库项目不存在")
    return ApiResponse(data=item)


@router.post("/delete", response_model=ApiResponse)
async def delete_library_items(payload: LibraryDeleteRequest):
    return ApiResponse(data=await library_service.delete_many(
        payload.manga_ids, payload.delete_files,
    ))


@router.delete("/{manga_id}", response_model=ApiResponse)
async def delete_library_item(manga_id: str, delete_files: bool = False):
    try:
        await library_service.delete(manga_id, delete_files)
        return ApiResponse(data={"deleted": [manga_id], "delete_files": delete_files})
    except KeyError:
        raise HTTPException(status_code=404, detail="资料库项目不存在") from None
    except (ValueError, OSError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None


@router.post("/downloads", response_model=ApiResponse)
async def prepare_library_downloads(payload: LibrarySelectionRequest):
    return ApiResponse(data=await library_service.prepare_downloads(payload.manga_ids))


@router.get("/{manga_id}/download")
async def download_library_item(manga_id: str):
    try:
        path = await library_service.prepare_download(manga_id)
        return FileResponse(path, filename=path.name, media_type="application/zip")
    except KeyError:
        raise HTTPException(status_code=404, detail="资料库项目不存在") from None
    except (ValueError, OSError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None


@router.post("/{manga_id}/verify", response_model=ApiResponse)
async def verify_library_item(manga_id: str):
    item = await library_service.verify(manga_id)
    if item is None:
        raise HTTPException(status_code=404, detail="资料库项目不存在")
    return ApiResponse(data=item)


@router.post("/{manga_id}/zip", response_model=ApiResponse)
async def zip_library_item(manga_id: str, overwrite: bool = True):
    item = await library_service.zip(manga_id, overwrite=overwrite)
    if item is None:
        raise HTTPException(status_code=404, detail="资料库项目不存在")
    return ApiResponse(data=item)


@router.post("/{manga_id}/retry-failed", response_model=ApiResponse)
async def retry_failed_library_files(manga_id: str, background_tasks: BackgroundTasks):
    result = await library_service.create_failed_retry_task(manga_id)
    if result is None:
        raise HTTPException(status_code=404, detail="资料库项目不存在")
    task = result.get("task")
    if result["status"] == "queued" and task:
        background_tasks.add_task(task_runner.run_failed_images, task["task_id"])
    return ApiResponse(data=result)
