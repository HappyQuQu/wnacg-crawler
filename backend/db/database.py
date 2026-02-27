from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.config import get_config
from backend.db.models import Base

_engine = None
_session_factory = None


def _resolve_db_path() -> str:
    """解析数据库路径，本地开发时自动 fallback"""
    config = get_config()
    db_path = Path(config.db_path)
    try:
        db_path.parent.mkdir(parents=True, exist_ok=True)
        # 测试是否可写
        test = db_path.parent / ".write_test"
        test.touch()
        test.unlink()
        return str(db_path)
    except OSError:
        # 无法写入（如容器路径未挂载），退回到项目本地
        fallback = Path("./config/data.sqlite")
        fallback.parent.mkdir(parents=True, exist_ok=True)
        return str(fallback)


def get_engine():
    global _engine
    if _engine is None:
        db_path = _resolve_db_path()
        _engine = create_async_engine(
            f"sqlite+aiosqlite:///{db_path}",
            echo=False,
        )
    return _engine


def get_session_factory() -> async_sessionmaker:
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            get_engine(), class_=AsyncSession, expire_on_commit=False
        )
    return _session_factory


async def init_db():
    """建表（首次运行）"""
    async with get_engine().begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
