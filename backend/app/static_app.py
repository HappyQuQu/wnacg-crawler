from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles


def mount_frontend(app: FastAPI) -> None:
    frontend_dist = Path("./frontend/dist")
    index_path = frontend_dist / "index.html"
    if index_path.exists():
        app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
