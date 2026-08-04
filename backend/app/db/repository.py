from __future__ import annotations

from uuid import uuid4

from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.time import local_isoformat
from backend.app.db.models import (
    AppLog,
    DownloadFile,
    DownloadTask,
    MangaInfo,
    MangaPage,
    MangaPicPage,
)

DownloadTaskRows = list[DownloadTask]


class MangaRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_info(self, manga_id: str) -> MangaInfo | None:
        result = await self.session.execute(select(MangaInfo).where(MangaInfo.id == manga_id))
        return result.scalar_one_or_none()

    async def list_infos(self, q: str | None = None, status: str | None = None) -> list[MangaInfo]:
        stmt = select(MangaInfo).order_by(desc(MangaInfo.updated_at), desc(MangaInfo.created_at))
        if q:
            pattern = f"%{q}%"
            stmt = stmt.where(or_(MangaInfo.id.like(pattern), MangaInfo.title.like(pattern)))
        if status:
            stmt = stmt.where(MangaInfo.status == status)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def upsert_info(
        self,
        manga_id: str,
        title: str,
        cover_url: str,
        page_count: int,
        status: str = "ready",
    ) -> MangaInfo:
        info = await self.get_info(manga_id)
        if info is None:
            info = MangaInfo(
                id=manga_id,
                title=title,
                cover_url=cover_url,
                page_count=page_count,
                status=status,
            )
            self.session.add(info)
        else:
            info.title = title or info.title
            info.cover_url = cover_url or info.cover_url
            info.page_count = page_count or info.page_count
            info.status = status
        await self.session.commit()
        await self.session.refresh(info)
        return info

    async def update_info_status(
        self,
        manga_id: str,
        status: str,
        pic_count: int | None = None,
        error: str = "",
    ) -> None:
        info = await self.get_info(manga_id)
        if info is None:
            return
        info.status = status
        info.last_error = error
        if pic_count is not None:
            info.pic_count = pic_count
        await self.session.commit()

    async def upsert_page(
        self,
        manga_id: str,
        page_index: int,
        page_url: str,
        page_context: str,
        status: str = "fetched",
        error_message: str = "",
    ) -> MangaPage:
        result = await self.session.execute(
            select(MangaPage).where(
                MangaPage.manga_id == manga_id,
                MangaPage.page_index == page_index,
            )
        )
        page = result.scalar_one_or_none()
        if page is None:
            page = MangaPage(
                manga_id=manga_id,
                page_index=page_index,
                page_url=page_url,
                page_name=f"id_{manga_id}_mangaPage_{page_index}.html",
                page_context=page_context,
                status=status,
                error_message=error_message,
            )
            self.session.add(page)
        else:
            page.page_url = page_url
            page.page_context = page_context
            page.status = status
            page.error_message = error_message
        await self.session.commit()
        await self.session.refresh(page)
        return page

    async def list_pages(self, manga_id: str) -> list[MangaPage]:
        result = await self.session.execute(
            select(MangaPage)
            .where(MangaPage.manga_id == manga_id)
            .order_by(MangaPage.page_index)
        )
        return list(result.scalars().all())

    async def upsert_pic_page(
        self,
        manga_id: str,
        page_index: int,
        page_url: str,
        page_name: str,
        pic_num: str,
        pic_url: str,
        status: str = "resolved",
        error_message: str = "",
    ) -> MangaPicPage:
        result = await self.session.execute(
            select(MangaPicPage).where(
                MangaPicPage.manga_id == manga_id,
                MangaPicPage.page_index == page_index,
            )
        )
        pic_page = result.scalar_one_or_none()
        if pic_page is None:
            pic_page = MangaPicPage(
                manga_id=manga_id,
                page_index=page_index,
                page_url=page_url,
                page_name=page_name,
                pic_index=page_index,
                pic_num=pic_num,
                pic_url=pic_url,
                status=status,
                error_message=error_message,
            )
            self.session.add(pic_page)
        else:
            pic_page.page_url = page_url
            pic_page.page_name = page_name
            pic_page.pic_index = page_index
            pic_page.pic_num = pic_num
            pic_page.pic_url = pic_url
            pic_page.status = status
            pic_page.error_message = error_message
        await self.session.commit()
        await self.session.refresh(pic_page)
        return pic_page

    async def list_pic_pages(self, manga_id: str) -> list[MangaPicPage]:
        result = await self.session.execute(
            select(MangaPicPage)
            .where(MangaPicPage.manga_id == manga_id)
            .order_by(MangaPicPage.pic_index)
        )
        return list(result.scalars().all())

    async def list_pic_pages_for_manga_ids(
        self, manga_ids: set[str]
    ) -> dict[str, list[MangaPicPage]]:
        if not manga_ids:
            return {}
        result = await self.session.execute(
            select(MangaPicPage)
            .where(MangaPicPage.manga_id.in_(manga_ids))
            .order_by(MangaPicPage.pic_index)
        )
        pages: dict[str, list[MangaPicPage]] = {mid: [] for mid in manga_ids}
        for page in result.scalars().all():
            pages[page.manga_id].append(page)
        return pages


class TaskRepository:
    active_statuses = {"pending", "queued", "running", "paused"}
    recoverable_statuses = {"queued", "running"}

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list(self, status: str | None = None) -> DownloadTaskRows:
        stmt = select(DownloadTask).order_by(desc(DownloadTask.created_at))
        if status:
            stmt = stmt.where(DownloadTask.status == status)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def list_recoverable(self) -> DownloadTaskRows:
        result = await self.session.execute(
            select(DownloadTask)
            .where(DownloadTask.status.in_(self.recoverable_statuses))
            .order_by(DownloadTask.created_at)
        )
        return list(result.scalars().all())

    async def list_failed_with_errors(self) -> DownloadTaskRows:
        result = await self.session.execute(
            select(DownloadTask)
            .where(
                DownloadTask.status.in_({"failed", "partial", "cancelled"}),
                DownloadTask.last_error != "",
            )
            .order_by(desc(DownloadTask.updated_at), desc(DownloadTask.created_at))
        )
        return list(result.scalars().all())

    async def get(self, task_id: str) -> DownloadTask | None:
        result = await self.session.execute(select(DownloadTask).where(DownloadTask.id == task_id))
        return result.scalar_one_or_none()

    async def latest_for_manga(self, manga_id: str) -> DownloadTask | None:
        result = await self.session.execute(
            select(DownloadTask)
            .where(DownloadTask.manga_id == manga_id)
            .order_by(desc(DownloadTask.created_at))
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def active_for_manga(self, manga_id: str) -> DownloadTask | None:
        result = await self.session.execute(
            select(DownloadTask)
            .where(
                DownloadTask.manga_id == manga_id,
                DownloadTask.status.in_(self.active_statuses),
            )
            .order_by(desc(DownloadTask.created_at))
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def latest_for_manga_ids(self, manga_ids: set[str]) -> dict[str, DownloadTask | None]:
        """Return the latest task for each manga_id. Uses a subquery for efficiency."""
        if not manga_ids:
            return {}
        # Get all tasks for the manga_ids, ordered by created_at desc
        result = await self.session.execute(
            select(DownloadTask)
            .where(DownloadTask.manga_id.in_(manga_ids))
            .order_by(desc(DownloadTask.created_at))
        )
        tasks: dict[str, DownloadTask | None] = {mid: None for mid in manga_ids}
        for task in result.scalars().all():
            if tasks[task.manga_id] is None:
                tasks[task.manga_id] = task
        return tasks

    async def create(
        self,
        manga_id: str,
        source: str,
        status: str,
        stage: str = "none",
    ) -> DownloadTask:
        task = DownloadTask(
            id=f"task_{uuid4().hex[:12]}",
            manga_id=manga_id,
            source=source,
            status=status,
            stage=stage,
        )
        self.session.add(task)
        await self.session.commit()
        await self.session.refresh(task)
        return task

    async def set_status(self, task: DownloadTask, status: str) -> DownloadTask:
        task.status = status
        await self.session.commit()
        await self.session.refresh(task)
        return task

    async def mark_recovered(self, task: DownloadTask) -> DownloadTask:
        if task.status == "running":
            task.status = "queued"
            task.last_error = "recovered_after_restart"
        await self.session.commit()
        await self.session.refresh(task)
        return task

    async def update_progress(
        self,
        task: DownloadTask,
        status: str,
        stage: str,
        current: int = 0,
        total: int = 0,
        error: str = "",
    ) -> DownloadTask:
        task.status = status
        task.stage = stage
        task.progress_current = current
        task.progress_total = total
        task.last_error = error
        await self.session.commit()
        await self.session.refresh(task)
        return task

    async def retry(self, task: DownloadTask, scope: str) -> DownloadTask:
        task.status = "queued"
        task.stage = "none"
        task.retry_count += 1
        task.last_error = f"retry:{scope}"
        await self.session.commit()
        await self.session.refresh(task)
        return task


def task_to_dict(task: DownloadTask) -> dict:
    return {
        "id": task.id,
        "task_id": task.id,
        "manga_id": task.manga_id,
        "title": "",
        "cover_url": "",
        "source": task.source,
        "status": task.status,
        "stage": task.stage,
        "progress_current": task.progress_current,
        "progress_total": task.progress_total,
        "retry_count": task.retry_count,
        "last_error": task.last_error or None,
        "created_at": local_isoformat(task.created_at),
        "updated_at": local_isoformat(task.updated_at),
    }


class FileRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def upsert_file(
        self,
        manga_id: str,
        pic_index: int,
        file_path: str,
        file_name: str,
        file_size: int,
        status: str,
        error_message: str = "",
    ) -> DownloadFile:
        result = await self.session.execute(
            select(DownloadFile).where(
                DownloadFile.manga_id == manga_id,
                DownloadFile.pic_index == pic_index,
            )
        )
        file = result.scalar_one_or_none()
        if file is None:
            file = DownloadFile(
                manga_id=manga_id,
                pic_index=pic_index,
                file_path=file_path,
                file_name=file_name,
                file_size=file_size,
                status=status,
                error_message=error_message,
            )
            self.session.add(file)
        else:
            file.file_path = file_path
            file.file_name = file_name
            file.file_size = file_size
            file.status = status
            file.error_message = error_message
        await self.session.commit()
        await self.session.refresh(file)
        return file

    async def list_for_manga(self, manga_id: str) -> list[DownloadFile]:
        result = await self.session.execute(
            select(DownloadFile)
            .where(DownloadFile.manga_id == manga_id)
            .order_by(DownloadFile.pic_index)
        )
        return list(result.scalars().all())

    async def list_for_manga_ids(self, manga_ids: set[str]) -> dict[str, list[DownloadFile]]:
        if not manga_ids:
            return {}
        result = await self.session.execute(
            select(DownloadFile)
            .where(DownloadFile.manga_id.in_(manga_ids))
            .order_by(DownloadFile.pic_index)
        )
        files: dict[str, list[DownloadFile]] = {mid: [] for mid in manga_ids}
        for file in result.scalars().all():
            files[file.manga_id].append(file)
        return files

    async def count_valid(self, manga_id: str) -> int:
        result = await self.session.execute(
            select(func.count()).select_from(DownloadFile).where(
                DownloadFile.manga_id == manga_id,
                DownloadFile.status == "valid",
            )
        )
        return int(result.scalar_one())


class LogRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(
        self,
        level: str,
        event: str,
        message: str,
        manga_id: str = "",
        task_id: str = "",
        stage: str = "",
        details: str = "",
    ) -> AppLog:
        row = AppLog(
            level=level,
            event=event,
            message=message,
            manga_id=manga_id,
            task_id=task_id,
            stage=stage,
            details=details,
        )
        self.session.add(row)
        await self.session.commit()
        await self.session.refresh(row)
        return row

    async def list(
        self,
        level: str | None = None,
        manga_id: str | None = None,
        task_id: str | None = None,
        limit: int = 200,
    ) -> list[AppLog]:
        stmt = select(AppLog).order_by(desc(AppLog.created_at), desc(AppLog.id)).limit(limit)
        if level:
            stmt = stmt.where(AppLog.level == level)
        if manga_id:
            stmt = stmt.where(AppLog.manga_id == manga_id)
        if task_id:
            stmt = stmt.where(AppLog.task_id == task_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def exists(self, event: str, manga_id: str = "", task_id: str = "") -> bool:
        stmt = select(func.count()).select_from(AppLog).where(AppLog.event == event)
        if manga_id:
            stmt = stmt.where(AppLog.manga_id == manga_id)
        if task_id:
            stmt = stmt.where(AppLog.task_id == task_id)
        result = await self.session.execute(stmt)
        return int(result.scalar_one()) > 0

    async def existing_task_ids_for_event(self, event: str, task_ids: set[str]) -> set[str]:
        """Return the set of task_ids that already have a log entry for the given event."""
        if not task_ids:
            return set()
        result = await self.session.execute(
            select(AppLog.task_id).where(
                AppLog.event == event,
                AppLog.task_id.in_(task_ids),
            )
        )
        return {row[0] for row in result.all()}
