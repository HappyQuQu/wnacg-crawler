from __future__ import annotations

import asyncio
import random
import time
from urllib.parse import urlparse


class DomainRateLimiter:
    def __init__(
        self,
        min_delay: float = 5,
        max_delay: float = 15,
        blocked_cooldown: float = 300,
    ):
        self.min_delay = min_delay
        self.max_delay = max_delay
        self.blocked_cooldown = blocked_cooldown
        self.last_access: dict[str, float] = {}
        self.blocked_until: dict[str, float] = {}

    def domain_of(self, url: str) -> str:
        return urlparse(url).netloc

    async def wait(self, url: str) -> None:
        domain = self.domain_of(url)
        now = time.time()

        blocked_until = self.blocked_until.get(domain, 0)
        if blocked_until > now:
            wait_seconds = blocked_until - now
            await asyncio.sleep(wait_seconds)

        last = self.last_access.get(domain, 0)
        elapsed = now - last

        delay = random.uniform(self.min_delay, self.max_delay)

        if elapsed < delay:
            await asyncio.sleep(delay - elapsed)

        self.last_access[domain] = time.time()

    def mark_blocked(self, url: str) -> None:
        domain = self.domain_of(url)
        self.blocked_until[domain] = time.time() + self.blocked_cooldown
