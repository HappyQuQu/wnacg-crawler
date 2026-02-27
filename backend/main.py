from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from loguru import logger

from backend.api.manga_router import router as manga_router
from backend.api.proxy_router import router as proxy_router
from backend.api.ws_router import router as ws_router
from backend.crawler.downloader import downloader
from backend.config import get_config
from backend.db.database import init_db

# ── 日志配置（修复 asyncio 并发写入问题）──────────────────────────────────
_cfg = get_config()
_log_dir = Path(_cfg.download_path) / "logs"
try:
    _log_dir.mkdir(parents=True, exist_ok=True)
except OSError:
    _log_dir = Path("./logs")
    _log_dir.mkdir(parents=True, exist_ok=True)

logger.add(
    str(_log_dir / "{time:YYYY-MM-DD}.log"),
    rotation="00:00",
    enqueue=True,          # ✅ asyncio 安全队列写入
    encoding="utf-8",
    retention="30 days",
)

# ── FastAPI 应用 ──────────────────────────────────────────────────────────
app = FastAPI(title="WNACG Downloader", version="1.0.0")


@app.on_event("startup")
async def startup():
    logger.info("服务启动中...")
    await init_db()
    await downloader.init()
    logger.info("服务启动完成")


@app.on_event("shutdown")
async def shutdown():
    await downloader.close()
    logger.info("服务已关闭")


# ── 路由注册 ──────────────────────────────────────────────────────────────
app.include_router(ws_router)
app.include_router(manga_router)
app.include_router(proxy_router)

# ── 前端静态文件 ──────────────────────────────────────────────────────────
_FRONTEND = Path(__file__).parent.parent / "frontend"
if _FRONTEND.exists():
    app.mount("/static", StaticFiles(directory=str(_FRONTEND)), name="static")

    @app.get("/", include_in_schema=False)
    async def root():
        return FileResponse(str(_FRONTEND / "index.html"))
