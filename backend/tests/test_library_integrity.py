import zipfile
from pathlib import Path
from uuid import uuid4

import pytest

from backend.app.core.config import get_settings
from backend.app.core.paths import manga_dir, zip_path
from backend.app.db.database import SessionLocal
from backend.app.db.repository import FileRepository, MangaRepository
from backend.app.services.library_service import library_service
from backend.tests.image_fixtures import image_bytes


async def seed_item(pic_count: int, indexes: tuple[int, ...]) -> tuple[str, Path]:
    manga_id = uuid4().hex
    title = "Library Integrity"
    base = Path(get_settings().download_path)
    directory = manga_dir(base, manga_id, title)
    directory.mkdir(parents=True)
    async with SessionLocal() as session:
        repo = MangaRepository(session)
        await repo.upsert_info(manga_id, title, "", 1, "partial")
        await repo.update_info_status(manga_id, "partial", pic_count=pic_count)
        for index in indexes:
            image = directory / f"{index:04d}_{index}.jpg"
            image.write_bytes(image_bytes())
            await repo.upsert_pic_page(
                manga_id, index, f"https://example.test/page/{index}",
                f"id_{manga_id}_pic_{index}", str(index),
                f"https://example.test/{index}.jpg", status="resolved",
            )
            await FileRepository(session).upsert_file(
                manga_id, index, str(image), image.name, image.stat().st_size, "valid",
            )
    return manga_id, zip_path(base, manga_id, title)


@pytest.mark.asyncio
@pytest.mark.parametrize("indexes", [(1, 2), (1, 3)])
async def test_verify_preserves_expected_count_and_records_missing_images(monkeypatch, indexes):
    monkeypatch.setattr(get_settings(), "is_zip", False)
    manga_id, _ = await seed_item(3, indexes)

    for _ in range(2):
        result = await library_service.verify(manga_id)
        assert result is not None
        assert result["status"] == result["manga_status"] == "partial"
        assert result["pic_count"] == result["total_files"] == 3
        assert result["valid_files"] == 2
        assert result["missing_files"] == 1
        assert [row["pic_index"] for row in result["files"]] == [1, 2, 3]

    async with SessionLocal() as session:
        info = await MangaRepository(session).get_info(manga_id)
        files = await FileRepository(session).list_for_manga(manga_id)
        assert info is not None and info.pic_count == 3
        assert len(files) == 3
        assert sum(file.status == "missing" for file in files) == 1


@pytest.mark.asyncio
async def test_incomplete_library_cannot_be_zipped(monkeypatch):
    monkeypatch.setattr(get_settings(), "is_zip", False)
    manga_id, archive = await seed_item(3, (1, 2))
    result = await library_service.zip(manga_id)
    assert result is not None
    assert result["zip_status"] == "blocked_incomplete"
    assert result["status"] == "partial"
    assert not archive.exists()


@pytest.mark.asyncio
@pytest.mark.parametrize("archive_state", ["missing", "corrupt", "incomplete", "outdated"])
async def test_zip_required_for_completed_status(monkeypatch, archive_state):
    monkeypatch.setattr(get_settings(), "is_zip", True)
    manga_id, archive = await seed_item(2, (1, 2))
    archive.parent.mkdir(parents=True, exist_ok=True)
    if archive_state == "corrupt":
        archive.write_bytes(b"not a zip archive")
    elif archive_state == "incomplete":
        with zipfile.ZipFile(archive, "w") as output:
            output.writestr("0001_1.jpg", image_bytes())
    elif archive_state == "outdated":
        old_image = image_bytes(color="black")
        assert len(old_image) == len(image_bytes())
        with zipfile.ZipFile(archive, "w") as output:
            output.writestr("0001_1.jpg", old_image)
            output.writestr("0002_2.jpg", old_image)

    result = await library_service.verify(manga_id)
    assert result is not None
    assert result["valid_files"] == result["total_files"] == 2
    assert result["status"] == result["manga_status"] == "partial"
    assert result["pic_count"] == 2
    assert (await library_service.get(manga_id))["status"] == "partial"

    result = await library_service.zip(manga_id)
    assert result is not None
    assert result["zip_status"] == "created"
    assert result["status"] == result["manga_status"] == "completed"
    assert result["zip_exists"]
    assert (await library_service.verify(manga_id))["status"] == "completed"


@pytest.mark.asyncio
async def test_complete_images_can_finish_when_zip_is_disabled(monkeypatch):
    monkeypatch.setattr(get_settings(), "is_zip", False)
    manga_id, archive = await seed_item(2, (1, 2))
    result = await library_service.verify(manga_id)
    assert result is not None
    assert result["status"] == result["manga_status"] == "completed"
    assert not archive.exists()


@pytest.mark.asyncio
async def test_library_does_not_hide_persisted_failure(monkeypatch):
    monkeypatch.setattr(get_settings(), "is_zip", True)
    manga_id, _ = await seed_item(1, (1,))
    async with SessionLocal() as session:
        await MangaRepository(session).update_info_status(
            manga_id, "failed", error="ZIP write failed",
        )
    result = await library_service.get(manga_id)
    assert result is not None
    assert result["status"] == "failed"
    assert result["last_error"] == "ZIP write failed"
