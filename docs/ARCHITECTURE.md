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
Batch task concurrency: run_many 并发启动
Image download concurrency: configurable by max_thread, default 6
Request interval: shared by downloader, default 1200ms
```

说明：

- 批量加入任务时，后台会并发执行多个漫画任务。
- 单个漫画的 `downloading` 阶段会按 `max_thread` 创建并发 worker。
- 所有 HTTP 请求仍共享 downloader 的请求间隔，避免瞬间打爆站点。
- 目录页抓取和图片详情页解析仍按阶段顺序推进，真实站点验收后再决定是否继续并发化。

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
