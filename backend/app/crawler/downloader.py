import asyncio
import json
from pathlib import Path
from time import monotonic
from typing import Any

from curl_cffi.requests import AsyncSession
from curl_cffi.requests.exceptions import HTTPError as CurlHTTPError
from loguru import logger
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from backend.app.core.config import get_settings
from backend.app.crawler.block_detector import is_blocked, is_cloudflare_challenge

DEFAULT_HEADERS = {
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;"
        "q=0.9,image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}


class BlockedByCloudflareError(Exception):
    """Raised when Cloudflare challenge is detected — stop HTTP retry, switch to browser."""
    pass


class Downloader:
    def __init__(self) -> None:
        self._client: AsyncSession | None = None
        self._delay_lock = asyncio.Lock()
        self._last_request_at = 0.0

    async def client(self) -> AsyncSession:
        if self._client is None:
            settings = get_settings()
            proxy = None
            if settings.proxy.is_proxy:
                proxy = f"http://{settings.proxy.address}:{settings.proxy.port}"
            cookies = self._load_browser_cookies()
            self._client = AsyncSession(
                proxy=proxy,
                timeout=settings.timeout_seconds,
                allow_redirects=True,
                impersonate="chrome124",
                cookies=cookies,
            )
        return self._client

    @staticmethod
    def _load_browser_cookies() -> dict[str, str] | None:
        state_path = Path(get_settings().download_path) / ".browser_state.json"
        if not state_path.exists():
            return None
        try:
            data = json.loads(state_path.read_text(encoding="utf-8"))
            cookies = {}
            for c in data.get("cookies", []):
                cookies[c["name"]] = c["value"]
            if cookies:
                logger.debug("Loaded {} browser cookies", len(cookies))
            return cookies or None
        except Exception as exc:
            logger.debug("Failed to load browser cookies: {}", exc)
            return None

    async def _wait_for_delay(self) -> None:
        delay = get_settings().request_delay_ms / 1000
        if delay <= 0:
            return
        async with self._delay_lock:
            elapsed = monotonic() - self._last_request_at
            remaining = delay - elapsed
            if remaining > 0:
                await asyncio.sleep(remaining)
            self._last_request_at = monotonic()

    async def _get(self, url: str, **kwargs: Any) -> str:
        settings = get_settings()
        max_attempts = max(settings.crawler_max_retry, 1)
        extra_headers = kwargs.pop("headers", {})

        @retry(
            retry=retry_if_exception_type((CurlHTTPError, RuntimeError)),
            stop=stop_after_attempt(max_attempts),
            wait=wait_exponential(multiplier=1, max=10),
            reraise=True,
        )
        async def _do_get() -> str:
            await self._wait_for_delay()
            client = await self.client()
            merged_headers = {**DEFAULT_HEADERS, **extra_headers}
            response = await client.get(url, headers=merged_headers, **kwargs)
            html = response.text or ""

            if is_cloudflare_challenge(html):
                logger.warning(
                    "CF challenge detected, skip HTTP retry: "
                    "url={} status={} body_preview={}",
                    url,
                    response.status_code,
                    html[:500],
                )
                raise BlockedByCloudflareError(url)

            if is_blocked(status_code=response.status_code, html=html):
                logger.warning(
                    "HTTP blocked: url={} status={} body_preview={}",
                    url,
                    response.status_code,
                    html[:500],
                )
                raise RuntimeError(f"HTTP blocked: {response.status_code} {url}")

            response.raise_for_status()
            return html

        return await _do_get()

    async def get_text(self, url: str, referer: str | None = None) -> str:
        headers: dict[str, str] = {}
        if referer:
            headers["Referer"] = referer
        return await self._get(url, headers=headers)

    async def get_bytes(self, url: str, referer: str | None = None) -> bytes:
        settings = get_settings()
        max_attempts = max(settings.crawler_max_retry, 1)

        headers: dict[str, str] = {
            **DEFAULT_HEADERS,
            "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        }
        if referer:
            headers["Referer"] = referer

        @retry(
            retry=retry_if_exception_type((CurlHTTPError, RuntimeError)),
            stop=stop_after_attempt(max_attempts),
            wait=wait_exponential(multiplier=1, max=10),
            reraise=True,
        )
        async def _do_get_bytes() -> bytes:
            await self._wait_for_delay()
            client = await self.client()
            response = await client.get(url, headers=headers)
            response.raise_for_status()

            content_type = response.headers.get("content-type", "")
            if "text/html" in content_type:
                body_text = response.text or ""
                if is_cloudflare_challenge(body_text):
                    logger.warning(
                        "Cloudflare challenge on image: url={} body_preview={}",
                        url,
                        body_text[:500],
                    )
                    raise BlockedByCloudflareError(url)
                if is_blocked(html=body_text):
                    logger.warning("Image blocked (HTML response): url={}", url)
                    raise RuntimeError(f"Image blocked: {url}")

            return response.content

        return await _do_get_bytes()

    async def close(self) -> None:
        if self._client is not None:
            await self._client.close()
            self._client = None


downloader = Downloader()


def image_extension(url: str) -> str:
    clean = url.split("?", 1)[0].split("#", 1)[0].lower()
    for ext in (".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"):
        if clean.endswith(ext):
            return ext
    return ".jpg"


def is_valid_image(data: bytes) -> bool:
    if len(data) <= 15 * 1024:
        return False
    signatures = (
        b"\xff\xd8\xff",
        b"\x89PNG\r\n\x1a\n",
        b"GIF87a",
        b"GIF89a",
        b"RIFF",
        b"BM",
    )
    return any(data.startswith(signature) for signature in signatures)
