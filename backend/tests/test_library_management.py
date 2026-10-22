import io
import zipfile
from pathlib import Path
from urllib.parse import unquote
from uuid import uuid4

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.app.core.config import get_settings
from backend.app.core.paths import manga_dir, original_dir, zip_path
from backend.app.db.models import Base, DownloadTask
from backend.app.db.repository import FileRepository, MangaRepository, TaskRepository
from backend.app.main import app
from backend.app.services import library_service as library_module
from backend.app.services import task_service as tasks_module
from backend.app.services.library_service import library_service
from backend.app.services.task_runner import task_runner
from backend.tests.image_fixtures import image_bytes


@pytest_asyncio.fixture
async def management_db(tmp_path, monkeypatch):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'management.sqlite'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(library_module, "SessionLocal", factory)
    monkeypatch.setattr(tasks_module, "SessionLocal", factory)
    monkeypatch.setattr(get_settings(), "download_path", tmp_path / "data")
    yield factory
    await engine.dispose()


async def seed(factory, status="completed", count=2, title="城市日记"):
    manga_id = str(uuid4().int)
    directory = manga_dir(Path(get_settings().download_path), manga_id, title)
    directory.mkdir(parents=True)
    async with factory() as session:
        repo = MangaRepository(session)
        await repo.upsert_info(manga_id, title, "", 1, "completed")
        await repo.update_info_status(manga_id, "completed", pic_count=count)
        for index in range(1, count + 1):
            path = directory / f"{index:04d}_{index}.jpg"
            path.write_bytes(image_bytes())
            await repo.upsert_pic_page(
                manga_id, index, f"https://example.test/{index}", "page", str(index),
                f"https://example.test/{index}.jpg",
            )
            await FileRepository(session).upsert_file(
                manga_id, index, str(path), path.name, path.stat().st_size, "valid",
            )
        task = await TaskRepository(session).create(manga_id, "test", status)
    return manga_id, task.id, directory


@pytest.mark.asyncio
async def test_clearing_completed_keeps_library_files_and_other_task_states(management_db):
    complete_id, complete_task, directory = await seed(management_db)
    pending_id, pending_task, _ = await seed(management_db, "pending")
    failed_id, failed_task, _ = await seed(management_db, "failed")
    await library_service.prepare_download(complete_id)
    client = TestClient(app)
    assert client.delete(f"/api/tasks/{pending_task}").status_code == 409
    result = client.delete("/api/tasks/completed")
    assert result.status_code == 200
    assert result.json()["data"] == {"deleted": 1, "task_ids": [complete_task]}
    assert directory.exists()
    assert (await library_service.get(complete_id)) is not None
    assert client.get(f"/api/extension/item/{complete_id}").json()["data"]["status"] == "completed"
    async with management_db() as session:
        assert await TaskRepository(session).get(complete_task) is None
        assert (await TaskRepository(session).get(pending_task)).manga_id == pending_id
        assert (await TaskRepository(session).get(failed_task)).manga_id == failed_id
    assert client.delete("/api/tasks/completed").json()["data"]["deleted"] == 0
    assert client.delete(f"/api/tasks/{complete_task}").status_code == 404


@pytest.mark.asyncio
async def test_delete_library_defaults_to_preserving_files_and_removes_related_rows(management_db):
    manga_id, task_id, directory = await seed(management_db)
    client = TestClient(app)
    response = client.post("/api/library/delete", json={"manga_ids": [manga_id, manga_id]})
    assert response.status_code == 200
    assert response.json()["data"]["deleted"] == [manga_id]
    assert directory.exists()
    assert await library_service.get(manga_id) is None
    async with management_db() as session:
        assert await TaskRepository(session).get(task_id) is None
        assert not await FileRepository(session).list_for_manga(manga_id)
        assert not await MangaRepository(session).list_pic_pages(manga_id)


@pytest.mark.asyncio
async def test_file_deletion_only_affects_selected_id_and_all_owned_categories(management_db):
    manga_id, _, directory = await seed(management_db)
    other_id, _, other_directory = await seed(management_db)
    base = Path(get_settings().download_path)
    originals = original_dir(base, manga_id, "旧标题")
    originals.mkdir(parents=True)
    (originals / "original.jpg").write_bytes(image_bytes())
    archive = zip_path(base, manga_id, "旧标题")
    archive.parent.mkdir(parents=True)
    archive.write_bytes(b"archive")
    response = TestClient(app).delete(f"/api/library/{manga_id}?delete_files=true")
    assert response.status_code == 200
    assert not directory.exists() and not originals.exists() and not archive.exists()
    assert other_directory.exists() and await library_service.get(other_id) is not None


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["pending", "queued", "running", "paused"])
async def test_active_library_is_not_removed_or_exported(management_db, status):
    manga_id, task_id, directory = await seed(management_db, status)
    client = TestClient(app)
    assert client.delete(f"/api/library/{manga_id}?delete_files=true").status_code == 409
    assert client.get(f"/api/library/{manga_id}/download").status_code == 409
    assert directory.exists()
    async with management_db() as session:
        assert await TaskRepository(session).get(task_id) is not None


@pytest.mark.asyncio
async def test_cancelled_task_still_draining_blocks_library_removal(management_db, monkeypatch):
    manga_id, task_id, directory = await seed(management_db, "cancelled")
    monkeypatch.setattr(task_runner, "is_running", lambda value: value == task_id)
    assert TestClient(app).delete(f"/api/library/{manga_id}?delete_files=true").status_code == 409
    assert directory.exists()


@pytest.mark.asyncio
async def test_ten_selected_items_download_as_ten_separate_files(management_db):
    ids = [(await seed(management_db))[0] for _ in range(10)]
    client = TestClient(app)
    prepared = client.post("/api/library/downloads", json={"manga_ids": ids + [ids[0]]})
    assert prepared.status_code == 200
    result = prepared.json()["data"]
    assert not result["failed"] and len(result["ready"]) == 10
    assert len({item["url"] for item in result["ready"]}) == 10
    for item in result["ready"]:
        response = client.get(item["url"])
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/zip"
        assert "attachment;" in response.headers["content-disposition"]
        assert item["filename"] == "城市日记.zip"
        filename = response.headers["content-disposition"].split("filename*=utf-8''")[1]
        assert unquote(filename) == item["filename"]
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            assert sorted(archive.namelist()) == ["0001_1.jpg", "0002_2.jpg"]
    async with management_db() as session:
        assert len(list((await session.execute(select(DownloadTask))).scalars())) == 10


@pytest.mark.asyncio
@pytest.mark.parametrize("title, expected", [
    ("[作者] 城市日记", "[作者] 城市日记.zip"),
    ("日本語の作品 [翻译]", "日本語の作品 [翻译].zip"),
    ("作品/标题:第一卷", "作品_标题_第一卷.zip"),
])
async def test_export_name_omits_only_storage_id_and_preserves_existing_archive(
    management_db, title, expected,
):
    manga_id, _, directory = await seed(management_db, title=title)
    archive = await library_service.prepare_download(manga_id)
    content = archive.read_bytes()
    modified = archive.stat().st_mtime_ns
    client = TestClient(app)
    prepared = client.post("/api/library/downloads", json={"manga_ids": [manga_id]})
    assert prepared.json()["data"]["ready"][0]["filename"] == expected
    response = client.get(f"/api/library/{manga_id}/download")
    assert response.status_code == 200
    filename = response.headers["content-disposition"].split("filename*=utf-8''")[1]
    assert unquote(filename) == expected
    assert archive.name.startswith(f"[{manga_id}] ")
    assert directory.name.startswith(f"[{manga_id}] ")
    assert archive.read_bytes() == content
    assert archive.stat().st_mtime_ns == modified


@pytest.mark.asyncio
async def test_download_rebuilds_bad_zip_and_reports_missing_items_individually(management_db):
    good_id, _, directory = await seed(management_db)
    bad_id, _, bad_directory = await seed(management_db)
    (bad_directory / "0002_2.jpg").unlink()
    archive = zip_path(Path(get_settings().download_path), good_id, "城市日记")
    archive.parent.mkdir(parents=True)
    archive.write_bytes(b"bad zip")
    result = TestClient(app).post(
        "/api/library/downloads", json={"manga_ids": [good_id, bad_id, "99999999"]},
    ).json()["data"]
    assert [item["manga_id"] for item in result["ready"]] == [good_id]
    assert [item["manga_id"] for item in result["failed"]] == [bad_id, "99999999"]
    with zipfile.ZipFile(archive) as output:
        assert output.read("0001_1.jpg") == (directory / "0001_1.jpg").read_bytes()


@pytest.mark.asyncio
async def test_directory_symlink_never_deletes_or_exports_external_files(management_db, tmp_path):
    manga_id, _, directory = await seed(management_db)
    outside = tmp_path / "outside"
    directory.rename(outside)
    directory.symlink_to(outside, target_is_directory=True)
    client = TestClient(app)
    assert client.delete(f"/api/library/{manga_id}?delete_files=true").status_code == 409
    assert client.get(f"/api/library/{manga_id}/download").status_code == 409
    assert (outside / "0001_1.jpg").exists()
    assert await library_service.get(manga_id) is not None
    assert client.post("/api/library/delete", json={"manga_ids": ["../outside"]}).status_code == 422


@pytest.mark.asyncio
async def test_batch_delete_reports_active_and_missing_items_individually(management_db):
    good, _, _ = await seed(management_db)
    active, _, directory = await seed(management_db, "paused")
    response = TestClient(app).post("/api/library/delete", json={
        "manga_ids": [good, active, "123456789", good], "delete_files": False,
    })
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["deleted"] == [good]
    assert [item["manga_id"] for item in data["failed"]] == [active, "123456789"]
    assert directory.exists()
    assert await library_service.get(good) is None
    assert await library_service.get(active) is not None


@pytest.mark.asyncio
async def test_filesystem_failure_preserves_database_records(management_db, monkeypatch):
    manga_id, task_id, directory = await seed(management_db)

    def fail_remove(*args, **kwargs):
        raise OSError("Permission denied")

    monkeypatch.setattr(library_module.shutil, "rmtree", fail_remove)
    response = TestClient(app).post("/api/library/delete", json={
        "manga_ids": [manga_id], "delete_files": True,
    })
    data = response.json()["data"]
    assert data["deleted"] == []
    assert data["failed"][0]["error"] == "Permission denied"
    assert directory.exists()
    assert await library_service.get(manga_id) is not None
    async with management_db() as session:
        assert await TaskRepository(session).get(task_id) is not None
