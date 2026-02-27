import asyncio
import os
import re
import zipfile
from pathlib import Path
from typing import Callable, Optional

from loguru import logger

from backend.config import get_config
from backend.crawler.downloader import downloader
from backend.crawler.parser import manga_parser, PicPageItem
from backend.db.database import get_session_factory
from backend.db.models import MangaInfo, MangaPage, MangaPicPage
from backend.db.repository import MangaRepository

# 文件名非法字符
_ILLEGAL_CHARS = re.compile(r'[\\/:*?"<>|]')


def _safe_name(name: str) -> str:
    return _ILLEGAL_CHARS.sub("_", name).strip()


def _resolve_path(configured: str, fallback: str = "./data") -> Path:
    """解析路径，本地开发时 fallback 到项目目录"""
    p = Path(configured)
    try:
        p.mkdir(parents=True, exist_ok=True)
        test = p / ".write_test"
        test.touch()
        test.unlink()
        return p
    except OSError:
        fb = Path(fallback)
        fb.mkdir(parents=True, exist_ok=True)
        logger.warning("路径 {} 不可写，使用 fallback: {}", configured, fb)
        return fb


class MangaService:
    """业务编排层，对应 C# 版 Program.cs 中的流程逻辑"""

    async def run(
        self,
        manga_id: str,
        broadcast: Optional[Callable] = None,
    ):
        """完整下载流程入口"""

        async def _broadcast(msg: dict):
            if broadcast:
                await broadcast(msg)

        try:
            await _broadcast({"stage": "info", "manga_id": manga_id, "status": "fetching"})
            await self._fetch_manga_info(manga_id, _broadcast)

            await _broadcast({"stage": "download", "manga_id": manga_id, "status": "start"})
            await self._download_images(manga_id, _broadcast)

            config = get_config()
            if config.is_zip:
                await _broadcast({"stage": "zip", "manga_id": manga_id, "status": "start"})
                await self._zip_manga(manga_id)

            await _broadcast({"stage": "done", "manga_id": manga_id})
            logger.info("漫画 {} 全部完成", manga_id)

        except Exception as e:
            logger.error("漫画 {} 出现错误: {}", manga_id, e)
            await _broadcast({"stage": "error", "manga_id": manga_id, "message": str(e)})

    # ── 步骤一：获取漫画元信息 ────────────────────────────────────────────

    async def _fetch_manga_info(self, manga_id: str, broadcast: Callable):
        config = get_config()
        session_factory = get_session_factory()

        async with session_factory() as session:
            repo = MangaRepository(session)
            info = await repo.get_manga_info(manga_id)

            if not info:
                logger.info("漫画 {} 不存在，开始获取...", manga_id)
                url = config.manga_page_url.format(page=1, aid=manga_id)
                html = await downloader.get_text(url)
                parsed = manga_parser.parse_manga_info(html, manga_id)

                info = MangaInfo(
                    id=manga_id,
                    name=parsed["name"],
                    cover_url=parsed["cover_url"],
                    page_count=parsed["page_count"],
                )
                await repo.insert_manga_info(info)
            else:
                logger.info("漫画 {} 已存在：{}", manga_id, info.name)

            # 下载所有列表页并缓存到数据库
            await self._fetch_manga_pages(manga_id, info.page_count, repo, config)

            # 解析并缓存图片详情页
            await self._fetch_pic_pages(manga_id, repo, config)

    async def _fetch_manga_pages(
        self, manga_id: str, max_page: int, repo: MangaRepository, config
    ):
        for i in range(1, max_page + 1):
            page_name = f"id_{manga_id}_mangaPage_{i}.html"
            if await repo.page_exists(page_name):
                continue
            url = config.manga_page_url.format(page=i, aid=manga_id)
            try:
                html = await downloader.get_text(url)
                page = MangaPage(
                    manga_id=manga_id,
                    page_name=page_name,
                    page_url=url,
                    page_index=i,
                    page_context=html,
                    is_finished=True,
                )
                await repo.insert_manga_page(page)
                logger.info("列表页 {}/{} 下载完成", i, max_page)
            except Exception as e:
                logger.error("列表页 {}/{} 下载失败: {}", i, max_page, e)

    async def _fetch_pic_pages(
        self, manga_id: str, repo: MangaRepository, config
    ):
        page_list = await repo.get_manga_page_list(manga_id)
        pic_pages = await repo.get_manga_pic_page_list(manga_id)

        if pic_pages:
            logger.info("漫画 {} 图片详情页已缓存 {} 条", manga_id, len(pic_pages))
            return

        all_items: list[PicPageItem] = []
        for page in page_list:
            items = manga_parser.parse_pic_page_list(
                page.page_context, manga_id, config.manga_main_url
            )
            all_items.extend(items)

        # 去重
        seen: set[str] = set()
        unique_items = []
        for item in all_items:
            if item.pic_num not in seen:
                seen.add(item.pic_num)
                unique_items.append(item)

        # 为每条详情页获取真实图片 URL（顺序请求 + 限速，避免 429）
        for item in unique_items:
            if await repo.pic_page_exists(item.page_name):
                continue
            # 每次请求前等待，避免触发限速
            await asyncio.sleep(0.3)
            retry_wait = 5.0
            for attempt in range(4):
                try:
                    html = await downloader.get_text(item.page_url)
                    pic_url = manga_parser.parse_pic_url(html) or ""
                    pic_page = MangaPicPage(
                        manga_id=manga_id,
                        page_name=item.page_name,
                        page_index=item.pic_index,
                        page_url=item.page_url,
                        pic_num=item.pic_num,
                        pic_index=item.pic_index,
                        pic_url=pic_url,
                    )
                    await repo.insert_manga_pic_page(pic_page)
                    logger.info("图片详情 {}/{} 解析完成", item.pic_index, len(unique_items))
                    break
                except Exception as e:
                    err = str(e)
                    if "429" in err and attempt < 3:
                        logger.warning("429 限速，{}s 后重试 ({}/3)...", retry_wait, attempt + 1)
                        await asyncio.sleep(retry_wait)
                        retry_wait = min(retry_wait * 2, 60)
                    else:
                        logger.error("图片详情 {} 解析失败: {}", item.page_name, e)
                        break

        # 更新总图片数
        await repo.update_manga_pic_count(manga_id, len(unique_items))

    # ── 步骤二：下载图片文件 ──────────────────────────────────────────────

    async def _download_images(self, manga_id: str, broadcast: Callable):
        config = get_config()
        session_factory = get_session_factory()

        async with session_factory() as session:
            repo = MangaRepository(session)
            info = await repo.get_manga_info(manga_id)
            pic_pages = await repo.get_manga_pic_page_list(manga_id)

        if not pic_pages or not info:
            logger.warning("漫画 {} 没有图片记录", manga_id)
            return

        manga_name = _safe_name(info.name)
        base_dir = _resolve_path(config.download_path)
        save_dir = base_dir / "Manga" / manga_name
        save_dir.mkdir(parents=True, exist_ok=True)

        total = len(pic_pages)

        # 并发下载（受 downloader._semaphore 控制，无需额外 gather 限制）
        completed = 0

        async def _download_one(pic_page: MangaPicPage, idx: int):
            nonlocal completed
            if not pic_page.pic_url:
                return
            # 清理 URL fragment（有些图片 URL 含 #）
            pic_url = pic_page.pic_url.split("#")[0]
            ext = Path(pic_url).suffix or ".jpg"
            filename = f"{str(idx).zfill(4)}_{pic_page.pic_num}{ext}"
            file_path = save_dir / filename

            if file_path.exists() and file_path.stat().st_size > 15 * 1024:
                completed += 1
                return

            retry_wait = 3.0
            for attempt in range(4):
                try:
                    data = await downloader.get_bytes(pic_url)
                    file_path.write_bytes(data)
                    completed += 1
                    logger.info("图片 {}/{} 下载完成: {}", completed, total, filename)
                    await broadcast({"stage": "download", "manga_id": manga_id,
                                     "progress": completed, "total": total})
                    break
                except Exception as e:
                    err = str(e)
                    if "429" in err and attempt < 3:
                        logger.warning("图片 429 限速，{}s 后重试", retry_wait)
                        await asyncio.sleep(retry_wait)
                        retry_wait = min(retry_wait * 2, 30)
                    else:
                        logger.error("图片 {} 下载失败: {}", filename, e)
                        break

        await asyncio.gather(*[_download_one(p, p.pic_index) for p in pic_pages])
        logger.info("漫画 {} 图片下载完成，共 {} 张", manga_id, total)

    # ── 步骤三：打包 ZIP ──────────────────────────────────────────────────

    async def _zip_manga(self, manga_id: str):
        config = get_config()
        session_factory = get_session_factory()

        async with session_factory() as session:
            repo = MangaRepository(session)
            info = await repo.get_manga_info(manga_id)

        if not info:
            return

        manga_name = _safe_name(info.name)
        base_dir = _resolve_path(config.download_path)
        manga_dir = base_dir / "Manga" / manga_name
        zip_dir = base_dir / "Zip"
        zip_dir.mkdir(parents=True, exist_ok=True)
        zip_path = zip_dir / f"{manga_name}.zip"

        if zip_path.exists():
            zip_path.unlink()

        logger.info("开始打包: {}", manga_name)
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None, lambda: _create_zip(manga_dir, zip_path)
        )
        logger.info("打包完成: {}", zip_path)


def _create_zip(source_dir: Path, zip_path: Path):
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in sorted(source_dir.iterdir()):
            if f.is_file():
                zf.write(f, f.name)


# 全局单例
manga_service = MangaService()
