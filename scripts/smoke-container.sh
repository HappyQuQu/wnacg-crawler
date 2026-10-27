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
docker run --rm -i --network none --shm-size=2g "$IMAGE" python - <<'PY'
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(args=["--no-sandbox"])
        page = await browser.new_page()
        await page.set_content("<title>WNACG smoke</title>")
        assert await page.title() == "WNACG smoke"
        await browser.close()

asyncio.run(main())
PY

docker volume create "$VOLUME" >/dev/null
docker run -d --name "$CONTAINER" --network none --shm-size=2g \
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
