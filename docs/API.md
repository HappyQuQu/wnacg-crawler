# API 契约文档

版本：v0.1  
日期：2026-05-26

## 1. 通用约定

Base URL：

```text
http://127.0.0.1:8080
```

响应格式：

```json
{
  "ok": true,
  "data": {},
  "error": null
}
```

错误格式：

```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "输入不合法",
    "detail": {}
  }
}
```

## 2. 输入解析

### POST /api/inputs/parse

解析 ID/URL，返回预检列表。

Request：

```json
{
  "text": "123456\nhttps://www.wnacg.com/photos-index-page-1-aid-298731.html",
  "source": "manual"
}
```

Response：

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "raw": "123456",
        "manga_id": "123456",
        "url": "https://www.wnacg.com/photos-index-page-1-aid-123456.html",
        "valid": true,
        "status": "ready",
        "title": "夏日补档合集",
        "cover_url": "",
        "page_count": 4,
        "pic_count": 42,
        "local": {
          "exists": false,
          "completed": false,
          "valid_files": 0,
          "total_files": 42
        }
      }
    ],
    "summary": {
      "total": 2,
      "valid": 2,
      "duplicate": 0,
      "invalid": 0
    }
  },
  "error": null
}
```

Item status：

```text
ready
exists
partial
running
invalid
failed
```

## 3. 任务

### POST /api/tasks

创建单个任务。

Request：

```json
{
  "manga_id": "123456",
  "mode": "download",
  "source": "manual",
  "start_immediately": true
}
```

Response：

```json
{
  "ok": true,
  "data": {
    "task_id": "task_01",
    "manga_id": "123456",
    "status": "queued"
  },
  "error": null
}
```

### POST /api/tasks/batch

批量创建任务。

Request：

```json
{
  "items": [
    { "manga_id": "123456" },
    { "manga_id": "298731" }
  ],
  "mode": "download",
  "source": "batch_text",
  "dedupe": true,
  "start_immediately": true
}
```

Response：

```json
{
  "ok": true,
  "data": {
    "created": [
      { "task_id": "task_01", "manga_id": "123456", "status": "queued" }
    ],
    "skipped": [
      { "manga_id": "298731", "reason": "already_running" }
    ]
  },
  "error": null
}
```

### GET /api/tasks

查询任务列表。

Query：

```text
status=running
page=1
page_size=50
```

Response：

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "task_id": "task_01",
        "manga_id": "123456",
        "title": "夏日补档合集",
        "status": "running",
        "stage": "downloading",
        "progress_current": 24,
        "progress_total": 42,
        "last_error": null,
        "created_at": "2026-05-26T21:00:00+08:00"
      }
    ],
    "total": 1
  },
  "error": null
}
```

### GET /api/tasks/{task_id}

查询任务详情。

Response data：

```json
{
  "task": {},
  "manga": {},
  "pages": [],
  "pic_pages": [],
  "files": [],
  "errors": []
}
```

### DELETE /api/tasks/completed

清除全部 `completed` 任务记录，返回 `{"deleted": 10, "task_ids": ["task_01"]}`。
保留资料库元信息、下载文件、ZIP 和日志；重复清理返回 `deleted: 0`。

### DELETE /api/tasks/{task_id}

仅清除指定的已完成任务。不存在返回 404，非 `completed` 返回 409。
清除后扩展仍可从资料库识别作品的本地状态。

### POST /api/tasks/{task_id}/pause

暂停任务。

允许状态：

```text
queued
running
```

### POST /api/tasks/{task_id}/resume

继续任务。

允许状态：

```text
pending
paused
```

### POST /api/tasks/{task_id}/retry

重试任务。

Request：

```json
{
  "scope": "failed_images"
}
```

scope：

```text
task
info
pages
image_urls
failed_images
zip
verify
```

允许状态：

```text
failed
partial
completed
cancelled
```

### POST /api/tasks/{task_id}/cancel

取消任务。

允许状态：

```text
pending
queued
running
paused
```

非法状态流转返回 `409 Conflict`。

## 4. 资料库

### GET /api/library

查询本地资料库。

Query：

```text
q=关键词
status=partial
page=1
page_size=50
```

Response：

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "manga_id": "123456",
        "title": "夏日补档合集",
        "cover_url": "",
        "status": "completed",
        "pic_count": 42,
        "valid_file_count": 42,
        "zip_status": "created",
        "manga_dir": "/data/Manga/[123456] title",
        "zip_path": "/data/Zip/[123456] title.zip"
      }
    ],
    "total": 1
  },
  "error": null
}
```

### GET /api/library/{manga_id}

查询单个资料库项目，返回汇总字段和文件级明细。

Response data：

```json
{
  "manga_id": "123456",
  "title": "夏日补档合集",
  "status": "partial",
  "total_files": 42,
  "valid_files": 40,
  "failed_files": 1,
  "missing_files": 1,
  "completeness": 0.9524,
  "download_dir": "data/Manga/[123456] 夏日补档合集",
  "zip_path": "data/Zip/[123456] 夏日补档合集.zip",
  "zip_exists": false,
  "files": [
    {
      "pic_index": 1,
      "pic_num": "001",
      "pic_url": "https://example.test/001.jpg",
      "page_url": "https://example.test/page.html",
      "file_path": "data/Manga/[123456] title/0001_001.jpg",
      "file_name": "0001_001.jpg",
      "file_size": 16387,
      "exists": true,
      "status": "valid",
      "error_message": "",
      "updated_at": "2026-05-27T10:00:00"
    }
  ]
}
```

文件状态：

```text
valid
missing
invalid
failed
```

### POST /api/library/delete

请求 `{"manga_ids": ["123456", "123457"], "delete_files": false}`。
`manga_ids` 为 1–1000 个数字 ID，自动去重；返回 `deleted` ID 列表和逐项 `failed`（包含 `manga_id`、`error`）。

- 默认只删除资料库记录、目录/图片详情记录、文件索引和关联的已结束任务，保留本地文件及日志。
- `delete_files: true` 同时删除下载根目录中 Manga、Original、Zip 下属于这些 ID 的文件和目录，包括旧标题目录。界面必须二次确认，文件删除选项默认不勾选。
- 有 pending/queued/running/paused 任务或执行器尚未退出的作品会跳过。符号链接和越出下载目录的路径会被拒绝。
- 文件删除失败时保留数据库记录并报告原因；同一批其他作品继续处理。

### DELETE /api/library/{manga_id}?delete_files=false

单项删除，语义同批量删除。不存在返回 404，有活跃任务或文件系统操作受阻返回 409。

### POST /api/library/downloads

请求 `{"manga_ids": ["123456", "123457"]}`，准备所选作品的独立文件下载。

Response data：

```json
{
  "ready": [
    {"manga_id": "123456", "filename": "作品.zip", "url": "/api/library/123456/download"}
  ],
  "failed": [{"manga_id": "123457", "error": "图片缺失或校验失败，请先在后台补全后再下载"}]
}
```

下载文件名使用作品标题（例如 `作品.zip`），不附加存储用的 `[漫画 ID]` 前缀；标题中的作者、翻译等方括号标签保留。后台文件仍按带 ID 的路径保存，避免同名作品覆盖。

每个作品各一个 ZIP，不合成总包。浏览器逐个请求 `ready` 中的地址，勾选十项可发起十个独立文件下载；界面保留逐项下载链接，以便浏览器拦截连续下载时手动重试。

### GET /api/library/{manga_id}/download

返回 `application/zip` 文件响应及附件文件名，不使用 JSON 响应包装。附件文件名与批量准备结果一致，使用标题而不带存储 ID 前缀。仅读取已下载的本地图片；图片完整有效时复用校验通过的 ZIP，缺失或损坏的 ZIP 会从本地文件重建。不会请求原站或创建下载任务，也不会因导出而改写任务完成状态。
不存在返回 404，存在活跃任务、图片缺失/无效或路径不安全时返回 409。

### POST /api/library/{manga_id}/verify

重新校验文件完整性。

### POST /api/library/{manga_id}/zip

重新打包。

Request：

```json
{
  "overwrite": true
}
```

### POST /api/library/{manga_id}/retry-failed

创建后台修复任务，只重试资料库详情中非 `valid` 的图片文件。

行为：

- 先执行一次文件校验，刷新 `missing/invalid/failed` 状态。
- 如果没有问题文件，返回 `no_problem_files`，不创建任务。
- 如果当前漫画已有活跃任务，返回 `already_active`，不重复创建。
- 否则创建 `source=library_retry_failed` 的 queued 任务，由后台只下载问题图片。
- 如果 `pic_url` 为空或旧地址下载失败，后台会重新请求图片详情页并解析 `span#imgarea img[src]` 后再下载。

Response data：

```json
{
  "status": "queued",
  "problem_files": 2,
  "task": {
    "task_id": "task_01",
    "manga_id": "123456",
    "source": "library_retry_failed",
    "status": "queued",
    "stage": "retrying_failed_images"
  },
  "library": {
    "manga_id": "123456",
    "status": "partial",
    "files": []
  }
}
```

任务完成后的 `last_error` 会带上修复摘要，例如：

```text
retry_failed_images:fixed=2;failed=0;processed=2;re_resolved=1
```

## 5. 配置

### GET /api/config

获取配置。

### POST /api/config

保存配置，只更新提交的字段，并保留其他已有配置；嵌套代理设置也支持逐字段更新。
系统环境变量和 `.env` 的优先级高于 JSON。响应中的 `overridden_fields` 列出
被环境配置覆盖的提交字段，返回的配置值始终是实际生效值。

Request：

```json
{
  "theme": "system",
  "download_path": "/data",
  "is_zip": true,
  "enable_image_compression": false,
  "image_max_size_kb": 1024,
  "keep_original_images": true,
  "allow_image_resize": false,
  "max_thread": 6,
  "re_count": 5,
  "request_delay_ms": 1200,
  "timeout_seconds": 30,
  "extension_token": "",
  "proxy": {
    "is_proxy": false,
    "address": "127.0.0.1",
    "port": 7890,
    "username": "",
    "password": ""
  }
}
```

`theme` 控制后台界面外观，可选 `light`、`dark`、`system`，默认 `system`（跟随系统），由 GET 返回并支持 POST 部分更新、持久化和热重载。

`max_thread` 控制单个漫画在 `downloading` 阶段的图片并发 worker 数，取值范围 1 到 20。批量任务会并发启动多个漫画任务，但所有 HTTP 请求仍共享全局请求间隔配置。

图片压缩配置由 GET 返回，可通过 POST 部分更新并持久化、热重载：

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `enable_image_compression` | `false` | 仅处理新下载且超过上限的图片 |
| `image_max_size_kb` | `1024` | 目标大小上限，单位为 1024 字节，整数范围 1～102400 |
| `keep_original_images` | `true` | 为实际发生压缩的图片保存原始字节副本 |
| `allow_image_resize` | `false` | 编码质量调整未达到上限时，允许按比例缩小分辨率 |

未启用压缩时保持原始字节及格式。启用后优先调整编码质量或颜色数；不能达到上限时保存较小的有效结果并记录 warning，编码异常或输出校验失败时回退原图。动画或多帧图片保持原样。BMP 和单帧 GIF 在需要压缩时可转换为 PNG。

原图目录为 `Original/[漫画 ID] 标题`，与 `Manga/[漫画 ID] 标题` 分离，原图不进入下载 ZIP。原图副本写入失败时，在 Manga 保存原图并跳过压缩。有效原图副本和历史有效下载文件均不自动重写；设置变化不会自动重压已有资料库。数据库记录实际输出文件的路径、格式对应的文件名及大小，ZIP 使用这些记录打包。

Response data：

```json
{
  "status": "saved",
  "message": "配置已保存并热重载",
  "download_path": "/data",
  "request_delay_ms": 1200,
  "extension_token_set": false,
  "config_path": "config/config.local.json"
}
```

### POST /api/config/extension-token

生成并保存扩展 Token。若环境配置固定了 `WNACG_EXTENSION_TOKEN`，响应仍返回实际生效的
Token，并通过 `overridden_fields: ["extension_token"]` 说明新生成值尚未生效。

Response data：

```json
{
  "status": "saved",
  "extension_token": "generated-token",
  "extension_token_set": true
}
```

要求：

- 保存前校验。
- 写入失败不影响旧配置。
- 热重载失败回滚旧配置。

## 6. 扩展 API

扩展 API 必须携带：

```text
X-Extension-Token: <token>
```

### GET /api/extension/status

查询后台连接状态。

Response：

```json
{
  "ok": true,
  "data": {
    "connected": true,
    "version": "1.0.0",
    "server": "WNACG Downloader",
    "paired": true
  },
  "error": null
}
```

### POST /api/extension/submit

扩展提交单个任务。

Request：

```json
{
  "manga_id": "123456",
  "url": "https://www.wnacg.com/photos-index-page-1-aid-123456.html",
  "title_hint": "页面标题",
  "cover_hint": "",
  "page_type": "detail"
}
```

### POST /api/extension/submit-many

扩展提交批量任务。

Request：

```json
{
  "items": [
    {
      "manga_id": "123456",
      "url": "https://www.wnacg.com/photos-index-page-1-aid-123456.html",
      "title_hint": "页面标题"
    }
  ],
  "page_url": "https://www.wnacg.com/",
  "page_type": "list",
  "mode": "confirm"
}
```

mode：

```text
confirm    进入待确认
queue      直接入队
```

### GET /api/extension/item/{manga_id}

查询当前 ID 的本地状态。

## 7. 日志

### GET /api/logs

查询后台持久化日志，用来解释任务失败、图片失败、修复重试失败等原因。

Query：

```text
level=error
manga_id=123456
task_id=task_01
limit=200
```

Response：

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "id": 1,
        "level": "error",
        "event": "image_download_failed",
        "message": "图片下载失败",
        "manga_id": "123456",
        "task_id": "task_01",
        "stage": "downloading",
        "details": {
          "pic_index": 12,
          "pic_url": "https://example.test/012.jpg",
          "page_url": "https://www.wnacg.com/photos-gallery-page-12-aid-123456.html",
          "error": "timeout"
        },
        "created_at": "2026-05-27T10:00:00"
      }
    ],
    "total": 1
  },
  "error": null
}
```

常见事件：

```text
task_started
task_completed
task_partial
task_failed
task_controlled
legacy_task_failure
manga_info_resolved
image_resolve_started
image_url_resolved
image_urls_resolved
image_url_resolve_failed
image_download_started
image_download_completed
image_file_reused
image_download_failed
problem_image_retry_started
problem_image_retry_completed
retry_failed_images_started
retry_failed_images_finished
problem_image_retry_failed
```

## 8. WebSocket

### GET /ws/progress

消息类型：

```text
task_created
task_progress
task_log
task_status_changed
task_error
library_updated
config_updated
```

任务进度消息：

```json
{
  "type": "task_progress",
  "task_id": "task_01",
  "manga_id": "123456",
  "status": "running",
  "stage": "downloading",
  "current": 24,
  "total": 42,
  "message": "图片下载中"
}
```

任务日志消息在日志持久化后推送，`item` 与 `/api/logs` 返回的单条记录结构一致：

```json
{
  "type": "task_log",
  "item": {
    "id": 123,
    "level": "info",
    "event": "image_resolve_started",
    "message": "正在解析第 7/204 张图片",
    "manga_id": "123456",
    "task_id": "task_01",
    "stage": "resolving_images",
    "details": {"page_index": 7},
    "created_at": "2026-10-10T14:00:00+08:00"
  }
}
```

右侧实时日志通过 `GET /api/logs?task_id=task_01&limit=200` 加载当前任务的历史，按最新优先展示并以 WebSocket 接收新增记录。每 5 秒补取历史，覆盖断线期间遗漏的日志；筛选、详情展开不会修改任务状态。

错误消息：

```json
{
  "type": "task_error",
  "task_id": "task_01",
  "manga_id": "123456",
  "stage": "downloading",
  "error": {
    "code": "IMAGE_DOWNLOAD_FAILED",
    "message": "图片下载失败",
    "retryable": true
  }
}
```
