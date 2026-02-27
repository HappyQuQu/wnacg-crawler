import asyncio
from typing import Optional

import httpx
from loguru import logger
from tenacity import retry, stop_after_attempt, wait_exponential

from backend.config import get_config


class Downloader:
    """httpx 异步单例下载器，修复 C# 版每次 new HttpClient 的连接池耗尽问题"""

    _instance: Optional["Downloader"] = None
    _client: Optional[httpx.AsyncClient] = None
    _semaphore: Optional[asyncio.Semaphore] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def _build_client(self) -> httpx.AsyncClient:
        """按当前 config 构建 httpx.AsyncClient"""
        config = get_config()
        proxy_url: Optional[str] = None
        if config.proxy.is_proxy:
            proxy_url = f"http://{config.proxy.address}:{config.proxy.port}"
            logger.info("下载器使用代理: {}", proxy_url)
        else:
            logger.info("下载器无代理直连")

        return httpx.AsyncClient(
            proxy=proxy_url,
            timeout=30.0,
            follow_redirects=True,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                )
            },
        )

    async def init(self):
        """应用启动时调用"""
        config = get_config()
        self._semaphore = asyncio.Semaphore(config.max_thread)
        self._client = self._build_client()
        logger.info("Downloader 初始化完成，并发上限: {}", config.max_thread)

    async def reload(self):
        """保存配置后调用：热重载代理和并发设置，无需重启服务"""
        config = get_config()
        # 重建 semaphore
        self._semaphore = asyncio.Semaphore(config.max_thread)
        # 关闭旧 client，重新建立
        if self._client:
            await self._client.aclose()
        self._client = self._build_client()
        logger.info("Downloader 已热重载，并发: {}, 代理: {}",
                    config.max_thread, config.proxy.is_proxy)

    async def close(self):
        if self._client:
            await self._client.aclose()
            self._client = None
            logger.info("Downloader 已关闭")

    @retry(
        stop=stop_after_attempt(5),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        reraise=True,
    )
    async def get_text(self, url: str) -> str:
        """下载页面 HTML"""
        assert self._client, "Downloader 未初始化，请先调用 init()"
        async with self._semaphore:
            resp = await self._client.get(url)
            resp.raise_for_status()
            return resp.text

    @retry(
        stop=stop_after_attempt(5),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        reraise=True,
    )
    async def get_bytes(self, url: str) -> bytes:
        """下载图片二进制"""
        assert self._client, "Downloader 未初始化，请先调用 init()"
        async with self._semaphore:
            resp = await self._client.get(url)
            resp.raise_for_status()
            return resp.content


# 全局单例
downloader = Downloader()
