from fastapi import APIRouter, Query

from backend.app.core.schemas import ApiResponse
from backend.app.services.log_service import log_service

router = APIRouter(prefix="/api/logs", tags=["logs"])


@router.get("", response_model=ApiResponse)
async def list_logs(
    level: str | None = None,
    manga_id: str | None = None,
    task_id: str | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
):
    return ApiResponse(
        data=await log_service.list(level=level, manga_id=manga_id, task_id=task_id, limit=limit)
    )
