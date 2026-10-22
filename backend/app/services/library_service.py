from __future__ import annotations

import asyncio
import re
import shutil
from collections.abc import Callable
from pathlib import Path
from typing import Any

from backend.app.core.config import get_settings
from backend.app.core.paths import download_filename, manga_dir, safe_filename, zip_path
from backend.app.core.time import local_isoformat
from backend.app.crawler.downloader import image_extension
from backend.app.crawler.images import find_valid_image_path
from backend.app.db.database import SessionLocal
from backend.app.db.models import DownloadFile, DownloadTask, MangaInfo, MangaPicPage
from backend.app.db.repository import FileRepository, MangaRepository, TaskRepository, task_to_dict
from backend.app.services.archive_service import create_zip, is_complete_zip
from backend.app.services.task_runner import task_runner

ACTIVE_TASK_STATUSES = {"pending", "queued", "running", "paused"}
MangaPicPages = list[MangaPicPage]
DownloadFiles = list[DownloadFile]
FileRow = dict[str, Any]
FileRows = list[FileRow]
SortItems = list[dict]


class LibraryService:
    async def delete(self, manga_id: str, delete_files: bool = False) -> None:
        _check_manga_id(manga_id)
        async with SessionLocal() as session:
            repo = MangaRepository(session)
            await repo.lock_for_removal()
            if await repo.get_info(manga_id) is None:
                raise KeyError(manga_id)
            tasks = TaskRepository(session)
            related = await tasks.list_for_manga(manga_id)
            if any(
                task.status in ACTIVE_TASK_STATUSES or task_runner.is_running(task.id)
                for task in related
            ):
                raise ValueError("仍有待处理、运行或暂停的任务，请先完成或取消任务")
            if delete_files:
                await asyncio.to_thread(
                    _delete_owned_files, Path(get_settings().download_path), manga_id,
                )
            await tasks.delete_inactive_for_manga(manga_id)
            await repo.delete(manga_id)
            await session.commit()

    async def delete_many(self, manga_ids: list[str], delete_files: bool = False) -> dict:
        deleted: list[str] = []
        failed: list[dict] = []
        for manga_id in dict.fromkeys(manga_ids):
            try:
                await self.delete(manga_id, delete_files)
                deleted.append(manga_id)
            except KeyError:
                failed.append({"manga_id": manga_id, "error": "资料库项目不存在"})
            except (ValueError, OSError) as exc:
                failed.append({"manga_id": manga_id, "error": str(exc)})
        return {"deleted": deleted, "failed": failed, "delete_files": delete_files}

    async def prepare_download(self, manga_id: str) -> Path:
        _check_manga_id(manga_id)
        base = Path(get_settings().download_path)
        async with SessionLocal() as session:
            repo = MangaRepository(session)
            info = await repo.get_info(manga_id)
            if info is None:
                raise KeyError(manga_id)
            related = await TaskRepository(session).list_for_manga(manga_id)
            if any(
                task.status in ACTIVE_TASK_STATUSES or task_runner.is_running(task.id)
                for task in related
            ):
                raise ValueError("作品仍有活跃任务，请完成或取消任务后下载")
            pages = await repo.list_pic_pages(manga_id)
            files = await FileRepository(session).list_for_manga(manga_id)
            for row in self._file_rows_sync(info, pages, files):
                _check_owned_path(base, Path(row["file_path"]), manga_id, "Manga")
            rows = await self._file_rows(info, pages, files, validate=True)
            if not rows or any(row["status"] != "valid" for row in rows):
                raise ValueError("图片缺失或校验失败，请先在后台补全后再下载")
            paths = [Path(row["file_path"]) for row in rows]
            for path in paths:
                _check_owned_path(base, path, manga_id, "Manga")
            target = zip_path(base, manga_id, info.title or manga_id)
            _check_owned_path(base, target, manga_id, "Zip")
            source = manga_dir(base, manga_id, info.title or manga_id)

        if not await asyncio.to_thread(is_complete_zip, target, paths):
            target.parent.mkdir(parents=True, exist_ok=True)
            await asyncio.to_thread(create_zip, source, target, paths)
        return target

    async def prepare_downloads(self, manga_ids: list[str]) -> dict:
        ready: list[dict] = []
        failed: list[dict] = []
        for manga_id in dict.fromkeys(manga_ids):
            try:
                target = await self.prepare_download(manga_id)
                ready.append({
                    "manga_id": manga_id,
                    "filename": download_filename(target, manga_id),
                    "url": f"/api/library/{manga_id}/download",
                })
            except KeyError:
                failed.append({"manga_id": manga_id, "error": "资料库项目不存在"})
            except (ValueError, OSError) as exc:
                failed.append({"manga_id": manga_id, "error": str(exc)})
        return {"ready": ready, "failed": failed}

    async def list(
        self,
        q: str | None = None,
        status: str | None = None,
        sort_by: str = "updated_at",
        sort_order: str = "desc",
        zip_status: str | None = None,
    ) -> dict:
        async with SessionLocal() as session:
            manga_repo = MangaRepository(session)
            file_repo = FileRepository(session)
            task_repo = TaskRepository(session)
            infos = await manga_repo.list_infos(q=q)
            manga_ids = {info.id for info in infos}

            # Batch fetch all related data in 3 queries instead of 3N
            pic_pages_map = await manga_repo.list_pic_pages_for_manga_ids(manga_ids)
            files_map = await file_repo.list_for_manga_ids(manga_ids)
            tasks_map = await task_repo.latest_for_manga_ids(manga_ids)

            items = []
            for info in infos:
                pic_pages = pic_pages_map.get(info.id, [])
                files = files_map.get(info.id, [])
                task = tasks_map.get(info.id)
                item = self._summary(info, pic_pages, files, task)
                if status and item["status"] != status:
                    continue
                if zip_status == "zipped" and not item["zip_exists"]:
                    continue
                if zip_status == "unzipped" and item["zip_exists"]:
                    continue
                items.append(item)
            items = self._sort_items(items, sort_by, sort_order)
            return {"items": items, "total": len(items)}

    _SORT_KEYS: dict[str, Callable[[dict], Any]] = {
        "updated_at": lambda i: i.get("updated_at") or "",
        "title": lambda i: (i.get("title") or "").lower(),
        "completeness": lambda i: i.get("completeness", 0),
        "pic_count": lambda i: i.get("pic_count", 0),
        "zip_size": lambda i: i.get("zip_size", 0),
    }

    def _sort_items(self, items: SortItems, sort_by: str, sort_order: str) -> SortItems:
        key_fn = self._SORT_KEYS.get(sort_by, self._SORT_KEYS["updated_at"])
        reverse = sort_order == "desc"
        return sorted(items, key=key_fn, reverse=reverse)

    async def get(self, manga_id: str) -> dict | None:
        async with SessionLocal() as session:
            manga_repo = MangaRepository(session)
            info = await manga_repo.get_info(manga_id)
            if info is None:
                return None
            pic_pages = await manga_repo.list_pic_pages(manga_id)
            files = await FileRepository(session).list_for_manga(manga_id)
            task = await TaskRepository(session).latest_for_manga(manga_id)
            return self._summary(info, pic_pages, files, task, include_files=True)

    async def verify(self, manga_id: str) -> dict | None:
        async with SessionLocal() as session:
            manga_repo = MangaRepository(session)
            file_repo = FileRepository(session)
            info = await manga_repo.get_info(manga_id)
            if info is None:
                return None
            pic_pages = await manga_repo.list_pic_pages(manga_id)
            files = await file_repo.list_for_manga(manga_id)
            rows = await self._file_rows(info, pic_pages, files, validate=True)
            for row in rows:
                await file_repo.upsert_file(
                    manga_id=manga_id,
                    pic_index=row["pic_index"],
                    file_path=row["file_path"],
                    file_name=row["file_name"],
                    file_size=row["file_size"],
                    status=row["status"],
                    error_message=row["error_message"],
                )
            total = len(rows)
            valid_count = len([row for row in rows if row["status"] == "valid"])
            complete = total > 0 and valid_count == total
            error = "" if complete else f"图片不完整：有效 {valid_count}/{total}"
            if complete and get_settings().is_zip:
                archive = zip_path(
                    Path(get_settings().download_path), info.id, info.title or info.id,
                )
                complete = await asyncio.to_thread(
                    is_complete_zip, archive, [Path(row["file_path"]) for row in rows],
                )
                if not complete:
                    error = "ZIP 不存在、不完整或校验失败"
            status = "completed" if complete else "partial"
            await manga_repo.update_info_status(manga_id, status, pic_count=total, error=error)

        summary = await self.get(manga_id)
        if summary is not None:
            summary["verify_status"] = "completed"
        return summary

    async def zip(self, manga_id: str, overwrite: bool = True) -> dict | None:
        summary = await self.verify(manga_id)
        if summary is None:
            return None
        if summary["total_files"] == 0 or summary["valid_files"] != summary["total_files"]:
            summary["zip_status"] = "blocked_incomplete"
            return summary

        source = Path(summary["download_dir"])
        target = Path(summary["zip_path"])
        if not source.exists():
            summary["zip_status"] = "blocked_missing_dir"
            return summary
        if target.exists() and not overwrite:
            summary["zip_status"] = "exists"
            return summary

        target.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(
            create_zip, source, target, [Path(row["file_path"]) for row in summary["files"]]
        )
        async with SessionLocal() as session:
            await MangaRepository(session).update_info_status(manga_id, "completed")
        refreshed = await self.get(manga_id)
        if refreshed is None:
            return None
        refreshed["zip_status"] = "created"
        return refreshed

    async def create_failed_retry_task(self, manga_id: str) -> dict | None:
        summary = await self.verify(manga_id)
        if summary is None:
            return None

        problem_files = [file for file in summary.get("files", []) if file["status"] != "valid"]
        if not problem_files:
            return {
                "status": "no_problem_files",
                "problem_files": 0,
                "task": None,
                "library": summary,
            }

        async with SessionLocal() as session:
            repo = TaskRepository(session)
            active = await repo.active_for_manga(manga_id)
            if active is not None:
                return {
                    "status": "already_active",
                    "problem_files": len(problem_files),
                    "task": task_to_dict(active),
                    "library": summary,
                }
            task = await repo.create(
                manga_id=manga_id,
                source="library_retry_failed",
                status="queued",
                stage="retrying_failed_images",
            )
            return {
                "status": "queued",
                "problem_files": len(problem_files),
                "task": task_to_dict(task),
                "library": summary,
            }

    def _summary(
        self,
        info: MangaInfo,
        pic_pages: MangaPicPages,
        files: DownloadFiles,
        task: DownloadTask | None = None,
        include_files: bool = False,
    ) -> dict:
        rows = self._file_rows_sync(info, pic_pages, files)
        total_files = max(info.pic_count, len(pic_pages), len(rows))
        valid_files = len([row for row in rows if row["status"] == "valid"])
        failed_files = len([row for row in rows if row["status"] in {"failed", "invalid"}])
        missing_files = max(total_files - valid_files - failed_files, 0)
        completeness = round(valid_files / total_files, 4) if total_files else 0
        task_status = task.status if task else None
        download_dir = manga_dir(Path(get_settings().download_path), info.id, info.title or info.id)
        archive_path = zip_path(Path(get_settings().download_path), info.id, info.title or info.id)
        archive_exists = archive_path.is_file() and archive_path.stat().st_size > 0
        zip_ready = not get_settings().is_zip or archive_exists
        status = self._computed_status(
            info.status, task_status, total_files, valid_files, zip_ready,
        )
        payload: dict[str, Any] = {
            "manga_id": info.id,
            "title": info.title,
            "cover_url": info.cover_url,
            "status": status,
            "manga_status": info.status,
            "task_id": task.id if task else None,
            "task_status": task_status,
            "page_count": info.page_count,
            "pic_count": info.pic_count,
            "total_files": total_files,
            "valid_files": valid_files,
            "failed_files": failed_files,
            "missing_files": missing_files,
            "completeness": completeness,
            "download_dir": str(download_dir),
            "download_dir_exists": download_dir.exists(),
            "zip_path": str(archive_path),
            "zip_exists": archive_exists,
            "zip_size": archive_path.stat().st_size if archive_exists else 0,
            "last_error": info.last_error or None,
            "created_at": local_isoformat(info.created_at),
            "updated_at": local_isoformat(info.updated_at),
        }
        if include_files:
            payload["files"] = rows
        return payload

    async def _file_rows(
        self,
        info: MangaInfo,
        pic_pages: MangaPicPages,
        files: DownloadFiles,
        validate: bool = False,
    ) -> FileRows:
        rows = self._file_rows_sync(info, pic_pages, files)
        if not validate:
            return rows
        pages_by_index = {page.pic_index: page for page in pic_pages}

        def _validate_row(row: FileRow) -> FileRow:
            path = Path(row["file_path"])
            page = pages_by_index.get(row["pic_index"])
            existing = find_valid_image_path(
                _expected_file_path(info, page, row["pic_index"]), path
            )
            if existing is not None:
                path = existing
                row["file_path"] = str(path)
                row["file_name"] = path.name
                row["exists"] = True
            if not path.exists():
                row["status"] = "missing"
                row["file_size"] = 0
                row["error_message"] = "文件不存在"
            elif existing is None:
                row["status"] = "invalid"
                row["file_size"] = path.stat().st_size
                row["error_message"] = "图片校验失败"
            else:
                row["status"] = "valid"
                row["file_size"] = path.stat().st_size
                row["error_message"] = ""
            return row

        validated = await asyncio.gather(
            *(asyncio.to_thread(_validate_row, row) for row in rows)
        )
        return list(validated)

    def _file_rows_sync(
        self,
        info: MangaInfo,
        pic_pages: MangaPicPages,
        files: DownloadFiles,
    ) -> FileRows:
        files_by_index = {file.pic_index: file for file in files}
        pages_by_index = {page.pic_index: page for page in pic_pages}
        expected_count = max([info.pic_count, *files_by_index, *pages_by_index])
        expected_indexes = range(1, expected_count + 1)

        rows: FileRows = []
        for pic_index in expected_indexes:
            file = files_by_index.get(pic_index)
            page = pages_by_index.get(pic_index)
            file_path = Path(file.file_path) if file else _expected_file_path(info, page, pic_index)
            status = file.status if file else "missing"
            if status == "valid" and not file_path.exists():
                status = "missing"
            size = file_path.stat().st_size if file_path.exists() else 0
            rows.append(
                {
                    "pic_index": pic_index,
                    "pic_num": page.pic_num if page else "",
                    "pic_url": page.pic_url if page else "",
                    "page_url": page.page_url if page else "",
                    "file_path": str(file_path),
                    "file_name": file_path.name,
                    "file_size": size,
                    "exists": file_path.exists(),
                    "status": status,
                    "error_message": file.error_message if file else "",
                    "updated_at": local_isoformat(file.updated_at if file else None),
                }
            )
        return rows

    def _computed_status(
        self,
        manga_status: str,
        task_status: str | None,
        total_files: int,
        valid_files: int,
        zip_ready: bool,
    ) -> str:
        if task_status in ACTIVE_TASK_STATUSES:
            return task_status
        if total_files and valid_files != total_files:
            return "partial"
        if manga_status == "completed" and (not total_files or not zip_ready):
            return "partial"
        return manga_status


def _expected_file_path(info: MangaInfo, page: MangaPicPage | None, pic_index: int) -> Path:
    settings = get_settings()
    title = info.title or info.id
    if page is None:
        filename = f"{pic_index:04d}_{pic_index}.jpg"
    else:
        ext = image_extension(page.pic_url)
        safe_pic_num = safe_filename(page.pic_num, str(page.pic_index))
        filename = f"{page.pic_index:04d}_{safe_pic_num}{ext}"
    return manga_dir(Path(settings.download_path), info.id, title) / filename


def _check_manga_id(manga_id: str) -> None:
    if not re.fullmatch(r"\d+", manga_id):
        raise ValueError("无效的作品 ID")


def _check_owned_path(base: Path, path: Path, manga_id: str, category: str) -> None:
    root = base / category
    try:
        relative = path.absolute().relative_to(root.absolute())
    except ValueError:
        raise ValueError("文件路径不属于该作品的下载目录") from None
    expected_depth = 2 if category == "Manga" else 1
    if (
        len(relative.parts) != expected_depth
        or not relative.parts[0].startswith(f"[{manga_id}] ")
        or root.is_symlink()
        or (root / relative.parts[0]).is_symlink()
        or path.is_symlink()
        or not path.resolve().is_relative_to(root.resolve())
    ):
        raise ValueError("文件路径不安全，拒绝操作")


def _delete_owned_files(base: Path, manga_id: str) -> None:
    targets: list[Path] = []
    for category in ("Manga", "Original", "Zip"):
        root = base / category
        if root.is_symlink():
            raise ValueError("下载分类目录是符号链接，拒绝删除")
        if not root.exists():
            continue
        for path in root.iterdir():
            if not path.name.startswith(f"[{manga_id}] "):
                continue
            if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):
                raise ValueError("作品路径是符号链接或超出下载目录，拒绝删除")
            targets.append(path)
    for path in targets:
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink(missing_ok=True)


library_service = LibraryService()
