import json
import zipfile
from io import BytesIO
from pathlib import Path
from random import Random
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from backend.app.core.config import Settings, get_settings, reload_settings
from backend.app.core.paths import manga_dir, original_dir, zip_path
from backend.app.crawler import image_processing
from backend.app.crawler.image_processing import prepare_image
from backend.app.crawler.images import is_valid_image
from backend.app.db.database import SessionLocal
from backend.app.db.repository import FileRepository, MangaRepository, TaskRepository
from backend.app.main import app
from backend.app.services import task_runner as runner_module
from backend.tests.image_fixtures import image_bytes


def noisy_image(format="JPEG", size=(256, 256)) -> bytes:
    output = BytesIO()
    with Image.frombytes("RGB", size, Random(10).randbytes(size[0] * size[1] * 3)) as image:
        image.save(output, format=format, quality=98)
    return output.getvalue()


def dimensions(data):
    with Image.open(BytesIO(data)) as image:
        return image.size


def test_defaults_leave_compression_and_resize_disabled():
    settings = Settings()
    assert not settings.enable_image_compression
    assert not settings.allow_image_resize
    assert settings.image_max_size_kb == 1024
    assert settings.keep_original_images


@pytest.mark.parametrize("format", ["JPEG", "PNG", "WEBP", "BMP", "AVIF"])
def test_disabled_compression_preserves_bytes_and_format(format):
    data = noisy_image(format)
    result = prepare_image(data, enabled=False, max_size_kb=1, allow_resize=True)
    assert result.data == data
    assert result.extension == result.source_extension
    assert not result.processed
    assert not result.warning


def test_under_limit_image_is_not_reencoded():
    data = image_bytes("WEBP")
    result = prepare_image(data, enabled=True, max_size_kb=1024, allow_resize=True)
    assert result.data == data
    assert result.extension == ".webp"
    assert not result.processed


@pytest.mark.parametrize("format", ["JPEG", "PNG", "WEBP", "BMP", "AVIF"])
def test_compression_without_resize_keeps_dimensions(format):
    data = noisy_image(format)
    result = prepare_image(data, enabled=True, max_size_kb=25, allow_resize=False)
    assert result.processed
    assert len(result.data) <= 25 * 1024
    assert len(result.data) < len(data)
    assert dimensions(result.data) == dimensions(data)
    assert is_valid_image(result.data)


def test_impossible_limit_without_resize_reports_warning_but_keeps_valid_image():
    data = noisy_image()
    result = prepare_image(data, enabled=True, max_size_kb=1, allow_resize=False)
    assert dimensions(result.data) == dimensions(data)
    assert len(result.data) > 1024
    assert len(result.data) < len(data)
    assert is_valid_image(result.data)
    assert result.warning


@pytest.mark.parametrize("format", ["JPEG", "PNG", "WEBP", "BMP"])
def test_resize_requires_opt_in_and_reaches_limit(format):
    data = noisy_image(format)
    result = prepare_image(data, enabled=True, max_size_kb=1, allow_resize=True)
    assert len(result.data) <= 1024
    assert dimensions(result.data)[0] < dimensions(data)[0]
    assert is_valid_image(result.data)
    assert not result.warning


def test_transparent_png_remains_transparent():
    output = BytesIO()
    with Image.frombytes("RGBA", (128, 128), Random(8).randbytes(128 * 128 * 4)) as image:
        image.putpixel((0, 0), (255, 0, 0, 0))
        image.save(output, format="PNG")
    result = prepare_image(output.getvalue(), enabled=True, max_size_kb=10, allow_resize=False)
    assert result.processed
    assert dimensions(result.data) == (128, 128)
    with Image.open(BytesIO(result.data)) as image:
        assert image.convert("RGBA").getpixel((0, 0))[3] == 0


def test_animated_image_is_preserved_instead_of_losing_frames():
    output = BytesIO()
    with Image.open(BytesIO(noisy_image("PNG", (64, 64)))) as first:
        with Image.open(BytesIO(noisy_image("PNG", (65, 65)))) as second:
            first.save(output, format="GIF", save_all=True, append_images=[second], duration=100)
    data = output.getvalue()
    assert len(data) > 1024
    result = prepare_image(data, enabled=True, max_size_kb=1, allow_resize=True)
    assert result.data == data
    assert not result.processed
    assert result.warning
    with Image.open(BytesIO(result.data)) as image:
        assert image.n_frames == 2


def test_encoder_failure_falls_back_to_original(monkeypatch):
    def fail(*args):
        raise OSError("encoder failed")

    monkeypatch.setattr(image_processing, "_encode_candidates", fail)
    data = noisy_image()
    result = prepare_image(data, enabled=True, max_size_kb=1, allow_resize=True)
    assert result.data == data
    assert not result.processed
    assert "压缩失败" in result.warning


def test_bad_encoded_output_falls_back_to_original(monkeypatch):
    monkeypatch.setattr(image_processing, "_encode_candidates", lambda *args: iter([b"bad image"]))
    data = noisy_image()
    result = prepare_image(data, enabled=True, max_size_kb=1, allow_resize=True)
    assert result.data == data
    assert "压缩失败" in result.warning


def test_invalid_source_is_not_hidden_by_compression_fallback():
    with pytest.raises(OSError):
        prepare_image(b"invalid", enabled=True, max_size_kb=1, allow_resize=True)


@pytest.fixture
def isolated_config(monkeypatch, tmp_path):
    path = tmp_path / "compression-config.json"
    monkeypatch.setenv("WNACG_CONFIG_PATH", str(path))
    get_settings.cache_clear()
    yield path
    get_settings.cache_clear()


def test_config_api_round_trip_and_partial_update(isolated_config):
    client = TestClient(app)
    initial = client.get("/api/config").json()["data"]
    assert initial["enable_image_compression"] is False
    payload = {
        "enable_image_compression": True,
        "image_max_size_kb": 25,
        "keep_original_images": False,
        "allow_image_resize": True,
    }
    response = client.post("/api/config", json=payload)
    assert response.status_code == 200
    for key, value in payload.items():
        assert response.json()["data"][key] == value
        assert json.loads(isolated_config.read_text())[key] == value
    reload_settings()
    assert client.get("/api/config").json()["data"]["image_max_size_kb"] == 25
    response = client.post("/api/config", json={"enable_image_compression": False})
    assert response.status_code == 200
    assert response.json()["data"]["enable_image_compression"] is False
    for key in ("image_max_size_kb", "keep_original_images", "allow_image_resize"):
        assert response.json()["data"][key] == payload[key]


@pytest.mark.parametrize("limit", [0, -1, 102401, 1.5])
def test_config_rejects_invalid_limits_without_changing_saved_config(isolated_config, limit):
    client = TestClient(app)
    assert client.post("/api/config", json={"image_max_size_kb": 100}).status_code == 200
    before = isolated_config.read_bytes()
    assert client.post("/api/config", json={"image_max_size_kb": limit}).status_code == 422
    assert isolated_config.read_bytes() == before
    assert get_settings().image_max_size_kb == 100


@pytest.mark.asyncio
@pytest.mark.parametrize("keep_original", [False, True])
@pytest.mark.parametrize("repair", [False, True])
async def test_download_stores_processed_file_original_and_zip_correctly(
    monkeypatch, keep_original, repair
):
    settings = get_settings()
    for key, value in {
        "enable_image_compression": True,
        "image_max_size_kb": 25,
        "keep_original_images": keep_original,
        "allow_image_resize": False,
    }.items():
        monkeypatch.setattr(settings, key, value)
    manga_id = uuid4().hex
    title = "Compression Test"
    async with SessionLocal() as session:
        repo = MangaRepository(session)
        await repo.upsert_info(manga_id, title, "", 1, "ready")
        await repo.update_info_status(manga_id, "ready", pic_count=1)
        await repo.upsert_pic_page(
            manga_id,
            1,
            "https://example.test/page.html",
            "page",
            "001",
            "https://example.test/source.bmp",
        )
        task = await TaskRepository(session).create(manga_id, "compression-test", "queued")
    data = noisy_image("BMP")
    fetch = AsyncMock(return_value=data)
    monkeypatch.setattr(runner_module, "smart_fetch_bytes", fetch)
    runner = runner_module.TaskRunner()
    if repair:
        assert (await runner._download_problem_images(task.id, manga_id))["fixed"] == 1
    else:
        assert await runner._download_images(task.id, manga_id) == 1
    directory = manga_dir(Path(settings.download_path), manga_id, title)
    target = directory / "0001_001.png"
    assert target.exists()
    assert not (directory / "0001_001.bmp").exists()
    assert len(target.read_bytes()) <= 25 * 1024
    assert dimensions(target.read_bytes()) == (256, 256)
    async with SessionLocal() as session:
        rows = await FileRepository(session).list_for_manga(manga_id)
    assert rows[0].file_path == str(target)
    assert rows[0].file_size == target.stat().st_size
    assert rows[0].status == "valid"
    backup = original_dir(Path(settings.download_path), manga_id, title) / "0001_001.bmp"
    assert backup.exists() == keep_original
    if keep_original:
        assert backup.read_bytes() == data
    await runner._zip_manga(manga_id)
    with zipfile.ZipFile(zip_path(Path(settings.download_path), manga_id, title)) as archive:
        assert archive.namelist() == [target.name]
        assert archive.read(target.name) == target.read_bytes()
    # A changed compression setting does not recompress or redownload valid files.
    before = target.read_bytes()
    monkeypatch.setattr(settings, "image_max_size_kb", 1)
    monkeypatch.setattr(settings, "allow_image_resize", True)
    assert await runner._download_images(task.id, manga_id) == 1
    fetch.assert_awaited_once()
    assert target.read_bytes() == before


def test_original_backup_failure_saves_original_instead(monkeypatch, tmp_path):
    data = noisy_image("BMP")
    prepared = prepare_image(data, enabled=True, max_size_kb=25, allow_resize=False)
    assert prepared.processed
    target = tmp_path / "Manga" / "page.bmp"
    backup = tmp_path / "Original" / "page.bmp"
    write = runner_module.atomic_write_bytes

    def fail_backup(path, contents):
        if path == backup:
            raise OSError("backup disk full")
        write(path, contents)

    monkeypatch.setattr(runner_module, "atomic_write_bytes", fail_backup)
    saved, warning = runner_module._save_image(target, data, prepared, backup)
    assert saved == target
    assert saved.read_bytes() == data
    assert "备份失败" in warning
    assert not target.with_suffix(".png").exists()


def test_existing_valid_original_is_not_overwritten(tmp_path):
    data = noisy_image()
    prepared = prepare_image(data, enabled=True, max_size_kb=25, allow_resize=False)
    target = tmp_path / "Manga" / "page.jpg"
    backup = tmp_path / "Original" / "page.jpg"
    backup.parent.mkdir()
    original = image_bytes()
    backup.write_bytes(original)
    runner_module._save_image(target, data, prepared, backup)
    assert backup.read_bytes() == original
    assert target.read_bytes() == prepared.data
