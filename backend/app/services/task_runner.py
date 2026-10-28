import asyncio
import re
from collections.abc import AsyncIterator, Sequence
from contextlib import asynccontextmanager
from pathlib import Path
from time import monotonic
from urllib.parse import urljoin

from backend.app.core.config import get_settings
from backend.app.core.errors import ImageHTTPError
from backend.app.core.files import atomic_write_bytes
from backend.app.core.paths import manga_dir, original_dir, safe_filename, zip_path
from backend.app.crawler.downloader import image_extension
from backend.app.crawler.image_processing import PreparedImage, prepare_image
from backend.app.crawler.images import (
    find_valid_image_path,
    is_valid_image_file,
)
from backend.app.crawler.parser import PicPageItem, manga_parser
from backend.app.crawler.smart_fetcher import smart_fetch, smart_fetch_bytes
from backend.app.db.database import SessionLocal
from backend.app.db.models import DownloadFile, MangaPicPage
from backend.app.db.repository import (
    FileRepository,
    MangaRepository,
    TaskRepository,
    task_to_dict,
)
from backend.app.services.archive_service import create_zip
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
        self._task_slots = asyncio.Semaphore(get_settings().max_active_tasks)
        self._image_condition = asyncio.Condition()
        self._active_images = 0

    def is_running(self, task_id: str) -> bool:
        return task_id in self._running

    @asynccontextmanager
    async def _image_slot(self) -> AsyncIterator[None]:
        async with self._image_condition:
            await self._image_condition.wait_for(
                lambda: self._active_images < get_settings().max_thread
            )
            self._active_images += 1
        try:
            yield
        finally:
            async with self._image_condition:
                self._active_images -= 1
                self._image_condition.notify_all()

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
            async with self._task_slots:
                await self._run_task(task_id)
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
            async with self._task_slots:
                await self._retry_images(task_id)
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

    async def _run_task(self, task_id: str) -> None:
        await self._ensure_runnable(task_id)
        manga_id = await self._manga_id(task_id)
        if not manga_id:
            return
        await self._log("info", "task_started", "任务开始执行", task_id, manga_id)
        info = await self._fetch_info(task_id, manga_id)
        await self._ensure_runnable(task_id)
        expected_count = None
        if info["chapter_count"]:
            expected_count = await self._fetch_series_pages(task_id, manga_id, info)
        else:
            await self._fetch_pages(task_id, manga_id, info["page_count"])
        await self._ensure_runnable(task_id)
        pic_count = await self._prepare_images(task_id, manga_id, expected_count)
        await self._ensure_runnable(task_id)
        valid_count = await self._download_images(task_id, manga_id)
        await self._ensure_runnable(task_id)
        await self._verify_and_finish(task_id, manga_id, pic_count, valid_count)

    async def _retry_images(self, task_id: str) -> None:
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

    async def _manga_id(self, task_id: str) -> str | None:
        async with SessionLocal() as session:
            task = await TaskRepository(session).get(task_id)
            return task.manga_id if task else None

    async def _fetch_info(self, task_id: str, manga_id: str) -> dict:
        settings = get_settings()
        await self._set_task(task_id, "running", "fetching_info")
        await self._ensure_runnable(task_id)
        async with SessionLocal() as session:
            repo = MangaRepository(session)
            cached = await repo.get_info(manga_id)
            pages = await repo.list_pages(manga_id)
            if cached and cached.title and cached.page_count and any(
                page.page_index == 1 and page.status == "fetched" for page in pages
            ):
                parsed = manga_parser.parse_manga_info(pages[0].page_context, manga_id)
                return {
                    "title": cached.title,
                    "cover_url": cached.cover_url,
                    "page_count": parsed["page_count"],
                    "chapter_count": parsed["chapter_count"],
                }
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
                "chapter_count": parsed["chapter_count"],
            }

    async def _fetch_pages(
        self, task_id: str, manga_id: str, page_count: int, series: bool = False
    ) -> None:
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
            url = (
                urljoin(settings.manga_main_url,
                        f"photos-index-aid-{manga_id}-page-{page_index}.html?order=asc&mode=list")
                if series else settings.manga_page_url.format(page=page_index, aid=manga_id)
            )
            html = await smart_fetch(url, referer=settings.manga_main_url)
            await self._ensure_runnable(task_id)
            async with SessionLocal() as session:
                await MangaRepository(session).upsert_page(manga_id, page_index, url, html)
            await self._set_task(task_id, "running", "fetching_pages", page_index, page_count)

    async def _fetch_series_pages(self, task_id: str, manga_id: str, info: dict) -> int:
        settings = get_settings()
        directory_count = info["page_count"]
        await self._fetch_pages(task_id, manga_id, directory_count, series=True)
        async with SessionLocal() as session:
            pages = await MangaRepository(session).list_pages(manga_id)
        chapters = [
            chapter for page in pages if page.page_index <= directory_count
            for chapter in manga_parser.parse_series_chapters(page.page_context)
        ]
        chapters.sort(key=lambda chapter: chapter.index)
        if (
            len(chapters) != info["chapter_count"]
            or [chapter.index for chapter in chapters] != list(range(1, len(chapters) + 1))
            or len({chapter.manga_id for chapter in chapters}) != len(chapters)
        ):
            raise RuntimeError(f"合集章节不完整：解析到 {len(chapters)}/{info['chapter_count']} 话")

        cached = {page.page_index: page for page in pages if page.status == "fetched"}
        total = directory_count + len(chapters)
        expected_count = sum(chapter.pic_count for chapter in chapters)
        await self._log(
            "info", "series_chapters_resolved",
            f"合集共 {len(chapters)} 话、{expected_count} 张图片，将合并下载和打包",
            task_id, manga_id, "fetching_pages",
            {"chapter_count": len(chapters), "pic_count": expected_count},
        )
        for offset, chapter in enumerate(chapters, start=1):
            await self._ensure_runnable(task_id)
            index = directory_count + offset
            url = urljoin(settings.manga_main_url, f"photos-item-aid-{chapter.manga_id}.html")
            reader = urljoin(
                settings.manga_main_url,
                f"photos-slide-aid-{chapter.manga_id}-sid-{manga_id}.html",
            )
            page = cached.get(index)
            script = (
                page.page_context if page is not None and page.page_url == url
                else await smart_fetch(url, referer=reader)
            )
            urls = manga_parser.parse_reader_images(script, reader)
            if len(urls) != chapter.pic_count:
                raise RuntimeError(
                    f"第 {chapter.index} 话图片列表不完整：{len(urls)}/{chapter.pic_count}"
                )
            await self._ensure_runnable(task_id)
            async with SessionLocal() as session:
                await MangaRepository(session).upsert_page(manga_id, index, url, script)
            await self._set_task(task_id, "running", "fetching_pages", index, total)
        async with SessionLocal() as session:
            await MangaRepository(session).upsert_info(
                manga_id, info["title"], info["cover_url"], total, "ready"
            )
        return expected_count

    async def _prepare_images(
        self, task_id: str, manga_id: str, expected_count: int | None = None
    ) -> int:
        settings = get_settings()
        async with SessionLocal() as session:
            pages = await MangaRepository(session).list_pages(manga_id)
        items: list[PicPageItem] = []
        seen_urls: set[str] = set()
        for page in pages:
            reader = re.search(r"/photos-item-aid-(\d+)\.html$", page.page_url)
            parsed_items = (
                manga_parser.parse_reader_page_list(
                    page.page_context, reader.group(1), manga_id, settings.manga_main_url
                )
                if reader else manga_parser.parse_pic_page_list(
                    page.page_context, manga_id, settings.manga_main_url
                )
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
        if expected_count is not None and len(items) != expected_count:
            raise RuntimeError(f"合集图片不完整：解析到 {len(items)}/{expected_count}")

        async with SessionLocal() as session:
            repo = MangaRepository(session)
            cached = {page.pic_index: page for page in await repo.list_pic_pages(manga_id)}
            pending = []
            for item in items:
                cached_page = cached.get(item.pic_index)
                if (
                    cached_page is not None
                    and cached_page.page_url == item.page_url
                    and cached_page.pic_url
                ):
                    continue
                pending.append(MangaPicPage(
                    manga_id=manga_id,
                    page_index=item.pic_index,
                    pic_index=item.pic_index,
                    page_url=item.page_url,
                    page_name=item.page_name,
                    pic_num=item.pic_num,
                    pic_url=item.pic_url,
                    status="resolved" if item.pic_url else "pending",
                    error_message="",
                ))
            await repo.upsert_pic_pages(pending)

        await self._set_manga_status(manga_id, "ready", pic_count=len(items))
        await self._log(
            "info", "image_pages_prepared",
            f"准备好 {len(items)} 个图片详情页，边解析边下载",
            task_id, manga_id, "downloading",
        )
        return len(items)

    async def _download_images(self, task_id: str, manga_id: str) -> int:
        settings = get_settings()
        async with SessionLocal() as session:
            manga_repo = MangaRepository(session)
            info = await manga_repo.get_info(manga_id)
            pic_pages = await manga_repo.list_pic_pages(manga_id)
            files = await FileRepository(session).list_for_manga(manga_id)

        title = info.title if info and info.title else manga_id
        save_dir = manga_dir(Path(settings.download_path), manga_id, title)
        save_dir.mkdir(parents=True, exist_ok=True)
        files_by_index = {file.pic_index: file for file in files}
        resolved = pic_pages
        await self._set_task(task_id, "running", "downloading", 0, len(resolved))

        valid_count = 0
        processed_count = 0
        progress_lock = asyncio.Lock()
        worker_count = min(settings.max_thread, len(resolved)) if resolved else 1
        semaphore = asyncio.Semaphore(worker_count)
        ws_throttle_interval = 0.5  # seconds between WS progress broadcasts
        last_ws_at = 0.0

        async def download_page(page: MangaPicPage) -> None:
            nonlocal processed_count, valid_count, last_ws_at
            async with semaphore:
                await self._ensure_runnable(task_id)
                file_path = _target_image_path(save_dir, page)
                status = "failed"
                error = ""
                try:
                    file = files_by_index.get(page.pic_index)
                    existing = await asyncio.to_thread(
                        find_valid_image_path, file_path, Path(file.file_path) if file else None
                    )
                    if existing is not None:
                        file_path = existing
                    else:
                        await self._log(
                            "info", "image_download_started",
                            f"正在下载第 {page.pic_index}/{len(resolved)} 张图片",
                            task_id, manga_id, "downloading",
                            {"pic_index": page.pic_index, "page_url": page.page_url},
                        )
                        file_path, _ = await self._download_page_image(
                            task_id, manga_id, page, file_path
                        )
                    status = "valid"
                    await self._record_file(manga_id, page.pic_index, file_path, status)
                    await self._log(
                        "info", "image_file_reused" if existing else "image_download_completed",
                        f"第 {page.pic_index}/{len(resolved)} 张图片"
                        + ("复用已有有效文件" if existing else "下载并校验成功"),
                        task_id, manga_id, "downloading",
                        {"pic_index": page.pic_index, "file_path": str(file_path)},
                    )
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

                now = monotonic()
                async with progress_lock:
                    processed_count += 1
                    if status == "valid":
                        valid_count += 1
                    current = processed_count
                    elapsed = now - last_ws_at
                    is_done = current == len(resolved)
                    should_broadcast = elapsed >= ws_throttle_interval or is_done
                    if should_broadcast:
                        last_ws_at = now
                if should_broadcast:
                    total = len(resolved)
                    await self._set_task(
                        task_id, "running", "downloading", current, total
                    )

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
            if await asyncio.to_thread(_needs_retry, file, file_path):
                problem_pages.append((page, file_path))

        await self._set_task(task_id, "running", "retrying_failed_images", 0, len(problem_pages))
        if not problem_pages:
            return {"processed": 0, "fixed": 0, "failed": 0}

        fixed = 0
        failed = 0
        re_resolved = 0
        for processed, (page, file_path) in enumerate(problem_pages, start=1):
            await self._ensure_runnable(task_id)
            await self._log(
                "info", "problem_image_retry_started",
                f"正在修复第 {page.pic_index} 张图片（{processed}/{len(problem_pages)}）",
                task_id, manga_id, "retrying_failed_images",
                {"pic_index": page.pic_index, "page_url": page.page_url},
            )
            try:
                existing = await asyncio.to_thread(
                    find_valid_image_path, _target_image_path(save_dir, page), file_path
                )
                if existing is not None:
                    file_path = existing
                else:
                    file_path, refreshed = await self._download_page_image(
                        task_id, manga_id, page, file_path, refresh_on_failure=True
                    )
                    re_resolved += int(refreshed)
                await self._record_file(manga_id, page.pic_index, file_path, "valid")
                fixed += 1
                await self._log(
                    "info", "problem_image_retry_completed",
                    f"第 {page.pic_index} 张图片修复并校验成功",
                    task_id, manga_id, "retrying_failed_images",
                    {"pic_index": page.pic_index, "file_path": str(file_path)},
                )
            except TaskControlSignal:
                raise
            except Exception as exc:
                failed += 1
                error = _exception_message(exc)
                await self._record_file(manga_id, page.pic_index, file_path, "failed", error)
                await self._log(
                    "warning", "problem_image_retry_failed", error,
                    task_id, manga_id, "retrying_failed_images",
                    {"pic_index": page.pic_index, "file_path": str(file_path)},
                )
            await self._set_task(
                task_id, "running", "retrying_failed_images", processed, len(problem_pages)
            )
        return {
            "processed": len(problem_pages), "fixed": fixed, "failed": failed,
            "re_resolved": re_resolved,
        }

    async def _refresh_pic_url(
        self,
        task_id: str,
        manga_id: str,
        page: MangaPicPage,
    ) -> MangaPicPage:
        if not page.page_url:
            return page

        settings = get_settings()
        await self._ensure_runnable(task_id)
        await self._log(
            "info", "image_resolve_started", f"正在解析第 {page.pic_index} 张图片",
            task_id, manga_id, "downloading",
            {"page_index": page.pic_index, "page_url": page.page_url},
        )
        reader = re.search(
            r"/photos-slide-aid-(\d+)-sid-\d+\.html#image-(\d+)$", page.page_url
        )
        if reader:
            url = urljoin(settings.manga_main_url, f"photos-item-aid-{reader.group(1)}.html")
            script = await smart_fetch(url, referer=page.page_url.split("#", 1)[0])
            images = manga_parser.parse_reader_images(script, page.page_url)
            index = int(reader.group(2)) - 1
            pic_url = images[index] if index < len(images) else None
        else:
            html = await smart_fetch(page.page_url, referer=settings.manga_main_url)
            pic_url = manga_parser.parse_pic_url(html, page.page_url)
        await self._ensure_runnable(task_id)
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
            resolved = await MangaRepository(session).upsert_pic_page(
                manga_id=manga_id,
                page_index=page.page_index,
                page_url=page.page_url,
                page_name=page.page_name,
                pic_num=page.pic_num,
                pic_url=pic_url or "",
                status=status,
                error_message=error,
            )
        if pic_url:
            await self._log(
                "info", "image_url_resolved", f"第 {page.pic_index} 张图片地址解析成功",
                task_id, manga_id, "downloading",
                {"page_index": page.pic_index, "page_url": page.page_url},
            )
        return resolved

    async def _download_page_image(
        self, task_id: str, manga_id: str, page: MangaPicPage, file_path: Path,
        refresh_on_failure: bool = False,
    ) -> tuple[Path, bool]:
        refreshed = False
        if not page.pic_url:
            page = await self._refresh_pic_url(task_id, manga_id, page)
            refreshed = True
        if not page.pic_url:
            raise RuntimeError("未解析到图片地址")

        settings = get_settings()

        async def fetch_image() -> tuple[bytes, PreparedImage]:
            async with self._image_slot():
                data = await smart_fetch_bytes(page.pic_url, referer=page.page_url)
            await self._ensure_runnable(task_id)
            prepared = await asyncio.to_thread(
                prepare_image, data, enabled=settings.enable_image_compression,
                max_size_kb=settings.image_max_size_kb, allow_resize=settings.allow_image_resize,
            )
            return data, prepared

        try:
            data, prepared = await fetch_image()
        except TaskControlSignal:
            raise
        except Exception as exc:
            forbidden = isinstance(exc, ImageHTTPError) and exc.status_code == 403
            if refreshed or not (forbidden or refresh_on_failure):
                raise
            old_url = page.pic_url
            page = await self._refresh_pic_url(task_id, manga_id, page)
            if not page.pic_url:
                raise RuntimeError("刷新详情页后未解析到图片地址") from exc
            if page.pic_url == old_url:
                raise RuntimeError("详情页仍返回相同图片地址，停止本次下载，稍后再试") from exc
            refreshed = True
            await self._log(
                "info", "image_url_refreshed", "已刷新失效图片地址",
                task_id, manga_id, "downloading", {"pic_index": page.pic_index},
            )
            data, prepared = await fetch_image()
        backup = None
        if prepared.processed and settings.keep_original_images:
            async with SessionLocal() as session:
                info = await MangaRepository(session).get_info(manga_id)
            title = info.title if info and info.title else manga_id
            backup = original_dir(Path(settings.download_path), manga_id, title) / (
                file_path.stem + prepared.source_extension
            )
        await self._ensure_runnable(task_id)
        target, warning = await asyncio.to_thread(_save_image, file_path, data, prepared, backup)
        if warning:
            await self._log(
                "warning", "image_compression_warning", warning, task_id, manga_id,
                "downloading", {"pic_index": page.pic_index, "file_path": str(target)},
            )
        return target, refreshed

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
        await self._set_manga_status(manga_id, status, pic_count=total_files, error="")
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
        async with SessionLocal() as session:
            files = await FileRepository(session).list_for_manga(manga_id)
        if info is None or not files or len(files) != info.pic_count:
            raise RuntimeError("图片不完整，无法打包")
        await asyncio.to_thread(
            create_zip, source, target, [Path(file.file_path) for file in files]
        )

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
        from backend.app.api.notification import manager

        manga_id = task["manga_id"]
        async with SessionLocal() as session:
            manga = await MangaRepository(session).get_info(manga_id)
        if manga:
            task["title"] = manga.title
            task["cover_url"] = manga.cover_url

        await manager.broadcast(
            {
                "type": "task_progress",
                "task_id": task["task_id"],
                "manga_id": manga_id,
                "title": task.get("title", ""),
                "cover_url": task.get("cover_url", ""),
                "status": task["status"],
                "stage": task["stage"],
                "current": task["progress_current"],
                "total": task["progress_total"],
                "message": task["last_error"],
            }
        )


def _save_image(
    file_path: Path, source: bytes, prepared: PreparedImage, backup: Path | None
) -> tuple[Path, str]:
    if backup is not None and not is_valid_image_file(backup):
        try:
            atomic_write_bytes(backup, source)
        except OSError:
            # Keep the source in Manga if preserving the separate original fails.
            target = file_path.with_suffix(prepared.source_extension)
            atomic_write_bytes(target, source)
            return target, "原图备份失败，已在下载目录保存原图，跳过压缩"
    target = file_path.with_suffix(prepared.extension)
    atomic_write_bytes(target, prepared.data)
    return target, prepared.warning


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
    return not file_path.exists() or not is_valid_image_file(file_path)


task_runner = TaskRunner()
