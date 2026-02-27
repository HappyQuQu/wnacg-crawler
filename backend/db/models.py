from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class MangaInfo(Base):
    """漫画基本信息"""
    __tablename__ = "manga_info"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, default="")
    cover_url: Mapped[str] = mapped_column(String, default="")
    page_count: Mapped[int] = mapped_column(Integer, default=0)
    pic_count: Mapped[int] = mapped_column(Integer, default=0)
    is_finished: Mapped[bool] = mapped_column(Boolean, default=False)
    is_error: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())


class MangaPage(Base):
    """漫画列表页 HTML 缓存"""
    __tablename__ = "manga_page"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    manga_id: Mapped[str] = mapped_column(String, index=True)
    page_name: Mapped[str] = mapped_column(String, unique=True)
    page_url: Mapped[str] = mapped_column(String)
    page_index: Mapped[int] = mapped_column(Integer)
    page_context: Mapped[str] = mapped_column(Text, default="")
    is_finished: Mapped[bool] = mapped_column(Boolean, default=False)
    is_error: Mapped[bool] = mapped_column(Boolean, default=False)


class MangaPicPage(Base):
    """图片详情页信息"""
    __tablename__ = "manga_pic_page"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    manga_id: Mapped[str] = mapped_column(String, index=True)
    page_name: Mapped[str] = mapped_column(String, unique=True)
    page_index: Mapped[int] = mapped_column(Integer)
    page_url: Mapped[str] = mapped_column(String)
    pic_num: Mapped[str] = mapped_column(String, default="")
    pic_index: Mapped[int] = mapped_column(Integer, default=0)
    pic_url: Mapped[str] = mapped_column(String, default="")
    is_finished: Mapped[bool] = mapped_column(Boolean, default=False)
    is_error: Mapped[bool] = mapped_column(Boolean, default=False)
