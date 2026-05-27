from fastapi import Header, HTTPException

from backend.app.core.config import get_settings


async def require_extension_token(
    x_extension_token: str | None = Header(default=None),
) -> None:
    expected = get_settings().extension_token
    if not expected:
        return
    if x_extension_token != expected:
        raise HTTPException(status_code=401, detail="扩展 Token 无效")

