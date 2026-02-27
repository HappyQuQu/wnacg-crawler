import re
from urllib.parse import quote, urljoin, urlparse

import httpx
from bs4 import BeautifulSoup, Tag
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, Response
from loguru import logger

from backend.config import get_config
from backend.crawler.downloader import downloader

router = APIRouter()

# 允许代理的域名白名单
_ALLOWED_HOSTS = {"www.wnacg.com", "wnacg.com", "www.wnacg.org", "wnacg.org"}

# 静态资源扩展名：走 /proxy-resource
_STATIC_EXTS = {".css", ".js", ".ico", ".woff", ".woff2", ".ttf", ".eot", ".svg"}

# 完整浏览器请求头（绕过反爬检测）
_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,image/apng,*/*;q=0.8"
    ),
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Sec-Ch-Ua": '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"macOS"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
}


# ── 工具函数 ─────────────────────────────────────────────────────────────

def _is_allowed(url: str) -> bool:
    try:
        host = urlparse(url).hostname or ""
        return host in _ALLOWED_HOSTS
    except Exception:
        return False


def _abs_url(url: str, base: str) -> str:
    """处理协议相对 URL（//cdn.example.com/...）"""
    if url.startswith("//"):
        scheme = urlparse(base).scheme or "https"
        return f"{scheme}:{url}"
    return urljoin(base, url)


def _is_static(url: str) -> bool:
    """判断是否为静态资源（CSS/JS/字体等）"""
    path = urlparse(url).path.lower()
    return any(path.endswith(ext) for ext in _STATIC_EXTS)


def _rewrite_href(tag: Tag, base: str) -> None:
    """
    重写 href 属性：
    - <link rel="stylesheet"> 或静态扩展名 → /proxy-resource（保持样式）
    - <a href> 页面跳转 → /proxy
    """
    href = str(tag.get("href", ""))
    if not href or href.startswith("#") or href.startswith("javascript"):
        return
    absolute = _abs_url(href, base)
    if not _is_allowed(absolute):
        return
    if tag.name == "link" or _is_static(absolute):
        tag["href"] = f"/proxy-resource?url={quote(absolute, safe='')}"
    else:
        tag["href"] = f"/proxy?url={quote(absolute, safe='')}"


def _extract_manga_id(url: str) -> str:
    m = re.search(r"aid-(\d+)", url)
    return m.group(1) if m else ""


def _is_manga_detail_page(url: str) -> bool:
    return bool(re.search(r"/photos-index-page-\d+-aid-\d+", url))


# ── 注入下载按钮 ──────────────────────────────────────────────────────────

def _inject_detail_button(soup: BeautifulSoup, manga_id: str):
    """漫画详情页：底部悬浮「加入下载」按钮"""
    btn_html = f"""
<div id="wnacg-dl-bar" style="
    position:fixed;bottom:24px;right:24px;z-index:99999;
    background:#1a1a2e;border:1px solid #e94560;border-radius:12px;
    padding:12px 20px;display:flex;align-items:center;gap:12px;
    box-shadow:0 4px 24px rgba(233,69,96,0.3);font-family:sans-serif;">
  <span style="color:#fff;font-size:14px;">ID: <b>{manga_id}</b></span>
  <button onclick="window.parent.postMessage({{type:'ADD_DOWNLOAD',manga_id:'{manga_id}'}},'*')"
    style="background:#e94560;color:#fff;border:none;border-radius:8px;
    padding:8px 16px;cursor:pointer;font-size:14px;font-weight:bold;">
    ＋ 加入下载
  </button>
</div>
"""
    if soup.body:
        soup.body.append(BeautifulSoup(btn_html, "html.parser"))


def _inject_list_buttons(soup: BeautifulSoup):
    """
    列表页：在每个漫画缩略图角落注入「＋」快速下载按钮。
    wnacg 列表项结构：<li class="li tb gallary_item">
    """
    for li in soup.find_all("li", class_=lambda c: c and "gallary_item" in c):
        # 从详情链接中提取 manga_id
        a_tag = li.find("a", href=re.compile(r"aid-\d+"))
        if not a_tag:
            continue
        manga_id = _extract_manga_id(str(a_tag.get("href", "")))
        if not manga_id:
            continue

        # 找缩略图容器，设相对定位
        thumb = li.find("div", class_=lambda c: c and "thumb" in c) or li
        existing_style = str(thumb.get("style", ""))
        thumb["style"] = existing_style + ";position:relative;overflow:hidden;"

        btn = f"""<button
    onclick="event.preventDefault();event.stopPropagation();window.parent.postMessage({{type:'ADD_DOWNLOAD',manga_id:'{manga_id}'}},'*')"
    title="加入下载队列"
    style="position:absolute;top:4px;right:4px;z-index:9999;
           background:rgba(233,69,96,0.92);color:#fff;border:none;
           border-radius:6px;padding:3px 8px;font-size:13px;font-weight:bold;
           cursor:pointer;line-height:1.5;">＋</button>"""
        thumb.append(BeautifulSoup(btn, "html.parser"))


# ── HTTP 请求 ─────────────────────────────────────────────────────────────

async def _fetch(url: str, client_cookies: dict | None = None) -> httpx.Response:
    """带完整浏览器头 + Cookie 透传的请求"""
    assert downloader._client, "Downloader 未初始化"
    headers = dict(_BROWSER_HEADERS)
    if client_cookies:
        headers["Cookie"] = "; ".join(f"{k}={v}" for k, v in client_cookies.items())
    resp = await downloader._client.get(url, headers=headers)
    resp.raise_for_status()
    return resp


# ── 路由 ──────────────────────────────────────────────────────────────────

@router.get("/proxy", summary="反向代理 wnacg 页面")
async def proxy(url: str, request: Request):
    if not url or url in ("home", "/", ""):
        config = get_config()
        url = config.manga_main_url

    if not _is_allowed(url):
        raise HTTPException(403, f"不允许代理该域名: {url}")

    client_cookies = dict(request.cookies)

    try:
        resp = await _fetch(url, client_cookies)
        html = resp.text
    except httpx.HTTPStatusError as e:
        logger.error("代理请求失败 {}: {} {}", url, e.response.status_code, e)
        raise HTTPException(502, f"获取页面失败: {e}")
    except Exception as e:
        logger.error("代理请求异常 {}: {}", url, repr(e))
        raise HTTPException(502, f"获取页面失败: {type(e).__name__}: {e}")

    try:
        soup = BeautifulSoup(html, "lxml")
    except Exception:
        soup = BeautifulSoup(html, "html.parser")

    base = url

    # 重写 href（区分 a 标签和 link 标签）
    for tag in soup.find_all(href=True):
        _rewrite_href(tag, base)

    # 重写 src
    for tag in soup.find_all(src=True):
        abs_src = _abs_url(str(tag["src"]), base)
        if _is_allowed(abs_src):
            tag["src"] = f"/proxy-resource?url={quote(abs_src, safe='')}"

    # 重写 srcset（响应式图片）
    for tag in soup.find_all(srcset=True):
        parts = []
        for part in str(tag["srcset"]).split(","):
            part = part.strip()
            if not part:
                continue
            segments = part.split()
            abs_src = _abs_url(segments[0], base)
            if _is_allowed(abs_src):
                segments[0] = f"/proxy-resource?url={quote(abs_src, safe='')}"
            parts.append(" ".join(segments))
        tag["srcset"] = ", ".join(parts)

    # 注入下载按钮
    if _is_manga_detail_page(url):
        manga_id = _extract_manga_id(url)
        if manga_id:
            _inject_detail_button(soup, manga_id)

    # 所有页面的列表项都注入快捷「+」按钮
    _inject_list_buttons(soup)

    return HTMLResponse(content=str(soup), status_code=200)


@router.get("/proxy-resource", summary="代理静态资源（图片/CSS/JS）")
async def proxy_resource(url: str, request: Request):
    if not _is_allowed(url):
        raise HTTPException(403, "不允许代理该资源")
    try:
        client_cookies = dict(request.cookies)
        headers = dict(_BROWSER_HEADERS)
        headers["Sec-Fetch-Dest"] = "no-dest"
        headers["Sec-Fetch-Mode"] = "no-cors"
        headers["Sec-Fetch-Site"] = "cross-site"
        headers["Referer"] = "https://www.wnacg.com/"
        if client_cookies:
            headers["Cookie"] = "; ".join(f"{k}={v}" for k, v in client_cookies.items())

        assert downloader._client
        resp = await downloader._client.get(url, headers=headers)
        resp.raise_for_status()

        content_type = resp.headers.get("content-type", "application/octet-stream")
        media_type = content_type.split(";")[0].strip()

        content = resp.content

        # CSS 文件：重写 url() 内的相对路径为绝对代理路径
        if "css" in media_type or url.split("?")[0].endswith(".css"):
            try:
                css_text = resp.text
                base = url

                def _rewrite_css_url(m: re.Match) -> str:
                    raw = m.group(1).strip("'\"")
                    if raw.startswith("data:") or raw.startswith("http"):
                        return m.group(0)
                    abs_url = _abs_url(raw, base)
                    if _is_allowed(abs_url):
                        return f"url('/proxy-resource?url={quote(abs_url, safe='')}')"
                    return m.group(0)

                rewritten = re.sub(r"url\(([^)]+)\)", _rewrite_css_url, css_text)
                content = rewritten.encode("utf-8")
                media_type = "text/css"
            except Exception:
                pass  # 解析失败退回原始内容

        return Response(
            content=content,
            media_type=media_type,
            headers={"Cache-Control": "public, max-age=86400"},
        )
    except Exception as e:
        raise HTTPException(502, f"获取资源失败: {e}")

