from __future__ import annotations

import asyncio
import json
import random
import time as _time
from datetime import datetime
from pathlib import Path

from loguru import logger

from backend.app.core.config import get_settings
from backend.app.core.errors import ImageHTTPError
from backend.app.crawler.block_detector import BlockResult, classify_block, is_blocked
from backend.app.crawler.browser_fetcher import browser_manager
from backend.app.crawler.downloader import BlockedByCloudflareError, downloader

_domain_locks: dict[str, asyncio.Lock] = {}
_blocked_until: dict[str, float] = {}
_block_counts: dict[str, int] = {}
_last_block_time: dict[str, float] = {}

# If no new block for this many seconds, reset the consecutive counter
_BLOCK_RESET_SECONDS = 300.0


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
    now = _time.monotonic()
    if until > now:
        extra = until - now
        logger.info("Domain cooldown active for {}, waiting {:.1f}s", domain, extra)

    delay = random.uniform(base_min, base_max) + extra
    lock = _get_domain_lock(domain)
    async with lock:
        await asyncio.sleep(delay)


def _mark_blocked(domain: str, block_type_hint: str | None = None) -> None:
    settings = get_settings()
    base_backoff = settings.crawler_403_backoff
    if base_backoff <= 0:
        return

    now = _time.monotonic()

    # If the cooldown hasn't expired yet, don't escalate — the block is
    # already being handled. This prevents parallel requests from all
    # independently incrementing the counter.
    existing_until = _blocked_until.get(domain, 0.0)
    if existing_until > now:
        logger.debug(
            "Domain {} still on cooldown ({}s remaining), skipping escalation",
            domain,
            f"{existing_until - now:.1f}",
        )
        return

    # Reset counter if enough time has passed since last block
    last_block = _last_block_time.get(domain, 0.0)
    if _time.monotonic() - last_block > _BLOCK_RESET_SECONDS:
        _block_counts[domain] = 0

    _last_block_time[domain] = _time.monotonic()
    count = _block_counts.get(domain, 0) + 1
    _block_counts[domain] = count
    backoff = min(base_backoff * (2 ** (count - 1)), 600.0)
    _blocked_until[domain] = now + backoff
    logger.warning(
        "Marked domain {} as blocked for {:.0f}s (consecutive block #{})",
        domain, backoff, count,
    )

    # Broadcast real-time alert to all connected frontend clients
    block_result = classify_block(block_type_hint=block_type_hint)
    _broadcast_block_alert(domain, block_result, backoff)


def _broadcast_block_alert(
    domain: str, block_result: BlockResult, backoff: float
) -> None:
    from backend.app.api.notification import broadcast_block_alert

    guidance = block_result.guidance
    if backoff > 0:
        guidance += f"\n⏳ 自动冷却 {backoff:.0f}s，期间不会发送新请求"

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(
            broadcast_block_alert(
                domain=domain,
                block_type=block_result.block_type,
                message=block_result.message,
                guidance=guidance,
            )
        )
    except RuntimeError:
        pass


def _reset_block_count(domain: str) -> None:
    had_block = domain in _block_counts
    _block_counts.pop(domain, None)
    _last_block_time.pop(domain, None)
    if had_block:
        _broadcast_block_cleared(domain)


def _broadcast_block_cleared(domain: str) -> None:
    from backend.app.api.notification import broadcast_block_cleared

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(broadcast_block_cleared(domain))
    except RuntimeError:
        pass


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
        _mark_blocked(domain, block_type_hint="cloudflare")
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
        # Notify on first browser block (different from HTTP block)
        if attempt == 0:
            _mark_blocked(domain, block_type_hint="cloudflare")
    _save_debug(url, 200, html, "browser_blocked")
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
        _mark_blocked(domain, block_type_hint="cloudflare")
    except ImageHTTPError:
        raise
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
            if isinstance(exc, ImageHTTPError) and exc.status_code == 403:
                raise
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
