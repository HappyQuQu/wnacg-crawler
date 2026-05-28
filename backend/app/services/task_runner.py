import asyncio
import zipfile
from collections.abc import Sequence
from pathlib import Path

from backend.app.core.config import get_settings
from backend.app.core.paths import manga_dir, safe_filename, zip_path
from backend.app.crawler.downloader import downloader, image_extension, is_valid_image
from backend.app.crawler.parser import PicPageItem, manga_parser
from backend.app.crawler.smart_fetcher import smart_fetch
from backend.app.db.database import SessionLocal
from backend.app.db.models import DownloadFile, MangaPicPage
from backend.app.db.repository import (
    FileRepository,
    MangaRepository,
    TaskRepository,
    task_to_dict,
)
from backend.app.services.log_service import log_service

CONTROLLED_TASK_STATUSES = {"paused", "cancelled"}
RUNNABLE_TASK_STATUSES = {"queued", "running"}


class TaskControlSignal(Exception):
    def __init__(self, status: str) -> None:
        super().__init__(status)
        self.status = status


class TaskRunner:
    def __init__(self) -> None:
        self._running: set[str] = set()

    async def run_many(self, task_ids: Sequence[str]) -> None:
        await asyncio.gather(*(self.run(task_id) for task_id in task_ids))

    async def restore_queued_tasks(self) -> int:
        async with SessionLocal() as session:
            repo = TaskRepository(session)
            tasks = await repo.list_recoverable()
            restored = [await repo.mark_recovered(task) for task in tasks]

        for task in restored:
            await self._log(
                "info",
                "task_recovered",
                "服务启动后恢复任务",
                task.id,
                task.manga_id,
                task.stage,
                {"status": task.status},
            )
            if task.status == "queued" and task.id not in self._running:
                asyncio.create_task(self.run(task.id))
        return len(restored)

    async def run(self, task_id: str) -> None:
        if task_id in self._running:
            return
        self._running.add(task_id)
        try:
            await self._ensure_runnable(task_id)
            manga_id = await self._manga_id(task_id)
            if not manga_id:
                return
            await self._log("info", "task_started", "任务开始执行", task_id, manga_id)
            info = await self._fetch_info(task_id, manga_id)
            await self._ensure_runnable(task_id)
            await self._fetch_pages(task_id, manga_id, info["page_count"])
            await self._ensure_runnable(task_id)
            pic_count = await self._resolve_images(task_id, manga_id)
            await self._ensure_runnable(task_id)
            valid_count = await self._download_images(task_id, manga_id)
            await self._ensure_runnable(task_id)
            await self._verify_and_finish(task_id, manga_id, pic_count, valid_count)
        except TaskControlSignal:
            await self.broadcast_snapshot(task_id)
        except Exception as exc:
            error = _exception_message(exc)
            manga_id = await self._manga_id(task_id)
            if manga_id:
                await self._set_manga_status(manga_id, "failed", error=error)
                await self._log(
                    "error",
                    "task_failed",
                    error,
                    task_id,
                    manga_id,
                    details={"exception_type": type(exc).__name__},
                )
            await self._set_task(task_id, "failed", "done", error=error)
        finally:
            self._running.discard(task_id)

    async def run_failed_images(self, task_id: str) -> None:
        if task_id in self._running:
            return
        self._running.add(task_id)
        try:
            await self._ensure_runnable(task_id)
            manga_id = await self._manga_id(task_id)
            if not manga_id:
                return
            await self._log(
                "info",
                "retry_failed_images_started",
                "开始重试问题图片",
                task_id,
                manga_id,
            )
            result = await self._download_problem_images(task_id, manga_id)
            await self._ensure_runnable(task_id)
            await self._finish_problem_image_retry(task_id, manga_id, result)
        except TaskControlSignal:
            await self.broadcast_snapshot(task_id)
        except Exception as exc:
            error = _exception_message(exc)
            manga_id = await self._manga_id(task_id)
            if manga_id:
                await self._set_manga_status(manga_id, "failed", error=error)
                await self._log(
                    "error",
                    "retry_failed_images_failed",
                    error,
                    task_id,
                    manga_id,
                    details={"exception_type": type(exc).__name__},
                )
            await self._set_task(task_id, "failed", "done", error=error)
        finally:
            self._running.discard(task_id)

    async def _manga_id(self, task_id: str) -> str | None:
        async with SessionLocal() as session:
            task = await TaskRepository(session).get(task_id)
            return task.manga_id if task else None

    async def _fetch_info(self, task_id: str, manga_id: str) -> dict:
        settings = get_settings()
        await self._set_task(task_id, "running", "fetching_info")
        await self._ensure_runnable(task_id)
        url = settings.manga_page_url.format(page=1, aid=manga_id)
        html = await smart_fetch(url, referer=settings.manga_main_url)
        await self._ensure_runnable(task_id)
        parsed = manga_parser.parse_manga_info(html, manga_id)
        async with SessionLocal() as session:
            repo = MangaRepository(session)
            info = await repo.upsert_info(
                manga_id=manga_id,
                title=parsed["title"],
                cover_url=parsed["cover_url"],
                page_count=parsed["page_count"],
                status="ready",
            )
            await repo.upsert_page(manga_id, 1, url, html)
            await self._log(
                "info",
                "manga_info_resolved",
                f"解析到 {info.page_count} 个目录页",
                task_id,
                manga_id,
                "fetching_info",
                {"title": info.title, "url": url},
            )
            return {
                "title": info.title,
                "cover_url": info.cover_url,
                "page_count": info.page_count,
            }

    async def _fetch_pages(self, task_id: str, manga_id: str, page_count: int) -> None:
        settings = get_settings()
        await self._set_task(task_id, "running", "fetching_pages", 0, page_count)
        async with SessionLocal() as session:
            existing_pages = await MangaRepository(session).list_pages(manga_id)
            existing_indexes = {
                page.page_index for page in existing_pages if page.status == "fetched"
            }

        for page_index in range(1, page_count + 1):
            await self._ensure_runnable(task_id)
            if page_index in existing_indexes:
                await self._set_task(task_id, "running", "fetching_pages", page_index, page_count)
                continue
            url = settings.manga_page_url.format(page=page_index, aid=manga_id)
            html = await smart_fetch(url, referer=settings.manga_main_url)
            await self._ensure_runnable(task_id)
            async with SessionLocal() as session:
                await MangaRepository(session).upsert_page(manga_id, page_index, url, html)
            await self._set_task(task_id, "running", "fetching_pages", page_index, page_count)

    async def _resolve_images(self, task_id: str, manga_id: str) -> int:
        settings = get_settings()
        async with SessionLocal() as session:
            pages = await MangaRepository(session).list_pages(manga_id)
        items: list[PicPageItem] = []
        seen_urls: set[str] = set()
        for page in pages:
            parsed_items = manga_parser.parse_pic_page_list(
                page.page_context, manga_id, settings.manga_main_url
            )
            for item in parsed_items:
                if item.page_url in seen_urls:
                    continue
                seen_urls.add(item.page_url)
                item.pic_index = len(items) + 1
                item.page_name = f"id_{manga_id}_pic_{item.pic_index}"
                items.append(item)

        if not items:
            raise RuntimeError("未解析到图片详情页")

        await self._set_task(task_id, "running", "resolving_images", 0, len(items))
        for item in items:
            await self._ensure_runnable(task_id)
            html = await smart_fetch(item.page_url, referer=settings.manga_main_url)
            await self._ensure_runnable(task_id)
            pic_url = manga_parser.parse_pic_url(html, settings.manga_main_url)
            status = "resolved" if pic_url else "failed"
            error = "" if pic_url else "未解析到图片地址"
            if error:
                await self._log(
                    "warning",
                    "image_url_resolve_failed",
                    error,
                    task_id,
                    manga_id,
                    "resolving_images",
                    {"page_index": item.pic_index, "page_url": item.page_url},
                )
            async with SessionLocal() as session:
                await MangaRepository(session).upsert_pic_page(
                    manga_id=manga_id,
                    page_index=item.pic_index,
                    page_url=item.page_url,
                    page_name=item.page_name,
                    pic_num=item.pic_num,
                    pic_url=pic_url or "",
                    status=status,
                    error_message=error,
                )
            await self._set_task(
                task_id, "running", "resolving_images", item.pic_index, len(items)
            )

        await self._set_manga_status(manga_id, "ready", pic_count=len(items))
        await self._log(
            "info",
            "image_urls_resolved",
            f"解析到 {len(items)} 个图片详情页",
            task_id,
            manga_id,
            "resolving_images",
        )
        return len(items)

    async def _download_images(self, task_id: str, manga_id: str) -> int:
        settings = get_settings()
        async with SessionLocal() as session:
            manga_repo = MangaRepository(session)
            info = await manga_repo.get_info(manga_id)
            pic_pages = await manga_repo.list_pic_pages(manga_id)

        title = info.title if info and info.title else manga_id
        save_dir = manga_dir(Path(settings.download_path), manga_id, title)
        save_dir.mkdir(parents=True, exist_ok=True)
        resolved = [page for page in pic_pages if page.pic_url]
        await self._set_task(task_id, "running", "downloading", 0, len(resolved))

        valid_count = 0
        processed_count = 0
        progress_lock = asyncio.Lock()
        worker_count = min(settings.max_thread, len(resolved)) if resolved else 1
        semaphore = asyncio.Semaphore(worker_count)

        async def download_page(page: MangaPicPage) -> None:
            nonlocal processed_count, valid_count
            async with semaphore:
                await self._ensure_runnable(task_id)
                file_path = _target_image_path(save_dir, page)
                status = "failed"
                error = ""
                try:
                    already_valid = file_path.exists() and await asyncio.to_thread(
                        _is_valid_image_file, file_path
                    )
                    if already_valid:
                        status = "valid"
                    else:
                        data = await downloader.get_bytes(page.pic_url, referer=page.page_url)
                        await self._ensure_runnable(task_id)
                        if not is_valid_image(data):
                            raise RuntimeError("响应不是有效图片")
                        await asyncio.to_thread(file_path.write_bytes, data)
                        status = "valid"
                    await self._record_file(manga_id, page.pic_index, file_path, status)
                except TaskControlSignal:
                    raise
                except Exception as exc:
                    error = _exception_message(exc)
                    await self._record_file(manga_id, page.pic_index, file_path, "failed", error)
                    await self._log(
                        "warning",
                        "image_download_failed",
                        error,
                        task_id,
                        manga_id,
                        "downloading",
                        {
                            "pic_index": page.pic_index,
                            "pic_url": page.pic_url,
                            "page_url": page.page_url,
                            "file_path": str(file_path),
                        },
                    )

                async with progress_lock:
                    processed_count += 1
                    if status == "valid":
                        valid_count += 1
                    current = processed_count
                await self._set_task(task_id, "running", "downloading", current, len(resolved))

        await asyncio.gather(*(download_page(page) for page in resolved))
        return valid_count

    async def _download_problem_images(self, task_id: str, manga_id: str) -> dict:
        settings = get_settings()
        async with SessionLocal() as session:
            manga_repo = MangaRepository(session)
            info = await manga_repo.get_info(manga_id)
            pic_pages = await manga_repo.list_pic_pages(manga_id)
            files = await FileRepository(session).list_for_manga(manga_id)

        if info is None:
            raise RuntimeError("资料库项目不存在")

        title = info.title if info.title else manga_id
        save_dir = manga_dir(Path(settings.download_path), manga_id, title)
        save_dir.mkdir(parents=True, exist_ok=True)
        files_by_index = {file.pic_index: file for file in files}
        problem_pages = []
        for page in pic_pages:
            file = files_by_index.get(page.pic_index)
            file_path = _target_image_path(save_dir, page)
            if file is not None:
                file_path = Path(file.file_path)
            if _needs_retry(file, file_path):
                problem_pages.append((page, file_path))

        await self._set_task(task_id, "running", "retrying_failed_images", 0, len(problem_pages))
        if not problem_pages:
            return {"processed": 0, "fixed": 0, "failed": 0}

        processed = 0
        fixed = 0
        failed = 0
        re_resolved = 0
        for page, file_path in problem_pages:
            await self._ensure_runnable(task_id)
            processed += 1
            if not page.pic_url:
                page = await self._refresh_pic_url(
                    task_id, manga_id, page, processed, len(problem_pages)
                )
                file_path = _target_image_path(save_dir, page)
                if page.pic_url:
                    re_resolved += 1

            try:
                if not page.pic_url:
                    raise RuntimeError("未解析到图片地址")
                await self._download_problem_image(task_id, page, file_path)
                fixed += 1
                await self._record_file(manga_id, page.pic_index, file_path, "valid")
            except Exception as first_exc:
                refreshed = await self._refresh_pic_url(
                    task_id, manga_id, page, processed, len(problem_pages)
                )
                if refreshed.pic_url and refreshed.pic_url != page.pic_url:
                    page = refreshed
                    file_path = _target_image_path(save_dir, page)
                    re_resolved += 1
                    try:
                        await self._download_problem_image(task_id, page, file_path)
                        fixed += 1
                        await self._record_file(manga_id, page.pic_index, file_path, "valid")
                    except Exception as retry_exc:
                        failed += 1
                        error = _exception_message(retry_exc)
                        await self._record_file(
                            manga_id,
                            page.pic_index,
                            file_path,
                            "failed",
                            error,
                        )
                        await self._log(
                            "warning",
                            "problem_image_retry_failed",
                            error,
                            task_id,
                            manga_id,
                            "retrying_failed_images",
                            {"pic_index": page.pic_index, "file_path": str(file_path)},
                        )
                else:
                    failed += 1
                    error = _exception_message(first_exc)
                    await self._record_file(
                        manga_id, page.pic_index, file_path, "failed", error
                    )
                    await self._log(
                        "warning",
                        "problem_image_retry_failed",
                        error,
                        task_id,
                        manga_id,
                        "retrying_failed_images",
                        {"pic_index": page.pic_index, "file_path": str(file_path)},
                    )
            await self._set_task(
                task_id,
                "running",
                "retrying_failed_images",
                processed,
                len(problem_pages),
            )
        return {
            "processed": processed,
            "fixed": fixed,
            "failed": failed,
            "re_resolved": re_resolved,
        }

    async def _refresh_pic_url(
        self,
        task_id: str,
        manga_id: str,
        page: MangaPicPage,
        current: int,
        total: int,
    ) -> MangaPicPage:
        if not page.page_url:
            return page

        settings = get_settings()
        await self._set_task(task_id, "running", "resolving_images", current, total)
        await self._ensure_runnable(task_id)
        html = await smart_fetch(page.page_url, referer=settings.manga_main_url)
        await self._ensure_runnable(task_id)
        pic_url = manga_parser.parse_pic_url(html, settings.manga_main_url)
        status = "resolved" if pic_url else "failed"
        error = "" if pic_url else "未解析到图片地址"
        if error:
            await self._log(
                "warning",
                "image_url_refresh_failed",
                error,
                task_id,
                manga_id,
                "resolving_images",
                {"page_index": page.pic_index, "page_url": page.page_url},
            )
        async with SessionLocal() as session:
            return await MangaRepository(session).upsert_pic_page(
                manga_id=manga_id,
                page_index=page.page_index,
                page_url=page.page_url,
                page_name=page.page_name,
                pic_num=page.pic_num,
                pic_url=pic_url or "",
                status=status,
                error_message=error,
            )

    async def _download_problem_image(
        self, task_id: str, page: MangaPicPage, file_path: Path
    ) -> None:
        data = await downloader.get_bytes(page.pic_url, referer=page.page_url)
        await self._ensure_runnable(task_id)
        if not is_valid_image(data):
            raise RuntimeError("响应不是有效图片")
        file_path.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(file_path.write_bytes, data)

    async def _finish_problem_image_retry(
        self,
        task_id: str,
        manga_id: str,
        result: dict,
    ) -> None:
        async with SessionLocal() as session:
            manga_repo = MangaRepository(session)
            info = await manga_repo.get_info(manga_id)
            pic_pages = await manga_repo.list_pic_pages(manga_id)
            files = await FileRepository(session).list_for_manga(manga_id)

        if info is None:
            raise RuntimeError("资料库项目不存在")

        total_files = max(info.pic_count, len(pic_pages), len(files))
        valid_count = len([file for file in files if file.status == "valid"])
        finished = total_files > 0 and valid_count == total_files
        status = "completed" if finished else "partial"
        message = (
            f"retry_failed_images:fixed={result['fixed']};"
            f"failed={result['failed']};processed={result['processed']};"
            f"re_resolved={result.get('re_resolved', 0)}"
        )
        await self._set_manga_status(manga_id, status, pic_count=total_files, error="")
        await self._log(
            "info" if finished else "warning",
            "retry_failed_images_finished",
            message,
            task_id,
            manga_id,
            "retrying_failed_images",
            result,
        )
        if finished and get_settings().is_zip:
            await self._set_task(task_id, "running", "zipping", valid_count, total_files)
            await self._ensure_runnable(task_id)
            await self._zip_manga(manga_id)
        await self._set_task(task_id, status, "done", valid_count, total_files, message)

    async def _verify_and_finish(
        self,
        task_id: str,
        manga_id: str,
        pic_count: int,
        valid_count: int,
    ) -> None:
        await self._set_task(task_id, "running", "verifying", valid_count, pic_count)
        await self._ensure_runnable(task_id)
        if valid_count != pic_count:
            await self._set_manga_status(manga_id, "partial")
            await self._log(
                "warning",
                "task_partial",
                f"下载不完整：有效 {valid_count}/{pic_count}",
                task_id,
                manga_id,
                "verifying",
                {"valid_count": valid_count, "pic_count": pic_count},
            )
            await self._set_task(task_id, "partial", "done", valid_count, pic_count)
            return

        if get_settings().is_zip:
            await self._set_task(task_id, "running", "zipping", valid_count, pic_count)
            await self._ensure_runnable(task_id)
            await self._zip_manga(manga_id)

        await self._set_manga_status(manga_id, "completed", pic_count=pic_count)
        await self._log(
            "info",
            "task_completed",
            f"任务完成：有效 {valid_count}/{pic_count}",
            task_id,
            manga_id,
            "done",
            {"valid_count": valid_count, "pic_count": pic_count},
        )
        await self._set_task(task_id, "completed", "done", valid_count, pic_count)

    async def _zip_manga(self, manga_id: str) -> None:
        settings = get_settings()
        async with SessionLocal() as session:
            info = await MangaRepository(session).get_info(manga_id)
        title = info.title if info and info.title else manga_id
        source = manga_dir(Path(settings.download_path), manga_id, title)
        target = zip_path(Path(settings.download_path), manga_id, title)
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            target.unlink()
        await asyncio.to_thread(_create_zip, source, target)

    async def _record_file(
        self,
        manga_id: str,
        pic_index: int,
        file_path: Path,
        status: str,
        error: str = "",
    ) -> None:
        size = file_path.stat().st_size if file_path.exists() else 0
        async with SessionLocal() as session:
            await FileRepository(session).upsert_file(
                manga_id=manga_id,
                pic_index=pic_index,
                file_path=str(file_path),
                file_name=file_path.name,
                file_size=size,
                status=status,
                error_message=error,
            )

    async def _set_manga_status(
        self,
        manga_id: str,
        status: str,
        pic_count: int | None = None,
        error: str = "",
    ) -> None:
        async with SessionLocal() as session:
            await MangaRepository(session).update_info_status(manga_id, status, pic_count, error)

    async def _set_task(
        self,
        task_id: str,
        status: str,
        stage: str,
        current: int = 0,
        total: int = 0,
        error: str = "",
    ) -> None:
        async with SessionLocal() as session:
            repo = TaskRepository(session)
            task = await repo.get(task_id)
            if task is None:
                return
            if task.status in CONTROLLED_TASK_STATUSES and status not in CONTROLLED_TASK_STATUSES:
                await self._broadcast(task_to_dict(task))
                await self._log(
                    "info",
                    "task_controlled",
                    f"任务被标记为 {task.status}",
                    task_id,
                    task.manga_id,
                    task.stage,
                )
                raise TaskControlSignal(task.status)
            updated = await repo.update_progress(task, status, stage, current, total, error)
            await self._broadcast(task_to_dict(updated))

    async def _log(
        self,
        level: str,
        event: str,
        message: str,
        task_id: str,
        manga_id: str,
        stage: str = "",
        details: dict | None = None,
    ) -> None:
        await log_service.write(
            level=level,
            event=event,
            message=message,
            manga_id=manga_id,
            task_id=task_id,
            stage=stage,
            details=details,
        )

    async def _ensure_runnable(self, task_id: str) -> None:
        async with SessionLocal() as session:
            task = await TaskRepository(session).get(task_id)
            if task is None:
                raise TaskControlSignal("missing")
            if task.status in CONTROLLED_TASK_STATUSES:
                raise TaskControlSignal(task.status)
            if task.status not in RUNNABLE_TASK_STATUSES:
                raise TaskControlSignal(task.status)

    async def broadcast_snapshot(self, task_id: str) -> None:
        async with SessionLocal() as session:
            task = await TaskRepository(session).get(task_id)
            if task is not None:
                await self._broadcast(task_to_dict(task))

    async def _broadcast(self, task: dict) -> None:
        from backend.app.api.ws import manager

        await manager.broadcast(
            {
                "type": "task_progress",
                "task_id": task["task_id"],
                "manga_id": task["manga_id"],
                "status": task["status"],
                "stage": task["stage"],
                "current": task["progress_current"],
                "total": task["progress_total"],
                "message": task["last_error"],
            }
        )


def _is_valid_image_file(path: Path) -> bool:
    try:
        return is_valid_image(path.read_bytes())
    except OSError:
        return False


def _target_image_path(save_dir: Path, page: MangaPicPage) -> Path:
    ext = image_extension(page.pic_url)
    safe_pic_num = safe_filename(page.pic_num, str(page.pic_index))
    return save_dir / f"{page.pic_index:04d}_{safe_pic_num}{ext}"


def _exception_message(exc: Exception) -> str:
    message = str(exc).strip()
    if message:
        return message
    return type(exc).__name__


def _needs_retry(file: DownloadFile | None, file_path: Path) -> bool:
    if file is None:
        return True
    if file.status != "valid":
        return True
    return not file_path.exists() or not _is_valid_image_file(file_path)


def _create_zip(source: Path, target: Path) -> None:
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as zf:
        for file in sorted(source.iterdir()):
            if file.is_file():
                zf.write(file, file.name)


task_runner = TaskRunner()
