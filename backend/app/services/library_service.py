from __future__ import annotations

import asyncio
import zipfile
from pathlib import Path
from typing import Any

from backend.app.core.config import get_settings
from backend.app.core.paths import manga_dir, safe_filename, zip_path
from backend.app.core.time import local_isoformat
from backend.app.crawler.downloader import image_extension, is_valid_image
from backend.app.db.database import SessionLocal
from backend.app.db.models import DownloadFile, DownloadTask, MangaInfo, MangaPicPage
from backend.app.db.repository import FileRepository, MangaRepository, TaskRepository, task_to_dict

ACTIVE_TASK_STATUSES = {"pending", "queued", "running", "paused"}
MangaPicPages = list[MangaPicPage]
DownloadFiles = list[DownloadFile]
FileRow = dict[str, Any]
FileRows = list[FileRow]


class LibraryService:
    async def list(self, q: str | None = None, status: str | None = None) -> dict:
        async with SessionLocal() as session:
            manga_repo = MangaRepository(session)
            file_repo = FileRepository(session)
            task_repo = TaskRepository(session)
            infos = await manga_repo.list_infos(q=q)
            items = []
            for info in infos:
                pic_pages = await manga_repo.list_pic_pages(info.id)
                files = await file_repo.list_for_manga(info.id)
                task = await task_repo.latest_for_manga(info.id)
                item = self._summary(info, pic_pages, files, task)
                if status and item["status"] != status:
                    continue
                items.append(item)
            return {"items": items, "total": len(items)}

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
            if total:
                status = "completed" if valid_count == total else "partial"
                await manga_repo.update_info_status(manga_id, status, pic_count=total)

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
        await asyncio.to_thread(_create_zip, source, target)
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
        status = self._computed_status(info.status, task_status, total_files, valid_files)
        download_dir = manga_dir(Path(get_settings().download_path), info.id, info.title or info.id)
        archive_path = zip_path(Path(get_settings().download_path), info.id, info.title or info.id)
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
            "zip_exists": archive_path.exists(),
            "zip_size": archive_path.stat().st_size if archive_path.exists() else 0,
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
        validated: FileRows = []
        for row in rows:
            path = Path(row["file_path"])
            if not path.exists():
                row["status"] = "missing"
                row["file_size"] = 0
                row["error_message"] = "文件不存在"
            elif not await asyncio.to_thread(_is_valid_image_file, path):
                row["status"] = "invalid"
                row["file_size"] = path.stat().st_size
                row["error_message"] = "图片校验失败"
            else:
                row["status"] = "valid"
                row["file_size"] = path.stat().st_size
                row["error_message"] = ""
            validated.append(row)
        return validated

    def _file_rows_sync(
        self,
        info: MangaInfo,
        pic_pages: MangaPicPages,
        files: DownloadFiles,
    ) -> FileRows:
        files_by_index = {file.pic_index: file for file in files}
        pages_by_index = {page.pic_index: page for page in pic_pages}
        expected_indexes = sorted(set(files_by_index) | set(pages_by_index))
        if not expected_indexes and info.pic_count:
            expected_indexes = list(range(1, info.pic_count + 1))

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
    ) -> str:
        if task_status in ACTIVE_TASK_STATUSES:
            return task_status
        if total_files and valid_files == total_files:
            return "completed"
        if total_files and valid_files != total_files:
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


def _is_valid_image_file(path: Path) -> bool:
    try:
        return is_valid_image(path.read_bytes())
    except OSError:
        return False


def _create_zip(source: Path, target: Path) -> None:
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as zf:
        for file in sorted(source.iterdir()):
            if file.is_file():
                zf.write(file, file.name)


library_service = LibraryService()
