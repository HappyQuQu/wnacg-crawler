import asyncio
from pathlib import Path

from fastapi.testclient import TestClient

from backend.app.core.config import get_settings
from backend.app.core.paths import manga_dir
from backend.app.crawler.block_detector import is_blocked, is_cloudflare_challenge
from backend.app.crawler.downloader import image_extension, is_valid_image
from backend.app.crawler.parser import manga_parser
from backend.app.db.database import SessionLocal, init_db
from backend.app.db.repository import FileRepository, MangaRepository, TaskRepository
from backend.app.main import app
from backend.tests.image_fixtures import image_bytes


def test_health_check():
    client = TestClient(app)
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["ok"] is True


def test_parse_create_and_list_task():
    client = TestClient(app)
    manga_id = "900000001"

    parse_response = client.post(
        "/api/inputs/parse",
        json={"text": f"{manga_id}\nhttps://www.wnacg.com/photos-index-page-1-aid-{manga_id}.html"},
    )
    assert parse_response.status_code == 200
    parse_data = parse_response.json()["data"]
    assert parse_data["summary"]["valid"] == 1
    assert parse_data["summary"]["duplicate"] == 1
    assert parse_data["items"][0]["manga_id"] == manga_id

    create_response = client.post(
        "/api/tasks/batch",
        json={"items": [{"manga_id": manga_id}], "source": "test", "start_immediately": False},
    )
    assert create_response.status_code == 200
    created = create_response.json()["data"]["created"]
    skipped = create_response.json()["data"]["skipped"]
    assert created or skipped

    list_response = client.get("/api/tasks")
    assert list_response.status_code == 200
    items = list_response.json()["data"]["items"]
    assert any(item["manga_id"] == manga_id for item in items)

    parse_again = client.post("/api/inputs/parse", json={"text": manga_id})
    assert parse_again.status_code == 200
    assert parse_again.json()["data"]["items"][0]["status"] == "running"


def test_library_reads_database_and_files():
    manga_id = "900000002"
    asyncio.run(_seed_library_item(manga_id))

    client = TestClient(app)
    list_response = client.get(f"/api/library?q={manga_id}")
    assert list_response.status_code == 200
    items = list_response.json()["data"]["items"]
    assert len(items) == 1
    assert items[0]["status"] == "completed"
    assert items[0]["valid_files"] == 1

    verify_response = client.post(f"/api/library/{manga_id}/verify")
    assert verify_response.status_code == 200
    assert verify_response.json()["data"]["status"] == "completed"

    zip_response = client.post(f"/api/library/{manga_id}/zip")
    assert zip_response.status_code == 200
    assert zip_response.json()["data"]["zip_exists"] is True


def test_library_retry_failed_files_downloads_problem_images(monkeypatch):
    manga_id = "900000004"
    asyncio.run(_seed_problem_library_item(manga_id))

    from backend.app.services import task_runner as runner_module

    async def fake_get_bytes(url: str, referer: str | None = None) -> bytes:
        assert url == "https://example.test/repair.jpg"
        assert referer == "https://example.test/repair-page.html"
        return image_bytes()

    monkeypatch.setattr(runner_module, "smart_fetch_bytes", fake_get_bytes)

    client = TestClient(app)
    retry_response = client.post(f"/api/library/{manga_id}/retry-failed")
    assert retry_response.status_code == 200
    retry_data = retry_response.json()["data"]
    assert retry_data["status"] in {"queued", "already_active"}
    assert retry_data["problem_files"] == 1

    detail_response = client.get(f"/api/library/{manga_id}")
    assert detail_response.status_code == 200
    detail = detail_response.json()["data"]
    assert detail["status"] == "completed"
    assert detail["valid_files"] == 1
    assert detail["files"][0]["status"] == "valid"


def test_library_retry_failed_files_re_resolves_missing_pic_url(monkeypatch):
    manga_id = "900000005"
    asyncio.run(_seed_missing_pic_url_library_item(manga_id))

    from backend.app.services import task_runner as runner_module

    async def fake_smart_fetch(url: str, referer: str | None = None) -> str:
        assert url == "https://example.test/missing-pic-url.html"
        return '<span id="imgarea"><img src="/images/recovered.jpg"></span>'

    async def fake_get_bytes(url: str, referer: str | None = None) -> bytes:
        assert url == "https://example.test/images/recovered.jpg"
        assert referer == "https://example.test/missing-pic-url.html"
        return image_bytes()

    monkeypatch.setattr(runner_module, "smart_fetch", fake_smart_fetch)
    monkeypatch.setattr(runner_module, "smart_fetch_bytes", fake_get_bytes)

    client = TestClient(app)
    retry_response = client.post(f"/api/library/{manga_id}/retry-failed")
    assert retry_response.status_code == 200
    assert retry_response.json()["data"]["problem_files"] == 1

    detail_response = client.get(f"/api/library/{manga_id}")
    assert detail_response.status_code == 200
    detail = detail_response.json()["data"]
    assert detail["status"] == "completed"
    assert detail["files"][0]["pic_url"] == "https://example.test/images/recovered.jpg"
    assert detail["files"][0]["status"] == "valid"


def test_logs_api_returns_persisted_failure_context():
    from backend.app.services.log_service import log_service

    asyncio.run(
        log_service.write(
            level="error",
            event="image_download_failed",
            message="响应不是有效图片",
            manga_id="900000007",
            task_id="task_log_smoke",
            stage="downloading",
            details={"pic_index": 1, "url": "https://example.test/bad.jpg"},
        )
    )

    client = TestClient(app)
    response = client.get("/api/logs?manga_id=900000007")
    assert response.status_code == 200
    items = response.json()["data"]["items"]
    assert len(items) == 1
    assert items[0]["level"] == "error"
    assert items[0]["message"] == "响应不是有效图片"
    assert items[0]["details"]["pic_index"] == 1


def test_log_backfill_existing_task_failure():
    from backend.app.services.log_service import log_service

    manga_id = "900000008"
    task_id = asyncio.run(_seed_failed_task(manga_id))

    created = asyncio.run(log_service.backfill_existing_failures())
    created_again = asyncio.run(log_service.backfill_existing_failures())

    assert created >= 1
    assert created_again == 0

    client = TestClient(app)
    response = client.get(f"/api/logs?task_id={task_id}")
    assert response.status_code == 200
    items = response.json()["data"]["items"]
    assert len(items) == 1
    assert items[0]["event"] == "legacy_task_failure"
    assert items[0]["message"] == "403 Forbidden"
    assert items[0]["details"]["source"] == "startup_backfill"


def test_logs_api_falls_back_when_message_is_empty():
    from backend.app.services.log_service import log_service

    asyncio.run(
        log_service.write(
            level="error",
            event="task_failed",
            message="",
            manga_id="900000009",
            task_id="task_empty_log_smoke",
        )
    )

    client = TestClient(app)
    response = client.get("/api/logs?task_id=task_empty_log_smoke")
    assert response.status_code == 200
    items = response.json()["data"]["items"]
    assert len(items) == 1
    assert items[0]["message"] == "任务失败，但异常没有返回文本"


def test_download_images_uses_parallel_workers(monkeypatch):
    manga_id = "900000006"
    task_id = asyncio.run(_seed_parallel_download_item(manga_id))

    from backend.app.services import task_runner as runner_module

    active = 0
    peak = 0

    async def fake_get_bytes(url: str, referer: str | None = None) -> bytes:
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0.05)
        active -= 1
        return image_bytes()

    monkeypatch.setattr(runner_module, "smart_fetch_bytes", fake_get_bytes)

    valid_count = asyncio.run(runner_module.task_runner._download_images(task_id, manga_id))

    assert valid_count == 3
    assert peak > 1


def test_task_transition_guards_invalid_controls():
    client = TestClient(app)
    manga_id = "900000003"

    create_response = client.post(
        "/api/tasks",
        json={"manga_id": manga_id, "source": "transition-test", "start_immediately": False},
    )
    assert create_response.status_code == 200
    task = create_response.json()["data"]

    pause_response = client.post(f"/api/tasks/{task['task_id']}/pause")
    assert pause_response.status_code == 409

    cancel_response = client.post(f"/api/tasks/{task['task_id']}/cancel")
    assert cancel_response.status_code == 200
    assert cancel_response.json()["data"]["status"] == "cancelled"

    resume_response = client.post(f"/api/tasks/{task['task_id']}/resume")
    assert resume_response.status_code == 409


def test_config_can_be_saved_without_generating_token():
    client = TestClient(app)
    get_response = client.get("/api/config")
    assert get_response.status_code == 200
    current = get_response.json()["data"]

    update_response = client.post(
        "/api/config",
        json={
            "download_path": current["download_path"],
            "is_zip": current["is_zip"],
            "max_thread": current["max_thread"],
            "request_delay_ms": current["request_delay_ms"],
            "timeout_seconds": current["timeout_seconds"],
            "proxy": current["proxy"],
        },
    )
    assert update_response.status_code == 200
    data = update_response.json()["data"]
    assert data["status"] == "saved"
    assert data["config_path"].endswith("config.local.json")


async def _seed_library_item(manga_id: str) -> None:
    await init_db()
    title = "Library Smoke"
    base = Path(get_settings().download_path)
    target_dir = manga_dir(base, manga_id, title)
    target_dir.mkdir(parents=True, exist_ok=True)
    image_path = target_dir / "0001_001.jpg"
    image_path.write_bytes(image_bytes())

    async with SessionLocal() as session:
        manga_repo = MangaRepository(session)
        await manga_repo.upsert_info(
            manga_id=manga_id,
            title=title,
            cover_url="",
            page_count=1,
            status="completed",
        )
        await manga_repo.update_info_status(manga_id, "completed", pic_count=1)
        await manga_repo.upsert_pic_page(
            manga_id=manga_id,
            page_index=1,
            page_url="https://example.test/page.html",
            page_name=f"id_{manga_id}_pic_1",
            pic_num="001",
            pic_url="https://example.test/001.jpg",
            status="resolved",
        )
        await FileRepository(session).upsert_file(
            manga_id=manga_id,
            pic_index=1,
            file_path=str(image_path),
            file_name=image_path.name,
            file_size=image_path.stat().st_size,
            status="valid",
        )


async def _seed_problem_library_item(manga_id: str) -> None:
    await init_db()
    title = "Library Repair Smoke"
    base = Path(get_settings().download_path)
    target_dir = manga_dir(base, manga_id, title)
    target_dir.mkdir(parents=True, exist_ok=True)
    image_path = target_dir / "0001_repair.jpg"
    if image_path.exists():
        image_path.unlink()

    async with SessionLocal() as session:
        manga_repo = MangaRepository(session)
        await manga_repo.upsert_info(
            manga_id=manga_id,
            title=title,
            cover_url="",
            page_count=1,
            status="partial",
        )
        await manga_repo.update_info_status(manga_id, "partial", pic_count=1)
        await manga_repo.upsert_pic_page(
            manga_id=manga_id,
            page_index=1,
            page_url="https://example.test/repair-page.html",
            page_name=f"id_{manga_id}_pic_1",
            pic_num="repair",
            pic_url="https://example.test/repair.jpg",
            status="resolved",
        )
        await FileRepository(session).upsert_file(
            manga_id=manga_id,
            pic_index=1,
            file_path=str(image_path),
            file_name=image_path.name,
            file_size=0,
            status="failed",
            error_message="seed failure",
        )


async def _seed_missing_pic_url_library_item(manga_id: str) -> None:
    await init_db()
    title = "Library Missing URL Smoke"
    base = Path(get_settings().download_path)
    target_dir = manga_dir(base, manga_id, title)
    target_dir.mkdir(parents=True, exist_ok=True)
    image_path = target_dir / "0001_recovered.jpg"
    if image_path.exists():
        image_path.unlink()

    async with SessionLocal() as session:
        manga_repo = MangaRepository(session)
        await manga_repo.upsert_info(
            manga_id=manga_id,
            title=title,
            cover_url="",
            page_count=1,
            status="partial",
        )
        await manga_repo.update_info_status(manga_id, "partial", pic_count=1)
        await manga_repo.upsert_pic_page(
            manga_id=manga_id,
            page_index=1,
            page_url="https://example.test/missing-pic-url.html",
            page_name=f"id_{manga_id}_pic_1",
            pic_num="recovered",
            pic_url="",
            status="failed",
            error_message="missing pic url",
        )
        await FileRepository(session).upsert_file(
            manga_id=manga_id,
            pic_index=1,
            file_path=str(image_path),
            file_name=image_path.name,
            file_size=0,
            status="failed",
            error_message="seed failure",
        )


async def _seed_parallel_download_item(manga_id: str) -> str:
    await init_db()
    title = "Parallel Download Smoke"
    target_dir = manga_dir(Path(get_settings().download_path), manga_id, title)
    if target_dir.exists():
        for image_path in target_dir.glob("*.jpg"):
            image_path.unlink()
    target_dir.mkdir(parents=True, exist_ok=True)

    async with SessionLocal() as session:
        manga_repo = MangaRepository(session)
        await manga_repo.upsert_info(
            manga_id=manga_id,
            title=title,
            cover_url="",
            page_count=1,
            status="ready",
        )
        await manga_repo.update_info_status(manga_id, "ready", pic_count=3)
        for index in range(1, 4):
            await manga_repo.upsert_pic_page(
                manga_id=manga_id,
                page_index=index,
                page_url=f"https://example.test/page-{index}.html",
                page_name=f"id_{manga_id}_pic_{index}",
                pic_num=str(index),
                pic_url=f"https://example.test/{index}.jpg",
                status="resolved",
            )
        task = await TaskRepository(session).create(
            manga_id=manga_id,
            source="parallel-test",
            status="queued",
        )
        return task.id


async def _seed_failed_task(manga_id: str) -> str:
    await init_db()
    async with SessionLocal() as session:
        await MangaRepository(session).upsert_info(
            manga_id=manga_id,
            title="Failed Backfill Smoke",
            cover_url="",
            page_count=1,
            status="failed",
        )
        task_repo = TaskRepository(session)
        task = await task_repo.create(
            manga_id=manga_id,
            source="backfill-test",
            status="queued",
        )
        failed = await task_repo.update_progress(
            task,
            status="failed",
            stage="done",
            error="403 Forbidden",
        )
        return failed.id


# ── Parser tests ──────────────────────────────────────────────────────────


def test_parse_manga_info_extracts_title():
    html = '<html><body><h2>我的漫画</h2></body></html>'
    result = manga_parser.parse_manga_info(html, "12345")
    assert result["title"] == "我的漫画"
    assert result["id"] == "12345"


def test_parse_manga_info_extracts_page_count():
    html = """
    <html><body><h2>Test</h2>
    <a href="photos-index-page-1-aid-100.html">1</a>
    <a href="photos-index-page-2-aid-100.html">2</a>
    <a href="photos-index-page-5-aid-100.html">5</a>
    </body></html>
    """
    result = manga_parser.parse_manga_info(html, "100")
    assert result["page_count"] == 5


def test_parse_manga_info_single_page():
    html = "<html><body><h2>One Page</h2></body></html>"
    result = manga_parser.parse_manga_info(html, "200")
    assert result["page_count"] == 1


def test_parse_manga_info_extracts_cover_from_uwthumb():
    html = """
    <html><body><h2>Test</h2>
    <div class="uwthumb"><img src="//t4.qy0.ru/cover/c.jpg"></div>
    </body></html>
    """
    result = manga_parser.parse_manga_info(html, "300")
    assert result["cover_url"] == "https://t4.qy0.ru/cover/c.jpg"


def test_parse_manga_info_extracts_cover_from_qy0_fallback():
    html = """
    <html><body><h2>Test</h2>
    <img src="//t4.qy0.ru/thumb.jpg">
    </body></html>
    """
    result = manga_parser.parse_manga_info(html, "301")
    assert result["cover_url"] == "https://t4.qy0.ru/thumb.jpg"


def test_parse_manga_info_empty_title():
    html = "<html><body></body></html>"
    result = manga_parser.parse_manga_info(html, "400")
    assert result["title"] == ""


def test_parse_pic_page_list_extracts_items():
    html = """
    <html><body>
    <ul>
      <li class="gallary_item"><a href="/photos-view-id-10.html">p1</a><span>001</span></li>
      <li class="gallary_item"><a href="/photos-view-id-11.html">p2</a><span>002</span></li>
    </ul>
    </body></html>
    """
    items = manga_parser.parse_pic_page_list(html, "500", "https://www.wnacg.com/")
    assert len(items) == 2
    assert items[0].pic_num == "001"
    assert items[1].page_url == "https://www.wnacg.com/photos-view-id-11.html"


def test_parse_pic_page_list_empty():
    html = "<html><body></body></html>"
    items = manga_parser.parse_pic_page_list(html, "600", "https://www.wnacg.com/")
    assert items == []


def test_parse_pic_url_from_imgarea():
    html = (
        '<span id="imgarea">'
        '<img src="//t4.qy0.ru/img/page1.jpg">'
        "</span>"
    )
    url = manga_parser.parse_pic_url(html, "https://www.wnacg.com/")
    assert url == "https://t4.qy0.ru/img/page1.jpg"


def test_parse_pic_url_relative():
    html = '<html><body><span id="imgarea"><img src="/images/p1.jpg"></span></body></html>'
    url = manga_parser.parse_pic_url(html, "https://www.wnacg.com/")
    assert url == "https://www.wnacg.com/images/p1.jpg"


def test_parse_pic_url_none_when_no_imgarea():
    html = "<html><body><div>no image here</div></body></html>"
    url = manga_parser.parse_pic_url(html)
    assert url is None


def test_parse_pic_url_regex_fallback():
    html = '<span id="imgarea"><img src="//t4.qy0.ru/fallback.jpg"></span>'
    url = manga_parser.parse_pic_url(html, "https://www.wnacg.com/")
    assert url == "https://t4.qy0.ru/fallback.jpg"


# ── Block detector tests ─────────────────────────────────────────────────


def test_is_cloudflare_challenge_just_a_moment():
    assert is_cloudflare_challenge("<html><title>Just a moment...</title></html>") is True


def test_is_cloudflare_challenge_challenges_domain():
    html = '<script src="https://challenges.cloudflare.com/c.js"></script>'
    assert is_cloudflare_challenge(html) is True


def test_is_cloudflare_challenge_normal_html():
    assert is_cloudflare_challenge("<html><body>normal page</body></html>") is False


def test_is_cloudflare_challenge_empty():
    assert is_cloudflare_challenge("") is False
    assert is_cloudflare_challenge(None) is False


def test_is_blocked_403():
    assert is_blocked(status_code=403) is True


def test_is_blocked_200_normal():
    assert is_blocked(status_code=200, html="<html>ok</html>") is False


def test_is_blocked_empty_html_not_blocked():
    """Empty HTML alone should not be treated as blocked (could be network error)."""
    assert is_blocked(html="") is False


def test_is_blocked_forbidden_marker():
    assert is_blocked(html="<html>403 Forbidden</html>") is True


def test_is_blocked_none_status_no_html():
    assert is_blocked(status_code=None, html=None) is False


# ── Downloader helper tests ──────────────────────────────────────────────


def test_image_extension_jpg():
    assert image_extension("https://example.com/image.jpg?v=1") == ".jpg"


def test_image_extension_png():
    assert image_extension("https://example.com/image.png") == ".png"


def test_image_extension_webp():
    assert image_extension("https://example.com/image.webp#anchor") == ".webp"


def test_image_extension_unknown_defaults_to_jpg():
    assert image_extension("https://example.com/image") == ".jpg"


def test_is_valid_image_jpg():
    assert is_valid_image(image_bytes()) is True


def test_is_valid_image_png():
    assert is_valid_image(image_bytes("PNG")) is True


def test_is_valid_image_incomplete_jpeg():
    data = b"\xff\xd8\xff" + b"\x00" * 100
    assert is_valid_image(data) is False


def test_is_valid_image_wrong_signature():
    data = b"not an image" + b"\x00" * (10 * 1024)
    assert is_valid_image(data) is False


# ── Paths helper tests ───────────────────────────────────────────────────


def test_safe_filename():
    from backend.app.core.paths import safe_filename
    assert safe_filename("hello/world") == "hello_world"
    assert safe_filename("") == "untitled"
    assert safe_filename("  spaces  ") == "spaces"


def test_manga_dir():
    from backend.app.core.paths import manga_dir
    result = manga_dir(Path("/data"), "123", "My Manga")
    assert str(result) == "/data/Manga/[123] My Manga"


def test_zip_path():
    from backend.app.core.paths import zip_path
    result = zip_path(Path("/data"), "123", "My Manga")
    assert str(result) == "/data/Zip/[123] My Manga.zip"
