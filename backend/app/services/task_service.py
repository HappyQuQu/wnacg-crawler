from backend.app.core.schemas import (
    BatchTaskCreateRequest,
    BatchTaskItem,
    ExtensionSubmitManyRequest,
    ExtensionSubmitRequest,
    TaskCreateRequest,
)
from backend.app.db.database import SessionLocal
from backend.app.db.repository import MangaRepository, TaskRepository, task_to_dict

LEGAL_TRANSITIONS = {
    "pending": {"queued", "cancelled"},
    "queued": {"running", "paused", "cancelled"},
    "running": {"paused", "cancelled", "completed", "partial", "failed"},
    "paused": {"queued", "cancelled"},
    "failed": set(),
    "partial": set(),
    "completed": set(),
    "cancelled": set(),
}

RETRYABLE_STATUSES = {"failed", "partial", "completed", "cancelled"}


class InvalidTaskTransition(ValueError):
    def __init__(self, task_id: str, current: str, target: str) -> None:
        super().__init__(f"Invalid task transition: {task_id} {current} -> {target}")
        self.task_id = task_id
        self.current = current
        self.target = target


class TaskService:
    async def list(self, status: str | None = None) -> dict:
        async with SessionLocal() as session:
            repo = TaskRepository(session)
            tasks = await repo.list(status=status)
            items = [task_to_dict(task) for task in tasks]

            manga_ids = {t.manga_id for t in tasks}
            if manga_ids:
                manga_repo = MangaRepository(session)
                title_map: dict[str, str] = {}
                cover_map: dict[str, str] = {}
                for info in await manga_repo.list_infos():
                    if info.id in manga_ids:
                        title_map[info.id] = info.title
                        cover_map[info.id] = info.cover_url
                for item in items:
                    mid = item["manga_id"]
                    if mid in title_map:
                        item["title"] = title_map[mid]
                    if mid in cover_map:
                        item["cover_url"] = cover_map[mid]

            return {"items": items, "total": len(items)}

    async def get(self, task_id: str) -> dict | None:
        async with SessionLocal() as session:
            repo = TaskRepository(session)
            task = await repo.get(task_id)
            return task_to_dict(task) if task else None

    async def create(self, payload: TaskCreateRequest) -> dict:
        status = "queued" if payload.start_immediately else "pending"
        async with SessionLocal() as session:
            repo = TaskRepository(session)
            existing = await repo.active_for_manga(payload.manga_id)
            if existing:
                result = task_to_dict(existing)
                result["dedupe_reason"] = "already_active"
                return result
            task = await repo.create(payload.manga_id, payload.source, status)
            return task_to_dict(task)

    async def create_batch(self, payload: BatchTaskCreateRequest) -> dict:
        created = []
        skipped = []
        seen: set[str] = set()
        status = "queued" if payload.start_immediately else "pending"
        async with SessionLocal() as session:
            repo = TaskRepository(session)
            for item in payload.items:
                if payload.dedupe and item.manga_id in seen:
                    skipped.append({"manga_id": item.manga_id, "reason": "duplicate"})
                    continue
                seen.add(item.manga_id)
                existing = await repo.active_for_manga(item.manga_id)
                if existing:
                    skipped.append(
                        {
                            "manga_id": item.manga_id,
                            "reason": "already_active",
                            "task_id": existing.id,
                            "status": existing.status,
                        }
                    )
                    continue
                task = await repo.create(item.manga_id, payload.source, status)
                created.append(task_to_dict(task))
        return {"created": created, "skipped": skipped}

    async def create_from_extension(self, payload: ExtensionSubmitRequest) -> dict:
        request = TaskCreateRequest(
            manga_id=payload.manga_id,
            source="extension",
            start_immediately=True,
        )
        task = await self.create(request)
        task["title_hint"] = payload.title_hint
        task["url"] = payload.url
        return task

    async def create_many_from_extension(self, payload: ExtensionSubmitManyRequest) -> dict:
        status = "pending" if payload.mode == "confirm" else "queued"
        request = BatchTaskCreateRequest(
            items=[BatchTaskItem(manga_id=item.manga_id) for item in payload.items],
            source="extension",
            start_immediately=status == "queued",
        )
        return await self.create_batch(request)

    async def transition(self, task_id: str, status: str) -> dict:
        async with SessionLocal() as session:
            repo = TaskRepository(session)
            task = await self._require(repo, task_id)
            self._validate_transition(task.id, task.status, status)
            return task_to_dict(await repo.set_status(task, status))

    async def retry(self, task_id: str, scope: str) -> dict:
        async with SessionLocal() as session:
            repo = TaskRepository(session)
            task = await self._require(repo, task_id)
            if task.status not in RETRYABLE_STATUSES:
                raise InvalidTaskTransition(task.id, task.status, "queued")
            return task_to_dict(await repo.retry(task, scope))

    async def item_status(self, manga_id: str) -> dict:
        async with SessionLocal() as session:
            repo = TaskRepository(session)
            task = await repo.latest_for_manga(manga_id)
            if task:
                return {"manga_id": manga_id, "status": task.status, "task_id": task.id}
            return {"manga_id": manga_id, "status": "ready", "task_id": None}

    async def _require(self, repo: TaskRepository, task_id: str):
        task = await repo.get(task_id)
        if task is None:
            raise KeyError(f"Task not found: {task_id}")
        return task

    def _validate_transition(self, task_id: str, current: str, target: str) -> None:
        if current == target:
            return
        allowed = LEGAL_TRANSITIONS.get(current, set())
        if target not in allowed:
            raise InvalidTaskTransition(task_id, current, target)


task_service = TaskService()
