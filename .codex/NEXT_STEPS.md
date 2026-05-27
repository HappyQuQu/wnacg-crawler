# 下一步路线

最新权威清单见 `docs/PROGRESS.md`。当前推荐顺序如下。

## 已完成：资料库真实化

目标：减少前端假区块，让下载后的文件和完整度可见。

任务：

- [x] 将 `LibraryService` 从内存实现改为读取 SQLite 和文件系统。
- [x] 返回漫画标题、状态、图片总数、有效文件数、完整度、zip 状态、最后错误。
- [x] `/api/library` 列表接真实数据。
- [x] `/api/library/{manga_id}` 返回文件级状态。
- [x] 支持重新校验。
- [x] 支持重新打包。

## 已完成：前端 WebSocket 实时进度

目标：用 `/ws/progress` 替代纯轮询，让任务进度实时更新。

任务：

- [x] 前端建立 WebSocket 连接。
- [x] 收到 `task_progress` 后局部更新任务列表和详情。
- [x] 断线后自动回退到轮询。
- [x] 页面展示连接状态。

## 已完成：任务状态流转和取消语义

目标：让暂停、恢复、取消不是只改数据库状态。

任务：

- [x] 定义合法状态流转表。
- [x] `TaskRunner` 在阶段循环中检查暂停/取消状态。
- [x] cancelled 任务停止后续下载。
- [x] paused 任务停止推进，resume 后重新调度。
- [x] 服务启动后恢复 queued/running 任务。

限制：

- 暂停/取消会在阶段检查点生效，不能强制打断正在等待中的单个 HTTP 请求。

## 已完成：下载并发

目标：批量任务不要一个漫画一个漫画排队慢跑，单个漫画的图片下载也不要串行。

任务：

- [x] 批量任务通过 `TaskRunner.run_many()` 并发启动。
- [x] 单个漫画的图片下载阶段按 `max_thread` 创建并发 worker。
- [x] 保持全局请求间隔限制，避免瞬间请求过密。
- [x] 增加图片并发下载 smoke test。

## 已完成：设置页配置持久化

目标：让后台设置不只是校验，而是能保存并热重载。

任务：

- [x] 设置页接入 `/api/config`。
- [x] 后端把合法配置写入本地配置文件。
- [x] 保存后刷新 `get_settings()` 缓存。
- [x] 下载器在下一次请求使用新配置。
- [x] 非法配置返回明确错误，不写坏配置。

## P0：扩展 MVP 验收

目标：让扩展成为可用入口。

任务：

- [x] 后台生成或配置 extension token。
- [x] options 页保存后台地址和 token。
- [x] popup 查询 `/api/extension/status`。
- [x] popup 查询当前 ID 的本地状态。
- [x] popup 一键提交当前页面。
- [x] 提供扩展打包脚本。
- [x] 提供 Chrome 手动验收指南。
- [ ] Chrome 手动加载扩展验收。

备注：

- 命令行独立 Chrome 加载尝试未在 `chrome://extensions` 中发现 WNACG 扩展，仍需用户常用 Chrome 按 `docs/EXTENSION_MANUAL_TEST.md` 手动加载 `extension/` 目录确认。

## P1：资料库文件级详情

目标：让 partial/failed 的原因能直接定位到图片。

任务：

- [x] 前端打开资料库单项详情。
- [x] 展示文件级 `valid/missing/invalid/failed` 明细。
- [x] 支持只看问题文件。
- [x] 支持只重试失败图片。
- [x] 支持重新解析图片地址。

截图：

- `docs/prototype/library-file-detail-frontend.png`
- `docs/prototype/library-file-detail-mobile.png`

## P1：失败图片恢复

目标：让资料库详情里的问题文件能直接进入修复流程。

任务：

- [x] 支持只重试失败图片。
- [x] 重试后刷新文件级状态和完整度。
- [x] 支持重新解析图片地址。
- [x] 支持 `pic_url` 缺失或过期时重新访问图片详情页。

## P1：真实站点长任务验收

目标：用用户明确给出的漫画 ID 验证完整链路。

任务：

- [ ] 下载一个真实漫画 ID，覆盖目录页、图片详情页、图片下载、校验和 ZIP。
- [ ] 验证暂停/取消在真实 HTTP 请求间隔下的体验。
- [ ] 验证 partial 后“重试问题”能补齐。
- [ ] 记录失败原因和站点限速情况。

## P2：工程完善

任务：

- [x] Alembic 初始迁移。
- [x] `.env.example`。
- [x] 本地 CI 脚本。
- [x] 前端 ESLint。
- [x] 后端 mypy。
- [x] Docker 构建验证。
- [x] Docker Compose 部署验证。
