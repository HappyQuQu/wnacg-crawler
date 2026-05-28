# 爬虫项目 Playwright 反 403 逐步改造方案

> 目标：在现有 Docker 爬虫项目中，逐步引入 Playwright，解决 `403 Forbidden`、JS 渲染、登录态、Cookie、Referer、基础反爬等问题。  
> 原则：先最小改造，再逐步增强；不要一开始就重构整个项目。

---

## 阶段 0：先确认 403 类型

### 目标

判断当前 403 是普通请求头问题、登录态问题，还是浏览器验证问题。

### 操作

先保留现有爬虫逻辑，增加一次调试输出：

- 请求 URL
- 状态码
- Response Headers
- Response Body 前 1000 字
- 当前 User-Agent
- Referer
- Cookie 是否存在

### AI 实现要求

在现有请求失败时，输出调试日志。

示例字段：

```txt
url
status_code
request_headers
response_headers
body_preview
```

### 验收标准

当访问失败时，可以看到：

```txt
403 Forbidden
目标站返回内容
是否出现 Cloudflare / challenge / login / forbidden 等关键词
```

---

## 阶段 1：先修复普通 HTTP 请求

### 目标

在不引入 Playwright 的情况下，先尝试解决简单 403。

### 操作

给现有 requests/httpx 请求统一增加浏览器请求头。

### 推荐请求头

```python
DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}
```

如果是详情页，需要增加来源页：

```python
headers["Referer"] = "https://www.wnacg.com/"
```

### AI 实现要求

新增一个统一请求方法，例如：

```python
fetch_url(url: str, referer: str | None = None)
```

所有原来的 `requests.get()` 尽量走这个方法。

### 验收标准

如果普通请求已经可以访问，先不要引入 Playwright。

---

## 阶段 2：引入 Playwright 作为兜底

### 目标

只有当普通 HTTP 请求失败时，才调用 Playwright。

### 改造原则

不要把所有页面都改成 Playwright。

推荐流程：

```txt
普通 HTTP 请求
    ↓
成功：直接解析
    ↓
失败：403 / JS Challenge / 空页面
    ↓
Playwright 兜底访问
```

### 需要新增文件

建议新增：

```txt
app/browser/
├── __init__.py
├── playwright_client.py
└── browser_fetcher.py
```

### AI 实现要求

新增方法：

```python
fetch_with_browser(url: str, referer: str | None = None) -> str
```

返回页面 HTML。

### Playwright 示例

```python
from playwright.async_api import async_playwright

async def fetch_with_browser(url: str, referer: str | None = None) -> str:
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-blink-features=AutomationControlled",
            ],
        )

        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/125.0.0.0 Safari/537.36"
            ),
            locale="zh-CN",
            extra_http_headers={
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            },
        )

        page = await context.new_page()

        if referer:
            await page.goto(referer, wait_until="domcontentloaded", timeout=30000)

        await page.goto(url, wait_until="networkidle", timeout=60000)

        html = await page.content()

        await browser.close()
        return html
```

### 验收标准

当普通请求返回 403 时，系统会自动用 Playwright 再访问一次。

---

## 阶段 3：Docker 支持 Playwright

### 目标

让现有 Docker 镜像可以运行 Chromium。

### 方案 A：使用官方 Playwright 镜像

推荐。

```dockerfile
FROM mcr.microsoft.com/playwright/python:v1.44.0-jammy

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "-m", "app.main"]
```

### requirements.txt 增加

```txt
playwright
```

### docker-compose.yml 推荐配置

```yaml
services:
  crawler:
    build: .
    shm_size: "2gb"
    environment:
      - PYTHONUNBUFFERED=1
```

### 验收标准

容器内执行：

```bash
python -c "from playwright.sync_api import sync_playwright; print('ok')"
```

能正常输出：

```txt
ok
```

---

## 阶段 4：封装统一抓取入口

### 目标

业务代码不关心底层是 HTTP 请求还是 Playwright。

### 推荐新增方法

```python
async def smart_fetch(url: str, referer: str | None = None) -> str:
    html = await fetch_with_http(url, referer=referer)

    if is_blocked(html):
        html = await fetch_with_browser(url, referer=referer)

    return html
```

### 判断是否被拦截

新增：

```python
def is_blocked(status_code: int | None = None, html: str | None = None) -> bool:
    if status_code in [403, 429, 503]:
        return True

    if not html:
        return True

    keywords = [
        "403 Forbidden",
        "Just a moment",
        "Checking your browser",
        "Cloudflare",
        "Access denied",
        "captcha",
        "验证",
    ]

    return any(k.lower() in html.lower() for k in keywords)
```

### AI 实现要求

把原来业务中的：

```python
requests.get(url)
```

逐步替换为：

```python
await smart_fetch(url, referer=referer)
```

### 验收标准

业务层代码不直接依赖 Playwright。

---

## 阶段 5：登录态 / Cookie 持久化

### 目标

解决需要登录、Cookie、年龄确认、站点偏好等问题。

### 新增目录

```txt
storage/
├── browser_state/
│   └── wnacg_state.json
```

### 首次登录脚本

新增：

```txt
scripts/login_save_state.py
```

示例：

```python
from playwright.sync_api import sync_playwright

STATE_PATH = "storage/browser_state/wnacg_state.json"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    context = browser.new_context()
    page = context.new_page()

    page.goto("https://www.wnacg.com/")

    print("请在打开的浏览器中手动登录，登录完成后回到终端按 Enter")
    input()

    context.storage_state(path=STATE_PATH)

    browser.close()
```

### 后续使用登录态

```python
context = await browser.new_context(
    storage_state="storage/browser_state/wnacg_state.json"
)
```

### 验收标准

首次手动登录一次后，后续 Docker 爬虫可以复用登录态。

---

## 阶段 6：浏览器实例复用

### 目标

避免每个请求都启动一个 Chromium。

### 当前问题

下面这种方式性能很差：

```txt
请求一次 -> 启动浏览器 -> 抓取 -> 关闭浏览器
```

### 推荐方式

```txt
启动服务时创建 Browser
每次请求创建 Context/Page
请求结束关闭 Page/Context
服务结束关闭 Browser
```

### AI 实现要求

新增 BrowserManager：

```python
class BrowserManager:
    async def start(self):
        ...

    async def fetch(self, url: str, referer: str | None = None) -> str:
        ...

    async def close(self):
        ...
```

### 验收标准

连续抓取多个页面时，不会反复启动 Chromium 进程。

---

## 阶段 7：加入限速与重试

### 目标

降低被封风险。

### 推荐策略

每个域名：

```txt
并发：1~3
间隔：2~5 秒随机
失败重试：最多 2 次
403 后降速
```

### AI 实现要求

新增：

```python
async def polite_delay(domain: str):
    ...
```

以及重试逻辑：

```python
for attempt in range(3):
    try:
        html = await smart_fetch(url)
        if not is_blocked(html=html):
            return html
    except Exception:
        ...
```

### 验收标准

日志里能看到：

```txt
retry attempt
delay seconds
blocked detected
```

---

## 阶段 8：加入 Playwright Stealth

### 目标

当普通 Playwright 仍然 403 时，再引入 stealth。

### 安装

```bash
pip install playwright-stealth
```

### 示例

```python
from playwright_stealth import stealth_async

page = await context.new_page()
await stealth_async(page)
```

### 使用原则

不要一开始就启用。

建议配置开关：

```env
ENABLE_STEALTH=false
```

代码中：

```python
if settings.ENABLE_STEALTH:
    await stealth_async(page)
```

### 验收标准

开启 stealth 后，原本被拦截的页面成功率提高。

---

## 阶段 9：保存调试证据

### 目标

方便 AI 和人工排查为什么失败。

### 失败时保存

```txt
storage/debug/
├── failed_xxx.html
├── failed_xxx.png
└── failed_xxx.json
```

### AI 实现要求

当出现 403、超时、空页面时，保存：

- HTML
- 截图
- URL
- headers
- status
- 时间
- 错误原因

### Playwright 截图

```python
await page.screenshot(path="storage/debug/failed.png", full_page=True)
```

### 验收标准

每次失败都能留下可分析文件。

---

## 阶段 10：FlareSolverr 作为可选备用

### 目标

保留 FlareSolverr 兼容能力，但不作为主方案。

### 使用场景

只有当：

```txt
HTTP 请求失败
Playwright 失败
Playwright Stealth 失败
```

再尝试 FlareSolverr。

### docker-compose 可选服务

```yaml
services:
  flaresolverr:
    image: ghcr.io/flaresolverr/flaresolverr:latest
    ports:
      - "8191:8191"
```

### 调用示例

```python
import requests

def fetch_with_flaresolverr(url: str) -> str:
    resp = requests.post(
        "http://flaresolverr:8191/v1",
        json={
            "cmd": "request.get",
            "url": url,
            "maxTimeout": 60000,
        },
        timeout=90,
    )

    data = resp.json()
    return data["solution"]["response"]
```

### 推荐调用顺序

```txt
HTTP
 ↓
Playwright
 ↓
Playwright Stealth
 ↓
FlareSolverr
```

### 验收标准

FlareSolverr 不影响主流程，只作为备用方案。

---

## 阶段 11：配置化

### 目标

不要把策略写死在代码里。

### .env 示例

```env
FETCH_MODE=auto
ENABLE_BROWSER=true
ENABLE_STEALTH=false
ENABLE_FLARESOLVERR=false
FLARESOLVERR_URL=http://flaresolverr:8191/v1

CRAWLER_MIN_DELAY=2
CRAWLER_MAX_DELAY=5
CRAWLER_MAX_RETRY=2

BROWSER_HEADLESS=true
BROWSER_STATE_PATH=storage/browser_state/wnacg_state.json
DEBUG_SAVE_ON_FAIL=true
```

### Fetch Mode 说明

```txt
http       只用普通请求
browser    只用 Playwright
auto       HTTP 失败后自动浏览器兜底
full       HTTP + Playwright + Stealth + FlareSolverr
```

### 验收标准

无需改代码，通过环境变量控制抓取策略。

---

## 阶段 12：最终项目结构建议

```txt
project/
├── app/
│   ├── main.py
│   ├── config.py
│   ├── fetcher/
│   │   ├── __init__.py
│   │   ├── http_fetcher.py
│   │   ├── browser_fetcher.py
│   │   ├── flaresolverr_fetcher.py
│   │   ├── smart_fetcher.py
│   │   └── block_detector.py
│   ├── parser/
│   └── tasks/
├── scripts/
│   └── login_save_state.py
├── storage/
│   ├── browser_state/
│   └── debug/
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── .env
└── README.md
```

---

# AI 执行顺序

请严格按下面顺序实现，不要跳步。

## Step 1

增加 HTTP 请求调试日志。

## Step 2

增加统一 HTTP Fetcher，补全 User-Agent、Accept、Accept-Language、Referer。

## Step 3

增加 `is_blocked()` 判断函数。

## Step 4

增加 Playwright Browser Fetcher。

## Step 5

增加 `smart_fetch()`，实现 HTTP 失败后 Playwright 兜底。

## Step 6

修改 Dockerfile，改用 Playwright 官方镜像或安装 Chromium 依赖。

## Step 7

增加登录态保存脚本。

## Step 8

增加 BrowserManager，复用浏览器实例。

## Step 9

增加限速、重试、失败降速。

## Step 10

增加失败 HTML / Screenshot / JSON 保存。

## Step 11

增加 stealth 开关，但默认关闭。

## Step 12

增加 FlareSolverr 可选兜底，但默认关闭。

---

# 最终验收标准

完成后项目应满足：

- 普通页面使用 HTTP 抓取
- 403 页面自动切换 Playwright
- 支持登录态复用
- 支持 Docker 运行 Chromium
- 支持限速和重试
- 失败时自动保存调试文件
- stealth 和 FlareSolverr 都是可配置开关
- 原业务解析代码尽量少改
- 所有抓取入口统一走 `smart_fetch()`

---

# 推荐默认策略

```txt
FETCH_MODE=auto
ENABLE_BROWSER=true
ENABLE_STEALTH=false
ENABLE_FLARESOLVERR=false
```

也就是：

```txt
先 HTTP
失败再 Playwright
不要一开始就开 stealth
不要一开始就开 FlareSolverr
```

---

# 注意事项

1. 不要高并发访问目标站。
2. 不要无限重试。
3. 不要每个请求都新开浏览器。
4. 不要把 Cookie 写死在代码里。
5. 不要把 stealth 和 FlareSolverr 当万能药。
6. 优先解决登录态、Referer、User-Agent、限速问题。
7. Docker 中必须配置 `shm_size: "2gb"`，否则 Chromium 容易崩。
8. 如果目标站强依赖登录，请先完成阶段 5。
