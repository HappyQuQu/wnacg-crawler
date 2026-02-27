from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models import MangaInfo, MangaPage, MangaPicPage


class MangaRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    # ── MangaInfo ──────────────────────────────────────────────────────────

    async def get_manga_info(self, manga_id: str) -> Optional[MangaInfo]:
        result = await self.session.execute(
            select(MangaInfo).where(MangaInfo.id == manga_id)
        )
        return result.scalar_one_or_none()

    async def insert_manga_info(self, info: MangaInfo) -> None:
        self.session.add(info)
        await self.session.commit()

    async def update_manga_pic_count(self, manga_id: str, pic_count: int) -> None:
        info = await self.get_manga_info(manga_id)
        if info:
            info.pic_count = pic_count
            await self.session.commit()

    async def update_manga_finished(self, manga_id: str, is_finished: bool) -> None:
        info = await self.get_manga_info(manga_id)
        if info:
            info.is_finished = is_finished
            await self.session.commit()

    # ── MangaPage ──────────────────────────────────────────────────────────

    async def page_exists(self, page_name: str) -> bool:
        result = await self.session.execute(
            select(MangaPage).where(MangaPage.page_name == page_name)
        )
        return result.scalar_one_or_none() is not None

    async def get_manga_page_list(self, manga_id: str) -> list[MangaPage]:
        result = await self.session.execute(
            select(MangaPage).where(MangaPage.manga_id == manga_id)
            .order_by(MangaPage.page_index)
        )
        return list(result.scalars().all())

    async def insert_manga_page(self, page: MangaPage) -> None:
        self.session.add(page)
        await self.session.commit()

    # ── MangaPicPage ───────────────────────────────────────────────────────

    async def pic_page_exists(self, page_name: str) -> bool:
        result = await self.session.execute(
            select(MangaPicPage).where(MangaPicPage.page_name == page_name)
        )
        return result.scalar_one_or_none() is not None

    async def get_manga_pic_page_list(self, manga_id: str) -> list[MangaPicPage]:
        result = await self.session.execute(
            select(MangaPicPage).where(MangaPicPage.manga_id == manga_id)
            .order_by(MangaPicPage.pic_index)
        )
        return list(result.scalars().all())

    async def insert_manga_pic_page(self, pic_page: MangaPicPage) -> None:
        self.session.add(pic_page)
        await self.session.commit()

    async def get_unfinished_pic_pages(self, manga_id: str) -> list[MangaPicPage]:
        result = await self.session.execute(
            select(MangaPicPage).where(
                MangaPicPage.manga_id == manga_id,
                MangaPicPage.is_finished == False,  # noqa: E712
            ).order_by(MangaPicPage.pic_index)
        )
        return list(result.scalars().all())

    async def mark_pic_page_finished(self, page_name: str) -> None:
        result = await self.session.execute(
            select(MangaPicPage).where(MangaPicPage.page_name == page_name)
        )
        pic_page = result.scalar_one_or_none()
        if pic_page:
            pic_page.is_finished = True
            await self.session.commit()
