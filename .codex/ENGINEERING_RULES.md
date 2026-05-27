# 工程规则

## 通用开发规则

1. 优先沿用现有目录和命名风格。
2. 不做与当前任务无关的大重构。
3. 不回滚用户已有改动。
4. 不把本地生成物、缓存、数据库、下载文件提交进版本控制。
5. 涉及真实站点请求时要谨慎，测试 API 创建任务时默认使用 `start_immediately: false`。
6. 不要为了 smoke test 随便触发真实下载；只有用户明确要验真实下载时才跑真实站点任务。

## 后端边界

后端目录：

```text
backend/app/api/       HTTP/WebSocket 接口
backend/app/core/      配置、schema、安全、路径工具
backend/app/crawler/   远端请求、HTML 解析、下载辅助
backend/app/db/        SQLAlchemy 模型和 repository
backend/app/services/  业务编排和任务执行
backend/tests/         后端测试
```

约束：

- API 层只做请求响应、参数转发、HTTP 错误处理。
- 业务编排放在 `services/`。
- 数据库访问通过 repository 封装。
- 远端 HTML 解析集中在 `crawler/parser.py`。
- HTTP 请求和下载逻辑集中在 `crawler/downloader.py`。
- 任务执行阶段由 `TaskRunner` 写入任务进度，并广播 WebSocket 消息。

## 前端边界

前端目录：

```text
frontend/src/main.tsx
frontend/src/styles.css
```

当前仍是轻量结构。后续页面增多后再拆：

```text
frontend/src/api/
frontend/src/components/
frontend/src/pages/
frontend/src/types/
```

约束：

- 不再引入假任务数据。
- 任务、资料库、设置状态必须来自 API。
- UI 保持 Apple 风格：克制、清晰、信息密度适中。
- 使用 `lucide-react` 图标，不用 emoji 承担正式 UI 图标。
- 关键操作要有 disabled/loading 状态。

## 扩展边界

扩展只做入口增强：

- 识别详情页 ID。
- 识别列表页 ID。
- 查询后台连接状态。
- 提交任务到后台。
- 打开后台管理页面。

扩展不做：

- 下载图片。
- 写数据库。
- 写本地文件。
- 打包 ZIP。
- 绕过后台安全校验。

## 数据和状态规则

任务状态参考：

```text
pending -> queued -> running -> completed
pending -> queued -> running -> partial
pending -> queued -> running -> failed
running -> paused
running -> cancelled
partial/failed -> queued
```

完成条件：

```text
元信息完整
目录页完整
图片详情页完整
图片文件完整有效
ZIP 成功或 ZIP 被配置关闭
```

如果文件缺失、图片校验失败或图片地址解析不完整，应标记为 `partial` 或 `failed`，不能标记为 `completed`。

