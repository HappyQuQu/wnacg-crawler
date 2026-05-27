import re

from backend.app.core.config import get_settings
from backend.app.db.database import SessionLocal
from backend.app.db.repository import MangaRepository, TaskRepository

ID_RE = re.compile(r"^\d+$")
AID_RE = re.compile(r"aid-(\d+)")


class InputService:
    async def parse(self, text: str, source: str = "manual") -> dict:
        raw_parts = [part.strip() for part in re.split(r"[\s,，]+", text) if part.strip()]
        seen: set[str] = set()
        items: list[dict] = []
        duplicate = 0
        invalid = 0

        async with SessionLocal() as session:
            manga_repo = MangaRepository(session)
            task_repo = TaskRepository(session)
            for raw in raw_parts:
                manga_id = self._extract_id(raw)
                if not manga_id:
                    invalid += 1
                    items.append(
                        {
                            "raw": raw,
                            "manga_id": None,
                            "valid": False,
                            "status": "invalid",
                            "source": source,
                        }
                    )
                    continue
                if manga_id in seen:
                    duplicate += 1
                    continue
                seen.add(manga_id)
                info = await manga_repo.get_info(manga_id)
                task = await task_repo.latest_for_manga(manga_id)
                manga_status = info.status if info else None
                task_status = task.status if task else None
                status = self._local_status(manga_status, task_status)
                items.append(
                    {
                        "raw": raw,
                        "manga_id": manga_id,
                        "url": get_settings().manga_page_url.format(page=1, aid=manga_id),
                        "valid": True,
                        "status": status,
                        "title": info.title if info else "",
                        "cover_url": info.cover_url if info else "",
                        "page_count": info.page_count if info else 0,
                        "pic_count": info.pic_count if info else 0,
                        "source": source,
                        "task_id": task.id if task else None,
                        "local": {
                            "exists": info is not None or task is not None,
                            "completed": status == "exists",
                            "valid_files": 0,
                            "total_files": info.pic_count if info else 0,
                        },
                    }
                )

        return {
            "items": items,
            "summary": {
                "total": len(raw_parts),
                "valid": len([item for item in items if item.get("valid")]),
                "duplicate": duplicate,
                "invalid": invalid,
            },
        }

    def _extract_id(self, value: str) -> str | None:
        if ID_RE.match(value):
            return value
        match = AID_RE.search(value)
        if match:
            return match.group(1)
        return None

    def _local_status(self, manga_status: str | None, task_status: str | None) -> str:
        if task_status in {"pending", "queued", "running", "paused"}:
            return "running"
        if task_status == "partial" or manga_status == "partial":
            return "partial"
        if task_status == "failed" or manga_status == "failed":
            return "failed"
        if task_status == "completed" or manga_status == "completed":
            return "exists"
        return "ready"


input_service = InputService()
