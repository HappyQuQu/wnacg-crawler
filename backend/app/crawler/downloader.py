import asyncio
from time import monotonic
from typing import Any

import httpx
from loguru import logger
from tenacity import retry, stop_after_attempt, wait_exponential

from backend.app.core.config import get_settings
from backend.app.crawler.block_detector import is_blocked, is_cloudflare_challenge

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;"
        "q=0.9,image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}


class BlockedByCloudflareError(Exception):
    """Raised when Cloudflare challenge is detected — stop HTTP retry, switch to browser."""
    pass


class Downloader:
    def __init__(self) -> None:
        self._client: httpx.AsyncClient | None = None
        self._delay_lock = asyncio.Lock()
        self._last_request_at = 0.0

    async def client(self) -> httpx.AsyncClient:
        if self._client is None:
            settings = get_settings()
            proxy = None
            if settings.proxy.is_proxy:
                proxy = f"http://{settings.proxy.address}:{settings.proxy.port}"
            self._client = httpx.AsyncClient(
                proxy=proxy,
                timeout=settings.timeout_seconds,
                follow_redirects=True,
                headers={"User-Agent": settings.user_agent},
            )
        return self._client

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
        await self._wait_for_delay()
        client = await self.client()
        merged_headers = {**DEFAULT_HEADERS, **kwargs.pop("headers", {})}
        response = await client.get(url, headers=merged_headers, **kwargs)
        html = response.text or ""

        if is_cloudflare_challenge(html):
            logger.warning(
                "Cloudflare challenge detected, skip HTTP retry: url={} status={} body_preview={}",
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

    async def get_text(self, url: str, referer: str | None = None) -> str:
        headers: dict[str, str] = {}
        if referer:
            headers["Referer"] = referer
        return await self._get(url, headers=headers)

    async def get_bytes(self, url: str, referer: str | None = None) -> bytes:
        await self._wait_for_delay()
        client = await self.client()
        headers: dict[str, str] = {
            **DEFAULT_HEADERS,
            "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        }
        if referer:
            headers["Referer"] = referer
        response = await client.get(url, headers=headers)
        response.raise_for_status()
        return response.content

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
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
