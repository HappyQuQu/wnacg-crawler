import asyncio
import json
from typing import Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from loguru import logger

router = APIRouter()


class ConnectionManager:
    """WebSocket 连接管理器，支持广播给所有连接的客户端"""

    def __init__(self):
        self.active: Set[WebSocket] = set()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.add(ws)
        logger.info("WebSocket 新连接，当前连接数: {}", len(self.active))

    def disconnect(self, ws: WebSocket):
        self.active.discard(ws)
        logger.info("WebSocket 断开，当前连接数: {}", len(self.active))

    async def broadcast(self, data: dict):
        """向所有客户端广播消息"""
        msg = json.dumps(data, ensure_ascii=False)
        dead: Set[WebSocket] = set()
        for ws in list(self.active):
            try:
                await ws.send_text(msg)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self.active.discard(ws)


# 全局连接管理器
manager = ConnectionManager()


@router.websocket("/ws/progress")
async def progress_ws(websocket: WebSocket):
    """
    前端通过此端点订阅下载进度。
    消息格式：{stage, manga_id, progress?, total?, status?, message?}
    """
    await manager.connect(websocket)
    try:
        while True:
            # 保持连接，接收心跳
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
