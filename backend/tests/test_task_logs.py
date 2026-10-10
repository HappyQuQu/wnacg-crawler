from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.app.api.notification import manager
from backend.app.db.repository import LogRepository
from backend.app.main import app
from backend.app.services.log_service import log_service


@pytest.mark.asyncio
async def test_log_broadcast_matches_committed_task_history(monkeypatch):
    task_id = f"task_{uuid4().hex}"

    async def verify_committed(payload):
        assert payload["type"] == "task_log"
        history = await log_service.list(task_id=task_id)
        assert history["items"] == [payload["item"]]

    broadcast = AsyncMock(side_effect=verify_committed)
    monkeypatch.setattr(manager, "broadcast", broadcast)
    await log_service.write(
        "warning", "image_url_resolve_failed", "未解析到图片地址",
        manga_id="900000099", task_id=task_id, stage="resolving_images",
        details={"page_index": 7, "page_url": "https://example.test/page/7"},
    )
    broadcast.assert_awaited_once()
    item = broadcast.await_args.args[0]["item"]
    assert item["id"] > 0
    assert item["created_at"]
    assert item["details"]["page_index"] == 7


@pytest.mark.asyncio
async def test_task_history_filters_same_manga_and_preserves_newest_first(monkeypatch):
    first_id, second_id = (f"task_{uuid4().hex}" for _ in range(2))
    monkeypatch.setattr(manager, "broadcast", AsyncMock())
    for task_id, message in ((first_id, "第一次"), (second_id, "其他任务"), (first_id, "最新")):
        await log_service.write("info", "task_started", message, "900000098", task_id)
    client = TestClient(app)
    response = client.get("/api/logs", params={"task_id": first_id, "limit": 1})
    assert response.status_code == 200
    assert [item["message"] for item in response.json()["data"]["items"]] == ["最新"]
    response = client.get("/api/logs", params={"task_id": first_id})
    assert [item["message"] for item in response.json()["data"]["items"]] == ["最新", "第一次"]


@pytest.mark.asyncio
async def test_failed_log_write_never_broadcasts_unpersisted_entry(monkeypatch):
    broadcast = AsyncMock()
    monkeypatch.setattr(manager, "broadcast", broadcast)
    monkeypatch.setattr(LogRepository, "create", AsyncMock(side_effect=RuntimeError("DB failure")))
    with pytest.raises(RuntimeError, match="DB failure"):
        await log_service.write("info", "task_started", "任务开始执行")
    broadcast.assert_not_awaited()
