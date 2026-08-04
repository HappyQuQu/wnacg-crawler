from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.app.api.notification import manager

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/progress")
async def progress_ws(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Client can respond to ping with pong text
            if data == "pong":
                continue
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)

