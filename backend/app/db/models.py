from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class MangaInfo(Base):
    __tablename__ = "manga_info"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    title: Mapped[str] = mapped_column(String, default="")
    cover_url: Mapped[str] = mapped_column(String, default="")
    page_count: Mapped[int] = mapped_column(Integer, default=0)
    pic_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String, default="unknown", index=True)
    last_error: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class MangaPage(Base):
    __tablename__ = "manga_page"
    __table_args__ = (UniqueConstraint("manga_id", "page_index"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    manga_id: Mapped[str] = mapped_column(String, index=True)
    page_index: Mapped[int] = mapped_column(Integer)
    page_url: Mapped[str] = mapped_column(String)
    page_name: Mapped[str] = mapped_column(String, unique=True)
    page_context: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String, default="pending", index=True)
    error_message: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class MangaPicPage(Base):
    __tablename__ = "manga_pic_page"
    __table_args__ = (UniqueConstraint("manga_id", "page_index"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    manga_id: Mapped[str] = mapped_column(String, index=True)
    page_index: Mapped[int] = mapped_column(Integer)
    page_url: Mapped[str] = mapped_column(String)
    page_name: Mapped[str] = mapped_column(String)
    pic_index: Mapped[int] = mapped_column(Integer)
    pic_num: Mapped[str] = mapped_column(String, default="")
    pic_url: Mapped[str] = mapped_column(String, default="")
    status: Mapped[str] = mapped_column(String, default="pending", index=True)
    error_message: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class DownloadTask(Base):
    __tablename__ = "download_task"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    manga_id: Mapped[str] = mapped_column(String, index=True)
    source: Mapped[str] = mapped_column(String, default="manual")
    status: Mapped[str] = mapped_column(String, default="pending", index=True)
    stage: Mapped[str] = mapped_column(String, default="none", index=True)
    progress_current: Mapped[int] = mapped_column(Integer, default=0)
    progress_total: Mapped[int] = mapped_column(Integer, default=0)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class DownloadFile(Base):
    __tablename__ = "download_file"
    __table_args__ = (UniqueConstraint("manga_id", "pic_index"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    manga_id: Mapped[str] = mapped_column(String, index=True)
    pic_index: Mapped[int] = mapped_column(Integer)
    file_path: Mapped[str] = mapped_column(String)
    file_name: Mapped[str] = mapped_column(String)
    file_size: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String, default="missing", index=True)
    error_message: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class AppLog(Base):
    __tablename__ = "app_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    level: Mapped[str] = mapped_column(String, default="info", index=True)
    event: Mapped[str] = mapped_column(String, default="", index=True)
    message: Mapped[str] = mapped_column(Text, default="")
    manga_id: Mapped[str] = mapped_column(String, default="", index=True)
    task_id: Mapped[str] = mapped_column(String, default="", index=True)
    stage: Mapped[str] = mapped_column(String, default="", index=True)
    details: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
