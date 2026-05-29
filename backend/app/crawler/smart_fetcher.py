from __future__ import annotations

import asyncio
import json
import random
from datetime import datetime
from pathlib import Path

from loguru import logger

from backend.app.core.config import get_settings
from backend.app.crawler.block_detector import is_blocked
from backend.app.crawler.browser_fetcher import browser_manager
from backend.app.crawler.downloader import BlockedByCloudflareError, downloader

_domain_locks: dict[str, asyncio.Lock] = {}
_blocked_until: dict[str, float] = {}
_block_counts: dict[str, int] = {}


def _get_domain_lock(domain: str) -> asyncio.Lock:
    if domain not in _domain_locks:
        _domain_locks[domain] = asyncio.Lock()
    return _domain_locks[domain]


async def polite_delay(domain: str) -> None:
    settings = get_settings()
    base_min = settings.crawler_min_delay
    base_max = settings.crawler_max_delay
    if base_min <= 0 and base_max <= 0:
        return

    extra = 0.0
    until = _blocked_until.get(domain, 0.0)
    now = asyncio.get_event_loop().time()
    if until > now:
        extra = until - now
        logger.info("Domain cooldown active for {}, waiting {:.1f}s", domain, extra)

    delay = random.uniform(base_min, base_max) + extra
    lock = _get_domain_lock(domain)
    async with lock:
        await asyncio.sleep(delay)


def _mark_blocked(domain: str) -> None:
    settings = get_settings()
    base_backoff = settings.crawler_403_backoff
    if base_backoff <= 0:
        return
    count = _block_counts.get(domain, 0) + 1
    _block_counts[domain] = count
    backoff = min(base_backoff * (2 ** (count - 1)), 600.0)
    _blocked_until[domain] = asyncio.get_event_loop().time() + backoff
    logger.warning(
        "Marked domain {} as blocked for {:.0f}s (consecutive block #{})",
        domain, backoff, count,
    )


def _reset_block_count(domain: str) -> None:
    _block_counts.pop(domain, None)


def _extract_domain(url: str) -> str:
    try:
        return url.split("//", 1)[1].split("/", 1)[0]
    except (IndexError, AttributeError):
        return url


async def smart_fetch(url: str, referer: str | None = None) -> str:
    settings = get_settings()
    mode = settings.fetch_mode
    domain = _extract_domain(url)

    if mode == "browser":
        await polite_delay(domain)
        return await browser_manager.fetch(url, referer=referer)

    if mode == "http":
        await polite_delay(domain)
        return await downloader.get_text(url, referer=referer)

    # mode == "auto": HTTP first, fallback to browser on Cloudflare
    await polite_delay(domain)
    try:
        html = await downloader.get_text(url, referer=referer)
        _reset_block_count(domain)
        return html
    except BlockedByCloudflareError:
        logger.info("Cloudflare detected, switching to browser: {}", url)
        _mark_blocked(domain)
    except Exception as exc:
        logger.info("HTTP failed ({}), switching to browser: {}", type(exc).__name__, url)
        _mark_blocked(domain)

    # Browser fallback with retry
    max_browser_attempts = max(settings.crawler_max_retry, 1)
    for attempt in range(max_browser_attempts):
        await polite_delay(domain)
        html = await browser_manager.fetch(url, referer=referer)
        if not is_blocked(html=html):
            return html
        logger.warning(
            "Browser attempt {}/{} blocked: {}",
            attempt + 1, max_browser_attempts, url,
        )
    _save_debug(url, 0, html, "browser_blocked")
    raise RuntimeError(
        f"Browser fetch blocked after {max_browser_attempts} attempts: {url}"
    )


async def smart_fetch_bytes(url: str, referer: str | None = None) -> bytes:
    settings = get_settings()
    if settings.fetch_mode == "browser":
        return await browser_manager.fetch_bytes(url, referer=referer)

    domain = _extract_domain(url)
    try:
        data = await downloader.get_bytes(url, referer=referer)
        _reset_block_count(domain)
        return data
    except BlockedByCloudflareError:
        logger.info("CF on image, switching to browser: {}", url)
        _mark_blocked(domain)
    except Exception as exc:
        logger.info(
            "Image HTTP failed ({}), switching to browser: {}",
            type(exc).__name__, url,
        )
        _mark_blocked(domain)

    # Browser fallback with retry
    max_browser_attempts = max(settings.crawler_max_retry, 1)
    for attempt in range(max_browser_attempts):
        try:
            return await browser_manager.fetch_bytes(url, referer=referer)
        except Exception as exc:
            logger.warning(
                "Browser image attempt {}/{} failed: {} - {}",
                attempt + 1, max_browser_attempts, url, exc,
            )
            if attempt < max_browser_attempts - 1:
                await polite_delay(domain)
    raise RuntimeError(
        f"Browser image fetch failed after {max_browser_attempts} attempts: {url}"
    )


def _save_debug(url: str, status_code: int, body: str, tag: str) -> None:
    settings = get_settings()
    if not settings.debug_save_on_fail:
        return
    try:
        debug_dir = Path(settings.download_path) / "debug"
        debug_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        slug = url.split("/")[-1].split("?")[0][:60] or "page"
        base = debug_dir / f"{tag}_{slug}_{ts}"
        (base.with_suffix(".html")).write_text(body[:50000], encoding="utf-8")
        meta = {"url": url, "status_code": status_code, "tag": tag, "ts": ts}
        (base.with_suffix(".json")).write_text(
            json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        logger.info("Debug saved: {}", base)
    except Exception as exc:
        logger.debug("Failed to save debug: {}", exc)
