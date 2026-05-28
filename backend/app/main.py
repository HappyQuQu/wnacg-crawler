from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.api import config, extension, health, inputs, library, logs, tasks, ws
from backend.app.core.config import get_settings
from backend.app.crawler.browser_fetcher import browser_manager
from backend.app.crawler.downloader import downloader
from backend.app.db.database import init_db
from backend.app.services.log_service import log_service
from backend.app.services.task_runner import task_runner
from backend.app.static_app import mount_frontend


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await log_service.backfill_existing_failures()
    await task_runner.restore_queued_tasks()
    yield
    await browser_manager.close()
    await downloader.close()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="WNACG Downloader",
        version="2.0.0-dev",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(inputs.router)
    app.include_router(tasks.router)
    app.include_router(library.router)
    app.include_router(logs.router)
    app.include_router(config.router)
    app.include_router(extension.router)
    app.include_router(ws.router)
    mount_frontend(app)
    return app


app = create_app()
