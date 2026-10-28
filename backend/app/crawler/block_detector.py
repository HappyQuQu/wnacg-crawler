from __future__ import annotations

from dataclasses import dataclass

from bs4 import BeautifulSoup

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


@dataclass(frozen=True, slots=True)
class BlockResult:
    """Structured classification of a detected block."""

    block_type: str  # cloudflare | rate_limit | access_denied
    message: str  # Human-readable description
    severity: str  # warning | error
    guidance: str  # Actionable advice for the user


_BLOCK_CLASSIFICATIONS: dict[str, BlockResult] = {
    "cloudflare": BlockResult(
        block_type="cloudflare",
        message="触发 Cloudflare 反爬验证，IP 可能被标记",
        severity="error",
        guidance="建议：1）切换到浏览器模式  2）开启或更换代理  3）等待 10-30 分钟后重试",
    ),
    "rate_limit": BlockResult(
        block_type="rate_limit",
        message="请求过于频繁，已被限流（HTTP 429）",
        severity="warning",
        guidance="建议：1）增大请求间隔  2）减少并发线程数  3）稍后重试",
    ),
    "access_denied": BlockResult(
        block_type="access_denied",
        message="访问被拒绝（HTTP 403/503），IP 可能被封禁",
        severity="error",
        guidance="建议：1）开启或更换代理  2）等待 10-30 分钟后重试  3）检查 IP 是否被目标站点封禁",
    ),
}


def is_cloudflare_challenge(html: str | None) -> bool:
    if not html:
        return False
    text = html.lower()
    return any(marker in text for marker in CLOUDFLARE_MARKERS)


def is_blocked(status_code: int | None = None, html: str | None = None) -> bool:
    if status_code in BLOCKED_STATUS_CODES:
        return True
    if not html:
        return False
    # 正常目录页也会引用 slider-captcha.js，脚本和属性不代表拦截页面。
    lowered = BeautifulSoup(html, "lxml").get_text(" ", strip=True).lower()
    blocked_markers = ["403 forbidden", "access denied", "captcha", "验证", "forbidden"]
    if any(marker in lowered for marker in blocked_markers):
        return True
    if is_cloudflare_challenge(html):
        return True
    return False


def classify_block(
    status_code: int | None = None,
    html: str | None = None,
    block_type_hint: str | None = None,
) -> BlockResult:
    """Classify *why* the request was blocked.

    Parameters
    ----------
    status_code:
        The HTTP status code, if available.
    html:
        The response body, if available.
    block_type_hint:
        An explicit hint from the caller (e.g. ``"cloudflare"`` when
        ``BlockedByCloudflareError`` was caught).
    """
    # 1. Caller-provided hint (most reliable)
    if block_type_hint and block_type_hint in _BLOCK_CLASSIFICATIONS:
        return _BLOCK_CLASSIFICATIONS[block_type_hint]

    # 2. Cloudflare challenge (check body first)
    if html and is_cloudflare_challenge(html):
        return _BLOCK_CLASSIFICATIONS["cloudflare"]

    # 3. Rate limiting
    if status_code == 429:
        return _BLOCK_CLASSIFICATIONS["rate_limit"]

    # 4. Everything else is access denied
    return _BLOCK_CLASSIFICATIONS["access_denied"]
