from time import monotonic

from fastapi import Header, HTTPException, Request

from backend.app.core.config import get_settings

# Rate limiting: max requests per window per client IP
_RATE_LIMIT_MAX = 30
_RATE_LIMIT_WINDOW = 60.0  # seconds
_request_timestamps: dict[str, list[float]] = {}
_last_cleanup_at = 0.0
_CLEANUP_INTERVAL = 300.0  # cleanup stale IPs every 5 minutes


async def require_extension_token(
    x_extension_token: str | None = Header(default=None),
) -> None:
    expected = get_settings().extension_token
    if not expected:
        return
    if x_extension_token != expected:
        raise HTTPException(status_code=401, detail="扩展 Token 无效")


def _check_rate_limit(client_ip: str) -> None:
    global _last_cleanup_at
    now = monotonic()

    # Periodic cleanup of stale IP entries to prevent memory leak
    if now - _last_cleanup_at > _CLEANUP_INTERVAL:
        _last_cleanup_at = now
        stale_cutoff = now - _RATE_LIMIT_WINDOW * 2
        stale_ips = [
            ip for ip, ts in _request_timestamps.items()
            if not ts or ts[-1] < stale_cutoff
        ]
        for ip in stale_ips:
            del _request_timestamps[ip]

    timestamps = _request_timestamps.setdefault(client_ip, [])
    # Remove expired entries
    cutoff = now - _RATE_LIMIT_WINDOW
    while timestamps and timestamps[0] < cutoff:
        timestamps.pop(0)
    if len(timestamps) >= _RATE_LIMIT_MAX:
        raise HTTPException(status_code=429, detail="请求过于频繁，请稍后重试")
    timestamps.append(now)


async def require_extension_token_with_rate_limit(request: Request) -> None:
    """Token check + per-IP rate limiting for extension endpoints."""
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(client_ip)
    await require_extension_token(
        x_extension_token=request.headers.get("X-Extension-Token")
    )

