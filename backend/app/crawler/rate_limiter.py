import asyncio
from time import monotonic


class RateLimiter:
    def __init__(self, delay_ms: int) -> None:
        self.delay = delay_ms / 1000
        self._lock = asyncio.Lock()
        self._last = 0.0

    async def wait(self) -> None:
        if self.delay <= 0:
            return
        async with self._lock:
            elapsed = monotonic() - self._last
            remaining = self.delay - elapsed
            if remaining > 0:
                await asyncio.sleep(remaining)
            self._last = monotonic()

