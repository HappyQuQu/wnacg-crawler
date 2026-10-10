from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
import pytest_asyncio

from backend.app.core.config import get_settings
from backend.app.core.errors import ImageHTTPError
from backend.app.core.paths import manga_dir, zip_path
from backend.app.crawler import smart_fetcher
from backend.app.crawler.browser_fetcher import BrowserManager
from backend.app.crawler.downloader import BlockedByCloudflareError, Downloader
from backend.app.crawler.images import (
    is_valid_image,
    is_valid_image_file,
    validated_image_extension,
)
from backend.app.crawler.parser import manga_parser
from backend.app.db.database import SessionLocal
from backend.app.db.repository import FileRepository, MangaRepository, TaskRepository
from backend.app.services import task_runner as runner_module
from backend.app.services.library_service import library_service
from backend.app.services.log_service import log_service
from backend.tests.image_fixtures import image_bytes


@pytest.fixture
def fast_settings(monkeypatch):
    settings = get_settings()
    for name in (
        "request_delay_ms",
        "crawler_min_delay",
        "crawler_max_delay",
        "crawler_403_backoff",
    ):
        monkeypatch.setattr(settings, name, 0)
    return settings


@pytest_asyncio.fixture
async def download_case():
    manga_id = uuid4().hex
    title = "Recovery Test"
    page_url = "https://example.test/gallery/page.html"
    old_url = "https://cdn.example.test/image.jpg?token=expired"
    async with SessionLocal() as session:
        repo = MangaRepository(session)
        await repo.upsert_info(manga_id, title, "", 1, "ready")
        await repo.update_info_status(manga_id, "ready", pic_count=1)
        page = await repo.upsert_pic_page(
            manga_id, 1, page_url, f"id_{manga_id}_pic_1", "001", old_url
        )
        task = await TaskRepository(session).create(manga_id, "recovery-test", "queued")
    directory = manga_dir(Path(get_settings().download_path), manga_id, title)
    directory.mkdir(parents=True, exist_ok=True)
    return SimpleNamespace(
        manga_id=manga_id,
        task_id=task.id,
        page=page,
        directory=directory,
        expected=directory / "0001_001.jpg",
        old_url=old_url,
    )


async def file_rows(case):
    async with SessionLocal() as session:
        return await FileRepository(session).list_for_manga(case.manga_id)


@pytest.mark.asyncio
@pytest.mark.parametrize("success", [True, False])
async def test_image_logs_report_actual_outcome(monkeypatch, download_case, success):
    case = download_case
    fetch = AsyncMock(return_value=image_bytes()) if success else AsyncMock(
        side_effect=RuntimeError("image fetch failed")
    )
    monkeypatch.setattr(runner_module, "smart_fetch_bytes", fetch)
    runner = runner_module.TaskRunner()
    assert await runner._download_images(case.task_id, case.manga_id) == int(success)
    history = await log_service.list(task_id=case.task_id)
    events = [item["event"] for item in reversed(history["items"])]
    assert events == [
        "image_download_started",
        "image_download_completed" if success else "image_download_failed",
    ]
    assert (await file_rows(case))[0].status == ("valid" if success else "failed")
    if success:
        assert await runner._download_images(case.task_id, case.manga_id) == 1
        history = await log_service.list(task_id=case.task_id)
        assert history["items"][0]["event"] == "image_file_reused"
        assert fetch.await_count == 1


@pytest.mark.parametrize("format", ["JPEG", "PNG", "GIF", "WEBP", "BMP", "AVIF"])
def test_small_decodable_images_are_valid(tmp_path, format):
    data = image_bytes(format)
    path = tmp_path / "image"
    path.write_bytes(data)
    assert len(data) < 5 * 1024
    assert is_valid_image(data)
    assert is_valid_image_file(path)
    assert (
        validated_image_extension(data)
        == {
            "JPEG": ".jpg",
            "PNG": ".png",
            "GIF": ".gif",
            "WEBP": ".webp",
            "BMP": ".bmp",
            "AVIF": ".avif",
        }[format]
    )


@pytest.mark.parametrize(
    "data",
    [
        b"",
        b"RIFF\x00\x00\x00\x00WAVE" + b"0" * 6000,
        b"\xff\xd8\xff" + b"0" * 6000,
        b"\x89PNG\r\n\x1a\n" + b"0" * 6000,
        image_bytes()[:-30],
        image_bytes("PNG")[:-20],
    ],
)
def test_corrupt_images_are_rejected(tmp_path, data):
    path = tmp_path / "image"
    path.write_bytes(data)
    assert not is_valid_image(data)
    assert not is_valid_image_file(path)


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", ["auto", "http"])
@pytest.mark.parametrize("kind", ["text", "bytes"])
async def test_disabled_browser_or_http_mode_never_falls_back(
    monkeypatch, fast_settings, mode, kind,
):
    monkeypatch.setattr(fast_settings, "fetch_mode", mode)
    monkeypatch.setattr(fast_settings, "enable_browser", mode == "http")
    http = AsyncMock(side_effect=BlockedByCloudflareError("test blocked response"))
    browser = AsyncMock()
    monkeypatch.setattr(smart_fetcher.downloader, f"get_{kind}", http)
    monkeypatch.setattr(smart_fetcher.browser_manager, "fetch" if kind == "text" else "fetch_bytes",
                        browser)
    fetch = smart_fetcher.smart_fetch if kind == "text" else smart_fetcher.smart_fetch_bytes
    with pytest.raises(BlockedByCloudflareError):
        await fetch("https://example.test/resource")
    http.assert_awaited_once()
    browser.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["text", "bytes"])
async def test_browser_mode_rejects_disabled_browser(monkeypatch, fast_settings, kind):
    monkeypatch.setattr(fast_settings, "fetch_mode", "browser")
    monkeypatch.setattr(fast_settings, "enable_browser", False)
    browser = AsyncMock()
    monkeypatch.setattr(smart_fetcher.browser_manager, "fetch" if kind == "text" else "fetch_bytes",
                        browser)
    fetch = smart_fetcher.smart_fetch if kind == "text" else smart_fetcher.smart_fetch_bytes
    with pytest.raises(RuntimeError, match="浏览器抓取已关闭"):
        await fetch("https://example.test/resource")
    browser.assert_not_awaited()


@pytest.mark.asyncio
async def test_image_403_skips_http_retries(monkeypatch, fast_settings):
    fast_settings.crawler_max_retry = 3
    client = SimpleNamespace(get=AsyncMock(return_value=SimpleNamespace(status_code=403)))
    instance = Downloader()
    monkeypatch.setattr(instance, "client", AsyncMock(return_value=client))
    with pytest.raises(ImageHTTPError) as caught:
        await instance.get_bytes("https://cdn.example.test/expired.jpg")
    assert caught.value.status_code == 403
    assert caught.value.url.endswith("expired.jpg")
    assert client.get.await_count == 1


@pytest.mark.asyncio
async def test_image_403_does_not_fallback_to_same_url(monkeypatch, fast_settings):
    fetch = AsyncMock(side_effect=ImageHTTPError(403, "https://example.test/image"))
    browser = AsyncMock()
    monkeypatch.setattr(smart_fetcher.downloader, "get_bytes", fetch)
    monkeypatch.setattr(smart_fetcher.browser_manager, "fetch_bytes", browser)
    with pytest.raises(ImageHTTPError):
        await smart_fetcher.smart_fetch_bytes("https://example.test/image")
    assert fetch.await_count == 1
    browser.assert_not_awaited()


@pytest.mark.asyncio
async def test_detail_cloudflare_still_falls_back_to_browser(monkeypatch, fast_settings):
    monkeypatch.setattr(
        smart_fetcher.downloader, "get_text", AsyncMock(side_effect=BlockedByCloudflareError())
    )
    browser = AsyncMock(return_value="<h2>Recovered</h2>")
    monkeypatch.setattr(smart_fetcher.browser_manager, "fetch", browser)
    assert await smart_fetcher.smart_fetch("https://example.test/page") == "<h2>Recovered</h2>"
    browser.assert_awaited_once()


@pytest.mark.asyncio
async def test_browser_preserves_image_403(monkeypatch, fast_settings):
    page = SimpleNamespace(
        request=SimpleNamespace(get=AsyncMock(return_value=SimpleNamespace(status=403))),
        close=AsyncMock(),
    )
    context = SimpleNamespace(new_page=AsyncMock(return_value=page), close=AsyncMock())
    browser = SimpleNamespace(new_context=AsyncMock(return_value=context))
    instance = BrowserManager()
    monkeypatch.setattr(instance, "_ensure_started", AsyncMock(return_value=browser))
    monkeypatch.setattr(fast_settings, "enable_stealth", False)
    with pytest.raises(ImageHTTPError) as caught:
        await instance.fetch_bytes("https://example.test/image")
    assert caught.value.status_code == 403
    page.close.assert_awaited_once()
    context.close.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("repair", [False, True])
async def test_403_refreshes_url_persists_it_and_saves_real_format(
    monkeypatch, download_case, repair
):
    case = download_case
    refreshed = "https://example.test/gallery/images/recovered?token=new&n=1"
    data = image_bytes("PNG")
    calls = []

    async def fetch(url, referer=None):
        calls.append(url)
        assert referer == case.page.page_url
        if url == case.old_url:
            raise ImageHTTPError(403, url)
        assert url == refreshed
        return data

    detail = AsyncMock(
        return_value=('<span id="imgarea"><img src="images/recovered?token=new&amp;n=1"></span>')
    )
    monkeypatch.setattr(runner_module, "smart_fetch_bytes", fetch)
    monkeypatch.setattr(runner_module, "smart_fetch", detail)
    runner = runner_module.TaskRunner()
    if repair:
        result = await runner._download_problem_images(case.task_id, case.manga_id)
        assert result["fixed"] == 1
        assert result["re_resolved"] == 1
    else:
        assert await runner._download_images(case.task_id, case.manga_id) == 1
    assert calls == [case.old_url, refreshed]
    detail.assert_awaited_once()
    rows = await file_rows(case)
    target = case.expected.with_suffix(".png")
    assert rows[0].file_path == str(target)
    assert rows[0].file_size == len(data)
    assert rows[0].status == "valid"
    assert target.read_bytes() == data
    assert not case.expected.exists()
    assert not list(case.directory.glob(".*.tmp"))
    async with SessionLocal() as session:
        pages = await MangaRepository(session).list_pic_pages(case.manga_id)
        assert pages[0].pic_url == refreshed


@pytest.mark.asyncio
@pytest.mark.parametrize("outcome", ["unchanged", "forbidden", "missing", "refresh_error"])
async def test_refresh_is_bounded_and_failure_is_recorded(monkeypatch, download_case, outcome):
    case = download_case
    new_url = "https://example.test/new.jpg"
    fetch = AsyncMock(side_effect=ImageHTTPError(403, case.old_url))
    html = {
        "unchanged": f'<span id="imgarea"><img src="{case.old_url}"></span>',
        "forbidden": f'<span id="imgarea"><img src="{new_url}"></span>',
        "missing": "<html></html>",
        "refresh_error": "",
    }[outcome]
    detail = AsyncMock(return_value=html)
    if outcome == "refresh_error":
        detail.side_effect = RuntimeError("detail unavailable")
    monkeypatch.setattr(runner_module, "smart_fetch_bytes", fetch)
    monkeypatch.setattr(runner_module, "smart_fetch", detail)
    assert await runner_module.TaskRunner()._download_images(case.task_id, case.manga_id) == 0
    assert fetch.await_count == (2 if outcome == "forbidden" else 1)
    assert detail.await_count == 1
    rows = await file_rows(case)
    assert rows[0].status == "failed"
    assert rows[0].error_message
    assert not list(case.directory.iterdir())


@pytest.mark.asyncio
async def test_initial_download_recovers_missing_url(monkeypatch, download_case):
    case = download_case
    async with SessionLocal() as session:
        page = case.page
        await MangaRepository(session).upsert_pic_page(
            case.manga_id, 1, page.page_url, page.page_name, page.pic_num, "", "failed"
        )
    monkeypatch.setattr(
        runner_module,
        "smart_fetch",
        AsyncMock(return_value=('<span id="imgarea"><img src="../recovered.jpg"></span>')),
    )
    fetch = AsyncMock(return_value=image_bytes())
    monkeypatch.setattr(runner_module, "smart_fetch_bytes", fetch)
    assert await runner_module.TaskRunner()._download_images(case.task_id, case.manga_id) == 1
    fetch.assert_awaited_once_with("https://example.test/recovered.jpg", referer=case.page.page_url)


@pytest.mark.asyncio
@pytest.mark.parametrize("recorded", [False, True])
async def test_reuses_existing_other_extension_without_requests(
    monkeypatch, download_case, recorded
):
    case = download_case
    existing = case.directory / ("legacy-name.png" if recorded else "0001_001.png")
    data = image_bytes("PNG")
    existing.write_bytes(data)
    if recorded:
        async with SessionLocal() as session:
            await FileRepository(session).upsert_file(
                case.manga_id, 1, str(existing), existing.name, len(data), "valid"
            )
    fetch = AsyncMock(side_effect=AssertionError("must reuse existing file"))
    detail = AsyncMock(side_effect=AssertionError("must not refresh"))
    monkeypatch.setattr(runner_module, "smart_fetch_bytes", fetch)
    monkeypatch.setattr(runner_module, "smart_fetch", detail)
    assert await runner_module.TaskRunner()._download_images(case.task_id, case.manga_id) == 1
    rows = await file_rows(case)
    assert rows[0].file_path == str(existing)
    assert existing.read_bytes() == data
    fetch.assert_not_awaited()
    detail.assert_not_awaited()


@pytest.mark.asyncio
async def test_library_verify_finds_existing_other_extension(download_case):
    case = download_case
    target = case.expected.with_suffix(".png")
    target.write_bytes(image_bytes("PNG"))
    result = await library_service.verify(case.manga_id)
    assert result["valid_files"] == 1
    assert result["files"][0]["file_path"] == str(target)
    assert (await file_rows(case))[0].file_name == target.name


@pytest.mark.asyncio
async def test_first_resolution_uses_detail_page_as_base(monkeypatch, download_case):
    case = download_case
    async with SessionLocal() as session:
        await MangaRepository(session).upsert_page(
            case.manga_id,
            1,
            "https://example.test/index.html",
            '<li class="gallary_item"><a href="https://example.test/gallery/page.html">'
            "page</a><span>001</span></li>",
        )
    monkeypatch.setattr(
        runner_module,
        "smart_fetch",
        AsyncMock(return_value=('<span id="imgarea"><img src="images/a.jpg?x=1&amp;y=2"></span>')),
    )
    assert await runner_module.TaskRunner()._resolve_images(case.task_id, case.manga_id) == 1
    async with SessionLocal() as session:
        pages = await MangaRepository(session).list_pic_pages(case.manga_id)
    assert pages[0].pic_url == "https://example.test/gallery/images/a.jpg?x=1&y=2"
    history = await log_service.list(task_id=case.task_id)
    assert [item["event"] for item in reversed(history["items"])] == [
        "image_resolve_started", "image_url_resolved", "image_urls_resolved",
    ]


def test_regex_fallback_decodes_entities(monkeypatch):
    monkeypatch.setattr(
        "backend.app.crawler.parser.BeautifulSoup",
        lambda *args: SimpleNamespace(find=lambda *args, **kwargs: None),
    )
    assert (
        manga_parser.parse_pic_url(
            '<span id="imgarea"><img src="img/a.jpg?x=1&amp;y=2"></span>',
            "https://example.test/gallery/page.html",
        )
        == "https://example.test/gallery/img/a.jpg?x=1&y=2"
    )


@pytest.mark.parametrize("src", ["javascript:alert(1)", "file:///tmp/image.png", "https://"])
def test_image_url_rejects_non_http_or_incomplete_urls(src):
    assert (
        manga_parser.parse_pic_url(
            f'<span id="imgarea"><img src="{src}"></span>',
            "https://example.test/page.html",
        )
        is None
    )


@pytest.mark.asyncio
async def test_query_string_does_not_force_refresh(monkeypatch, download_case):
    case = download_case
    fetch = AsyncMock(return_value=image_bytes())
    detail = AsyncMock(side_effect=AssertionError("query does not imply expiry"))
    monkeypatch.setattr(runner_module, "smart_fetch_bytes", fetch)
    monkeypatch.setattr(runner_module, "smart_fetch", detail)
    assert await runner_module.TaskRunner()._download_images(case.task_id, case.manga_id) == 1
    fetch.assert_awaited_once_with(case.old_url, referer=case.page.page_url)
    detail.assert_not_awaited()


@pytest.mark.asyncio
async def test_corrupt_response_preserves_file_and_marks_task_partial(monkeypatch, download_case):
    case = download_case
    original = b"previous invalid file"
    case.expected.write_bytes(original)
    monkeypatch.setattr(
        runner_module, "smart_fetch_bytes", AsyncMock(return_value=b"\xff\xd8\xff" + b"0" * 6000)
    )
    detail = AsyncMock()
    monkeypatch.setattr(runner_module, "smart_fetch", detail)
    runner = runner_module.TaskRunner()
    valid = await runner._download_images(case.task_id, case.manga_id)
    assert valid == 0
    await runner._verify_and_finish(case.task_id, case.manga_id, 1, valid)
    async with SessionLocal() as session:
        info = await MangaRepository(session).get_info(case.manga_id)
        task = await TaskRepository(session).get(case.task_id)
    assert info.status == "partial"
    assert task.status == "partial"
    assert (await file_rows(case))[0].status == "failed"
    assert case.expected.read_bytes() == original
    assert list(case.directory.iterdir()) == [case.expected]
    detail.assert_not_awaited()


@pytest.mark.asyncio
async def test_pause_during_image_fetch_does_not_write_or_refresh(monkeypatch, download_case):
    case = download_case

    async def fetch(*args, **kwargs):
        async with SessionLocal() as session:
            repo = TaskRepository(session)
            task = await repo.get(case.task_id)
            await repo.update_progress(task, "paused", "downloading")
        return image_bytes()

    detail = AsyncMock()
    monkeypatch.setattr(runner_module, "smart_fetch_bytes", fetch)
    monkeypatch.setattr(runner_module, "smart_fetch", detail)
    with pytest.raises(runner_module.TaskControlSignal):
        await runner_module.TaskRunner()._download_images(case.task_id, case.manga_id)
    detail.assert_not_awaited()
    assert not list(case.directory.iterdir())


@pytest.mark.asyncio
async def test_zip_failure_cannot_mark_task_completed(monkeypatch, download_case):
    case = download_case
    monkeypatch.setattr(runner_module, "smart_fetch_bytes", AsyncMock(return_value=image_bytes()))
    runner = runner_module.TaskRunner()
    assert await runner._download_images(case.task_id, case.manga_id) == 1
    target = zip_path(Path(get_settings().download_path), case.manga_id, "Recovery Test")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(b"existing archive")
    monkeypatch.setattr(
        runner_module, "create_zip", lambda *args: (_ for _ in ()).throw(OSError("disk full"))
    )
    with pytest.raises(OSError, match="disk full"):
        await runner._finish_problem_image_retry(
            case.task_id, case.manga_id, {"fixed": 1, "failed": 0, "processed": 1}
        )
    async with SessionLocal() as session:
        info = await MangaRepository(session).get_info(case.manga_id)
        task = await TaskRepository(session).get(case.task_id)
    assert info.status != "completed"
    assert task.status != "completed"
    assert target.read_bytes() == b"existing archive"


@pytest.mark.asyncio
async def test_complete_mocked_task_refreshes_image_and_builds_zip(monkeypatch, download_case):
    import zipfile

    case = download_case
    settings = get_settings()
    monkeypatch.setattr(settings, "is_zip", True)
    index_url = settings.manga_page_url.format(page=1, aid=case.manga_id)
    new_url = "https://example.test/gallery/recovered"
    details = 0

    async def fetch_html(url, referer=None):
        nonlocal details
        if url == index_url:
            return (
                '<h2>Recovery Test</h2><li class="gallary_item">'
                f'<a href="{case.page.page_url}">page</a><span>001</span></li>'
            )
        assert url == case.page.page_url
        details += 1
        src = case.old_url if details == 1 else "recovered"
        return f'<span id="imgarea"><img src="{src}"></span>'

    data = image_bytes("PNG")
    calls = []

    async def fetch_bytes(url, referer=None):
        calls.append(url)
        if url == case.old_url:
            raise ImageHTTPError(403, url)
        assert url == new_url
        return data

    monkeypatch.setattr(runner_module, "smart_fetch", fetch_html)
    monkeypatch.setattr(runner_module, "smart_fetch_bytes", fetch_bytes)
    runner = runner_module.TaskRunner()
    await runner.run(case.task_id)
    async with SessionLocal() as session:
        info = await MangaRepository(session).get_info(case.manga_id)
        task = await TaskRepository(session).get(case.task_id)
        assert info.status == "completed"
        assert task.status == "completed"
        assert task.progress_current == task.progress_total == 1
        rerun = await TaskRepository(session).create(case.manga_id, "recovery-rerun", "queued")
    assert calls == [case.old_url, new_url]
    target = zip_path(Path(settings.download_path), case.manga_id, "Recovery Test")
    with zipfile.ZipFile(target) as archive:
        assert archive.namelist() == ["0001_001.png"]
        assert archive.read("0001_001.png") == data
        assert archive.testzip() is None
    await runner.run(rerun.id)
    assert calls == [case.old_url, new_url]
    async with SessionLocal() as session:
        task = await TaskRepository(session).get(rerun.id)
        assert task.status == "completed"
    assert not list(case.directory.glob(".*.tmp"))
    assert not list(target.parent.glob(".*.tmp"))
