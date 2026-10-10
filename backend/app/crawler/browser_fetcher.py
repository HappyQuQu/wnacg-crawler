from __future__ import annotations

import asyncio
import json
import random
from datetime import datetime
from pathlib import Path

from loguru import logger
from playwright.async_api import Browser, BrowserContext, Playwright, async_playwright

from backend.app.core.config import get_settings
from backend.app.core.errors import ImageHTTPError
from backend.app.crawler.block_detector import is_cloudflare_challenge

_BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/125.0.0.0 Safari/537.36"
)

# Realistic viewport sizes to avoid fingerprinting
_VIEWPORTS = [
    {"width": 1920, "height": 1080},
    {"width": 1366, "height": 768},
    {"width": 1536, "height": 864},
    {"width": 1440, "height": 900},
    {"width": 1280, "height": 720},
]


def _default_state_path() -> Path:
    return Path(get_settings().download_path) / ".browser_state.json"


def _build_proxy_config(settings) -> dict | None:
    """Build Playwright proxy config from app settings."""
    if not settings.proxy.is_proxy:
        return None
    proxy_url = f"http://{settings.proxy.address}:{settings.proxy.port}"
    proxy_cfg: dict = {"server": proxy_url}
    if settings.proxy.username:
        proxy_cfg["username"] = settings.proxy.username
    if settings.proxy.password:
        proxy_cfg["password"] = settings.proxy.password
    return proxy_cfg


class BrowserManager:
    def __init__(self) -> None:
        self._pw: Playwright | None = None
        self._browser: Browser | None = None
        self._lock = asyncio.Lock()

    async def _ensure_started(self) -> Browser:
        if self._browser is not None and self._browser.is_connected():
            return self._browser
        async with self._lock:
            if self._browser is not None and self._browser.is_connected():
                return self._browser
            settings = get_settings()
            self._pw = await async_playwright().start()

            launch_args: dict = {
                "headless": settings.browser_headless,
                "args": [
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-blink-features=AutomationControlled",
                    "--disable-features=IsolateOrigins,site-per-process",
                ],
            }
            proxy_cfg = _build_proxy_config(settings)
            if proxy_cfg:
                launch_args["proxy"] = proxy_cfg
                logger.info("Playwright browser using proxy: {}", proxy_cfg["server"])

            self._browser = await self._pw.chromium.launch(**launch_args)
            logger.info("Playwright browser launched (headless={})", settings.browser_headless)
        return self._browser

    async def fetch(self, url: str, referer: str | None = None) -> str:
        browser = await self._ensure_started()
        settings = get_settings()
        context: BrowserContext | None = None
        try:
            viewport = random.choice(_VIEWPORTS)
            context_opts: dict = {
                "user_agent": _BROWSER_UA,
                "locale": "zh-CN",
                "timezone_id": "Asia/Shanghai",
                "viewport": viewport,
                "extra_http_headers": {
                    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                    "sec-ch-ua": (
                        '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"'
                    ),
                    "sec-ch-ua-mobile": "?0",
                    "sec-ch-ua-platform": '"Windows"',
                },
            }
            state_path = settings.browser_state_path or str(_default_state_path())
            if Path(state_path).exists():
                context_opts["storage_state"] = state_path

            context = await browser.new_context(**context_opts)
            page = await context.new_page()

            if settings.enable_stealth:
                try:
                    from playwright_stealth import stealth_async  # type: ignore[import-untyped]
                    await stealth_async(page)
                    logger.debug("Stealth applied for {}", url)
                except ImportError:
                    logger.warning(
                        "playwright-stealth not installed, skipping stealth"
                    )
                except Exception as exc:
                    logger.debug("Stealth failed: {}", exc)

            if referer:
                try:
                    await page.goto(referer, wait_until="domcontentloaded", timeout=15000)
                except Exception:
                    logger.debug("referer navigation failed: {}", referer)

            await page.goto(url, wait_until="networkidle", timeout=60000)
            html = await page.content()

            if is_cloudflare_challenge(html):
                logger.warning("Browser still blocked by Cloudflare: {}", url)
                if settings.debug_save_on_fail:
                    await self._save_failure_debug(page, url, "browser_cloudflare")
                raise RuntimeError(f"Browser still blocked by Cloudflare: {url}")

            await self._save_cookies(context)
            return html
        except Exception:
            if settings.debug_save_on_fail:
                try:
                    await self._save_failure_debug(page, url, "browser_error")
                except Exception:
                    pass
            raise
        finally:
            if page:
                try:
                    await page.close()
                except Exception:
                    pass
            if context:
                try:
                    await context.close()
                except Exception:
                    pass

    async def fetch_bytes(self, url: str, referer: str | None = None) -> bytes:
        browser = await self._ensure_started()
        settings = get_settings()
        context: BrowserContext | None = None
        try:
            context_opts: dict = {
                "user_agent": _BROWSER_UA,
                "locale": "zh-CN",
                "extra_http_headers": {"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"},
            }
            state_path = settings.browser_state_path or str(_default_state_path())
            if Path(state_path).exists():
                context_opts["storage_state"] = state_path

            context = await browser.new_context(**context_opts)
            page = await context.new_page()

            if settings.enable_stealth:
                try:
                    from playwright_stealth import stealth_async

                    await stealth_async(page)
                except Exception:
                    pass

            if referer:
                try:
                    await page.goto(referer, wait_until="domcontentloaded", timeout=15000)
                except Exception:
                    logger.debug("referer navigation failed: {}", referer)

            try:
                resp = await page.request.get(url, timeout=60000)
            except Exception as exc:
                raise RuntimeError(f"Browser image fetch failed: {url}") from exc

            if resp.status >= 400:
                raise ImageHTTPError(resp.status, url)

            await self._save_cookies(context)
            return await resp.body()
        finally:
            if page:
                try:
                    await page.close()
                except Exception:
                    pass
            if context:
                try:
                    await context.close()
                except Exception:
                    pass

    async def _save_cookies(self, context: BrowserContext) -> None:
        try:
            state_path = _default_state_path()
            state_path.parent.mkdir(parents=True, exist_ok=True)
            state = await context.storage_state()
            state_path.write_text(
                json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            logger.debug("Browser cookies saved to {}", state_path)
        except Exception as exc:
            logger.debug("Failed to save browser cookies: {}", exc)

    async def _save_failure_debug(self, page, url: str, tag: str) -> None:
        try:
            settings = get_settings()
            debug_dir = Path(settings.download_path) / "debug"
            debug_dir.mkdir(parents=True, exist_ok=True)
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            slug = url.split("/")[-1].split("?")[0][:60] or "page"
            base = debug_dir / f"{tag}_{slug}_{ts}"

            html = await page.content()
            (base.with_suffix(".html")).write_text(html[:50000], encoding="utf-8")
            await page.screenshot(path=str(base.with_suffix(".png")), full_page=True)
            meta = {"url": url, "tag": tag, "ts": ts}
            (base.with_suffix(".json")).write_text(
                json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            logger.info("Failure debug saved: {}", base)
        except Exception as exc:
            logger.debug("Failed to save failure debug: {}", exc)

    async def close(self) -> None:
        if self._browser is not None:
            await self._browser.close()
            self._browser = None
        if self._pw is not None:
            await self._pw.stop()
            self._pw = None
        logger.info("Playwright browser closed")


browser_manager = BrowserManager()
