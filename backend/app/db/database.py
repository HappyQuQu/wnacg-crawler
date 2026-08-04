from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.app.core.config import get_settings
from backend.app.db.models import Base

_engine = None
_SessionLocal = None
_current_db_path: str | None = None


def _get_engine_and_session():
    global _engine, _SessionLocal, _current_db_path
    settings = get_settings()
    db_path_str = str(settings.db_path)
    if _engine is None or _current_db_path != db_path_str:
        old_engine = _engine
        _engine = create_async_engine(
            f"sqlite+aiosqlite:///{db_path_str}", echo=False
        )
        _SessionLocal = async_sessionmaker(
            _engine, class_=AsyncSession, expire_on_commit=False
        )
        _current_db_path = db_path_str
        # Dispose old engine (best-effort, fire-and-forget)
        if old_engine is not None:
            import asyncio
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(old_engine.dispose())
            except RuntimeError:
                # No running loop; old engine will be GC'd
                pass
    return _engine, _SessionLocal


def get_engine():
    engine, _ = _get_engine_and_session()
    return engine


def get_session_factory():
    _, session_factory = _get_engine_and_session()
    return session_factory


class _SessionLocalProxy:
    """Lazy proxy that always returns a session from the current engine."""
    def __call__(self):
        _, session_factory = _get_engine_and_session()
        return session_factory()

    def __getattr__(self, name):
        _, session_factory = _get_engine_and_session()
        return getattr(session_factory, name)


SessionLocal = _SessionLocalProxy()


async def init_db() -> None:
    settings = get_settings()
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_session():
    async with SessionLocal() as session:
        yield session

