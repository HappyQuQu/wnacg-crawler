from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["websocket"])


class ConnectionManager:
    def __init__(self) -> None:
        self.active: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active.add(websocket)

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


manager = ConnectionManager()


@router.websocket("/ws/progress")
async def progress_ws(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

