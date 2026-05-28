from __future__ import annotations

CLOUDFLARE_MARKERS = [
    "just a moment",
    "checking your browser",
    "challenges.cloudflare.com",
    "cf-chl",
    "cf_clearance",
    "turnstile",
    "verify you are human",
    "attention required",
]

BLOCKED_STATUS_CODES = {403, 429, 503}


def is_cloudflare_challenge(html: str | None) -> bool:
    if not html:
        return False
    text = html.lower()
    return any(marker in text for marker in CLOUDFLARE_MARKERS)


def is_blocked(status_code: int | None = None, html: str | None = None) -> bool:
    if status_code in BLOCKED_STATUS_CODES:
        return True
    if not html:
        return True
    lowered = html.lower()
    blocked_markers = ["403 forbidden", "access denied", "captcha", "验证", "forbidden"]
    if any(marker in lowered for marker in blocked_markers):
        return True
    if is_cloudflare_challenge(html):
        return True
    return False
