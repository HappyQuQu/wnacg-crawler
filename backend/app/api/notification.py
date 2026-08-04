"""Central notification hub for real-time WebSocket alerts.

Owns the WebSocket ConnectionManager and provides helpers for
broadcasting system-wide alerts (e.g. IP block, Cloudflare challenge).
"""
from __future__ import annotations

import asyncio

from fastapi import WebSocket

PING_INTERVAL = 30  # seconds between pings


class ConnectionManager:
    def __init__(self) -> None:
        self.active: set[WebSocket] = set()
        self._heartbeat_task: asyncio.Task | None = None

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active.add(websocket)
        if self._heartbeat_task is None or self._heartbeat_task.done():
            self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

    def disconnect(self, websocket: WebSocket) -> None:
        self.active.discard(websocket)

    async def broadcast(self, payload: dict) -> None:
        dead: set[WebSocket] = set()
        for websocket in list(self.active):
            try:
                await websocket.send_json(payload)
            except Exception:
                dead.add(websocket)
        for websocket in dead:
            self.disconnect(websocket)

    async def _heartbeat_loop(self) -> None:
        """Send periodic pings to detect dead connections."""
        while self.active:
            await asyncio.sleep(PING_INTERVAL)
            dead: set[WebSocket] = set()
            for websocket in list(self.active):
                try:
                    await websocket.send_json({"type": "ping"})
                except Exception:
                    dead.add(websocket)
            for websocket in dead:
                self.disconnect(websocket)


# ── Singleton ──────────────────────────────────────────────────────
manager = ConnectionManager()

# ── Block state tracking ───────────────────────────────────────────
# Tracks currently-blocked domains so we can broadcast "cleared" alerts.
# Keys are domain strings; values are block-type strings.
_active_blocks: dict[str, str] = {}


async def broadcast_block_alert(
    domain: str,
    block_type: str,
    message: str,
    guidance: str,
) -> None:
    """Broadcast an IP-block system alert to all connected clients.

    Also updates the internal block-state tracker.
    """
    _active_blocks[domain] = block_type
    await manager.broadcast({
        "type": "system_alert",
        "alert_type": "ip_blocked",
        "domain": domain,
        "block_type": block_type,
        "message": message,
        "guidance": guidance,
        "action": "blocked",
        "blocked_domains": list(_active_blocks.keys()),
    })


async def broadcast_block_cleared(domain: str) -> None:
    """Broadcast that a previously-blocked domain has recovered."""
    _active_blocks.pop(domain, None)
    await manager.broadcast({
        "type": "system_alert",
        "alert_type": "ip_blocked",
        "domain": domain,
        "block_type": "cleared",
        "message": f"域名 {domain} 的封锁已解除",
        "guidance": "下载将自动恢复正常",
        "action": "cleared",
        "blocked_domains": list(_active_blocks.keys()),
    })
