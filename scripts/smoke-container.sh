#!/usr/bin/env bash
set -euo pipefail

IMAGE="${1:?Usage: bash scripts/smoke-container.sh IMAGE}"
CONTAINER="wnacg-smoke-$$"
VOLUME="wnacg-smoke-data-$$"

cleanup() {
  docker logs "$CONTAINER" || true
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker volume rm "$VOLUME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Exercise the bundled browser using only an in-memory page.
docker run --rm -i --network none "$IMAGE" python - <<'PY'
import asyncio
import zipfile
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

from backend.app.crawler.block_detector import is_blocked
from backend.app.crawler.parser import manga_parser
from backend.app.services.archive_service import create_zip, is_complete_zip

assert not is_blocked(200, '<h2>Gallery</h2><script src="/slider-captcha.js"></script>')
assert is_blocked(200, '<h1>403 Forbidden</h1>')
series = (
    '<h2>Series</h2><div id="sr_pub" data-total="99" data-per="12"></div>'
    '<div class="sr_compact"><a data-chid="101" title="第1話 2P">第1話</a></div>'
)
assert manga_parser.parse_manga_info(series, "999")["page_count"] == 9
assert manga_parser.parse_series_chapters(series)[0].pic_count == 2
reader = 'mReader.initData({"page_url":["https://cdn.test/1.png",],"unused":undefined});'
assert manga_parser.parse_reader_images(reader, "https://site.test/") == [
    "https://cdn.test/1.png"
]
with TemporaryDirectory() as root:
    source = Path(root) / "images"
    source.mkdir()
    page = source / "page.png"
    Image.new("RGB", (8, 8), "blue").save(page)
    for name in ("a" * 251 + ".zip", "[382868] " + "漫" * 78 + ".zip"):
        target = Path(root) / name
        create_zip(source, target, [page])
        assert is_complete_zip(target, [page])
        with zipfile.ZipFile(target) as archive:
            assert archive.namelist() == ["page.png"]
    assert not list(Path(root).glob(".*.tmp"))

async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(args=["--no-sandbox"])
        page = await browser.new_page()
        await Stealth().apply_stealth_async(page)
        await page.set_content("<title>WNACG smoke</title>")
        assert await page.title() == "WNACG smoke"
        await browser.close()

asyncio.run(main())
PY

docker volume create "$VOLUME" >/dev/null
docker run -d --name "$CONTAINER" --network none \
  -v "$VOLUME:/app/config" "$IMAGE" >/dev/null

for attempt in {1..30}; do
  if docker exec "$CONTAINER" python -c \
    "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/api/health', timeout=2)" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

docker exec -i "$CONTAINER" python - <<'PY'
import json
import urllib.request
from pathlib import Path

with urllib.request.urlopen("http://127.0.0.1:8080/api/health") as response:
    assert json.load(response)["data"]["status"] == "ok"
with urllib.request.urlopen("http://127.0.0.1:8080/") as response:
    assert '<div id="root">' in response.read().decode()
assert Path("/app/config/data.sqlite").is_file()
PY

docker restart "$CONTAINER" >/dev/null
docker exec "$CONTAINER" python -c \
  'import sqlite3; db = sqlite3.connect("/app/config/data.sqlite"); assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"'
