import os
import shutil
import tempfile
from pathlib import Path

import pytest

TEST_ROOT = Path(tempfile.gettempdir()) / "wnacg-crawler-tests"
if TEST_ROOT.exists():
    shutil.rmtree(TEST_ROOT)
TEST_ROOT.mkdir(parents=True, exist_ok=True)

os.environ["WNACG_CONFIG_PATH"] = str(TEST_ROOT / "config.local.json")
os.environ["WNACG_DB_PATH"] = str(TEST_ROOT / "data.sqlite")
os.environ["WNACG_DOWNLOAD_PATH"] = str(TEST_ROOT / "data")

from backend.app.db.database import init_db  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def init_test_database() -> None:
    import asyncio

    asyncio.run(init_db())


@pytest.fixture(autouse=True)
def prevent_real_downloads(monkeypatch):
    from backend.app.crawler.browser_fetcher import BrowserManager
    from backend.app.crawler.downloader import Downloader

    async def forbidden(*args, **kwargs):
        raise AssertionError("Tests must mock remote requests and browser launches")

    monkeypatch.setattr(Downloader, "client", forbidden)
    monkeypatch.setattr(BrowserManager, "_ensure_started", forbidden)


# ── Parser test fixtures ─────────────────────────────────────────────────

SAMPLE_MANGA_INFO_HTML = """
<html>
<body>
<h2>测试漫画标题</h2>
<div class="uwthumb">
  <img src="//t4.qy0.ru/cover/test_cover.jpg">
</div>
<a href="photos-index-page-1-aid-12345.html">1</a>
<a href="photos-index-page-2-aid-12345.html">2</a>
<a href="photos-index-page-3-aid-12345.html">3</a>
</body>
</html>
"""

SAMPLE_PIC_PAGE_LIST_HTML = """
<html>
<body>
<ul>
  <li class="gallary_item">
    <a href="/photos-view-id-1001.html">pic1</a>
    <span>001</span>
  </li>
  <li class="gallary_item">
    <a href="/photos-view-id-1002.html">pic2</a>
    <span>002</span>
  </li>
</ul>
</body>
</html>
"""

SAMPLE_PIC_URL_HTML = """
<html>
<body>
<span id="imgarea">
  <img src="//t4.qy0.ru/images/page001.jpg">
</span>
</body>
</html>
"""

SAMPLE_PIC_URL_REGEX_HTML = """
<html>
<body>
<span id="imgarea"><img src="//t4.qy0.ru/images/page001.jpg"></span>
</body>
</html>
"""


@pytest.fixture
def manga_info_html():
    return SAMPLE_MANGA_INFO_HTML


@pytest.fixture
def pic_page_list_html():
    return SAMPLE_PIC_PAGE_LIST_HTML


@pytest.fixture
def pic_url_html():
    return SAMPLE_PIC_URL_HTML


@pytest.fixture
def pic_url_regex_html():
    return SAMPLE_PIC_URL_REGEX_HTML
