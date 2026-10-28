# 技术架构文档

版本：v0.1  
日期：2026-05-26

## 1. 架构目标

1. 后台管理、浏览器扩展、CLI/File Watch 共享同一套下载核心。
2. 下载任务状态持久化，服务重启后可恢复。
3. 下载核心与 UI、API 解耦。
4. 扩展只通过 HTTP API 与后台通信。
5. 文件操作和数据库操作尽量幂等。

## 2. 总体架构

```text
Browser Extension
        |
        | HTTP + Token
        v
FastAPI Backend  <---- Web Admin UI
        |
        +-- Task Service
        +-- Manga Service
        +-- Download Service
        +-- Verify Service
        +-- Zip Service
        |
        +-- SQLite
        +-- File System
```

## 3. 模块职责

### 3.1 Web Admin UI

职责：

- 任务输入
- 预检结果展示
- 下载队列展示
- 资料库展示
- 设置管理
- WebSocket 实时进度

不负责：

- 直接解析远端 HTML
- 直接下载图片
- 直接写本地文件

### 3.2 Browser Extension

职责：

- 页面 ID 识别
- 列表页批量识别
- 查询后台连接状态
- 提交任务到后台
- 打开后台管理

不负责：

- 下载
- ZIP
- 数据库写入
- 文件校验

### 3.3 FastAPI Backend

职责：

- HTTP API
- WebSocket 推送
- 任务调度
- 下载执行
- 数据持久化
- 配置热重载
- 扩展 Token 校验

### 3.4 Task Service

职责：

- 创建任务
- 去重
- 状态流转
- 暂停/继续/取消
- 失败重试
- 广播进度

### 3.5 Manga Service

职责：

- 获取元信息
- 获取目录页
- 解析图片详情页
- 维护 MangaInfo、MangaPage、MangaPicPage

### 3.6 Download Service

职责：

- 下载图片文件
- 并发控制
- 请求间隔控制
- 重试和退避
- 文件写入

### 3.7 Verify Service

职责：

- 检查文件是否存在
- 检查文件大小
- 检查图片格式
- 计算任务完整度
- 标记缺失和无效文件

### 3.8 Zip Service

职责：

- ZIP 前校验
- 生成 ZIP
- 覆盖策略
- ZIP 状态记录

## 4. 推荐后端目录

```text
backend/
  main.py
  config.py
  api/
    inputs_router.py
    tasks_router.py
    library_router.py
    extension_router.py
    config_router.py
    ws_router.py
  core/
    errors.py
    schemas.py
    paths.py
    security.py
  crawler/
    downloader.py
    parser.py
    rate_limiter.py
  db/
    database.py
    models.py
    repository.py
    migrations/
  service/
    input_service.py
    task_service.py
    manga_service.py
    download_service.py
    verify_service.py
    zip_service.py
```

## 5. 请求生命周期

### 5.1 添加任务

```text
UI/Extension
  -> POST /api/inputs/parse
  -> InputService.parse()
  -> Repository 查询本地状态
  -> 返回预检列表
  -> POST /api/tasks/batch
  -> TaskService.create_batch()
  -> Download worker 执行
```

### 5.2 下载任务

```text
TaskService
  -> MangaService.fetch_info()
  -> MangaService.fetch_pages()
  -> MangaService.resolve_images()
  -> DownloadService.download_images()
  -> VerifyService.verify_manga()
  -> ZipService.create_zip()
  -> TaskService.mark_completed()
```

## 6. 并发模型

当前实现：

```text
Batch task concurrency: max_active_tasks, default 2 (applied at service startup)
Image download concurrency: max_thread shared across tasks, default 6
Request interval: per host, default 1200ms; HTML also uses crawler_min/max_delay
```

说明：

- 批量、单任务、恢复及问题图片重试共用漫画任务槽位，默认同时处理两本；其余任务保持持久化的 queued 状态。
- 目录完整后先建立图片页清单，worker 按需解析地址并立即下载，无需等待整本详情页全部解析完。
- 重试复用已保存的元信息、目录页、相同图片页的已解析地址和有效文件；地址失效时沿用详情页刷新机制。
- `max_thread` 同时约束单本 worker 和所有任务的图片传输总并发，热重载后新传输读取当前上限。
- HTTP 请求按主机名分别执行 `request_delay_ms` 限速；同一主机上的页面和图片仍共用间隔，HTML 另保留随机延迟及拦截冷却。
- `max_active_tasks` 在启动时建立槽位，修改后需重启服务。

合集入口通过 `#sr_pub` 的章节总数和每页数量识别，按合集分页抓全章节并校验话序、数量和唯一性。章节图片列表取自阅读器公开的 `photos-item-aid-{章节ID}.html`，只解码其中 `page_url` 数组，不执行 JavaScript；兼容站点数组末尾逗号。每章图片数必须与目录声明一致。

合集继续使用一个原始任务与一个 ZIP。目录页和章节图片列表按顺序持久化到 `manga_page`，再按章节顺序建立统一的图片索引；文件名保留章节 ID 与章内图序，避免覆盖。阅读器来源使用 `#image-N` 记录章内图序，图片地址失效时重新获取相同章节列表并按序刷新。缓存复用、限速、图片处理、完整性校验及打包沿用现有流程；未抓全章节或图片列表时不得完成。

## 7. 状态广播

WebSocket 消息来自 TaskService，不由下载函数直接拼 UI 状态。

推荐消息：

```json
{
  "type": "task_progress",
  "task_id": "uuid",
  "manga_id": "123456",
  "status": "running",
  "stage": "downloading",
  "current": 12,
  "total": 40
}
```

## 8. 安全边界

### 8.1 监听地址

默认只监听：

```text
127.0.0.1
```

如果用户主动开启局域网访问，必须在设置中明确提示风险。

### 8.2 扩展 Token

扩展 API 必须校验：

```text
X-Extension-Token
```

后台管理页面可以走同源 Cookie 或不需要 Token，但扩展接口必须保护。

### 8.3 URL 白名单

只允许解析和代理白名单域名：

```text
www.wnacg.com
wnacg.com
www.wnacg.org
wnacg.org
```

### 8.4 文件路径

所有文件名必须经过清洗。禁止用户输入直接拼接为路径。

## 9. 错误处理

错误对象应包含：

```text
code
message
stage
retryable
detail
```

示例：

```json
{
  "code": "IMAGE_DOWNLOAD_FAILED",
  "message": "图片下载失败",
  "stage": "downloading",
  "retryable": true,
  "detail": "HTTP 429"
}
```

## 10. 配置热重载

配置保存流程：

```text
validate incoming config
  -> write temp file
  -> reload config object
  -> rebuild downloader
  -> replace config file
  -> broadcast config updated
```

失败时：

```text
保留旧配置
返回错误
记录日志
```

## 11. 迁移策略

如果要兼容旧命令行数据库，推荐做迁移脚本：

```text
old MangaInfo -> new manga_info
old MangaPage -> new manga_page
old MangaPicPage -> new manga_pic_page
derive DownloadFile from existing files
derive DownloadTask from manga status
```

MVP 可以不自动迁移，但必须避免破坏旧数据。
