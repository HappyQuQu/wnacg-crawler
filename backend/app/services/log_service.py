import json
from typing import Any

from backend.app.core.time import local_isoformat
from backend.app.db.database import SessionLocal
from backend.app.db.models import AppLog
from backend.app.db.repository import LogRepository, TaskRepository


class LogService:
    async def write(
        self,
        level: str,
        event: str,
        message: str,
        manga_id: str = "",
        task_id: str = "",
        stage: str = "",
        details: dict[str, Any] | None = None,
    ) -> None:
        async with SessionLocal() as session:
            await LogRepository(session).create(
                level=level,
                event=event,
                message=message,
                manga_id=manga_id,
                task_id=task_id,
                stage=stage,
                details=json.dumps(details or {}, ensure_ascii=False),
            )

    async def list(
        self,
        level: str | None = None,
        manga_id: str | None = None,
        task_id: str | None = None,
        limit: int = 200,
    ) -> dict:
        async with SessionLocal() as session:
            rows = await LogRepository(session).list(
                level=level,
                manga_id=manga_id,
                task_id=task_id,
                limit=max(1, min(limit, 1000)),
            )
        items = [log_to_dict(row) for row in rows]
        return {"items": items, "total": len(items)}

    async def backfill_existing_failures(self) -> int:
        async with SessionLocal() as session:
            log_repo = LogRepository(session)
            tasks = await TaskRepository(session).list_failed_with_errors()
            if not tasks:
                return 0

            # Batch check which task_ids already have backfill logs
            task_ids = {task.id for task in tasks}
            existing_ids = await log_repo.existing_task_ids_for_event(
                "legacy_task_failure", task_ids
            )

            created = 0
            for task in tasks:
                if task.id in existing_ids:
                    continue
                await log_repo.create(
                    level="error",
                    event="legacy_task_failure",
                    message=task.last_error,
                    manga_id=task.manga_id,
                    task_id=task.id,
                    stage=task.stage,
                    details=json.dumps(
                        {
                            "source": "startup_backfill",
                            "status": task.status,
                            "progress_current": task.progress_current,
                            "progress_total": task.progress_total,
                            "retry_count": task.retry_count,
                        },
                        ensure_ascii=False,
                    ),
                )
                created += 1
            return created


def log_to_dict(row: AppLog) -> dict:
    try:
        details = json.loads(row.details) if row.details else {}
    except json.JSONDecodeError:
        details = {"raw": row.details}
    message = row.message.strip() if row.message else ""
    return {
        "id": row.id,
        "level": row.level,
        "event": row.event,
        "message": message or _fallback_message(row.event),
        "manga_id": row.manga_id or None,
        "task_id": row.task_id or None,
        "stage": row.stage or None,
        "details": details,
        "created_at": local_isoformat(row.created_at),
    }


def _fallback_message(event: str) -> str:
    label_map = {
        "task_failed": "任务失败，但异常没有返回文本",
        "retry_failed_images_failed": "问题图片修复失败，但异常没有返回文本",
        "image_download_failed": "图片下载失败，但异常没有返回文本",
        "problem_image_retry_failed": "问题图片重试失败，但异常没有返回文本",
    }
    return label_map.get(event, "无日志信息")


log_service = LogService()
