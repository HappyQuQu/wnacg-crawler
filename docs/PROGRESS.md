# 项目进度清单

版本：v0.1  
日期：2026-05-27  
当前阶段：Docker Compose 部署已跑通，准备做 Chrome 手动加载扩展验收和真实站点长任务验收

## 1. 当前结论

项目已从旧 MVP 结构切换到新架构方向：

```text
后台管理是核心产品
浏览器扩展是增强入口
CLI/File Watch 是高级入口
```

旧实现已保留在 `old/` 目录作为参考。根目录已重新 scaffold 出新的 `backend/`、`frontend/`、`extension/`、`docs/`、`config/` 等结构。

## 2. 已完成

### 2.1 产品与开发文档

- [x] 生成 PRD：`docs/PRD.md`
- [x] 生成开发总览：`docs/DEVELOPMENT.md`
- [x] 生成核心流程文档：`docs/FLOWS.md`
- [x] 生成技术架构文档：`docs/ARCHITECTURE.md`
- [x] 生成 API 契约：`docs/API.md`
- [x] 生成数据模型与状态机文档：`docs/DATA_MODEL.md`
- [x] 生成 UI 开发规格：`docs/UI_SPEC.md`
- [x] 生成 Apple 风格静态原型：`docs/prototype/index.html`
- [x] 生成原型截图：`docs/prototype/preview-desktop.png`
- [x] 生成原型移动端截图：`docs/prototype/preview-mobile.png`
- [x] 生成新前端 scaffold 预览图：`docs/prototype/scaffold-frontend.png`
- [x] 生成真实 API 前端预览图：`docs/prototype/live-api-frontend.png`
- [x] 生成资料库和 WebSocket 前端预览图：`docs/prototype/library-websocket-frontend.png`
- [x] 生成资料库和 WebSocket 移动端预览图：`docs/prototype/library-websocket-mobile.png`
- [x] 生成设置与扩展配置前端预览图：`docs/prototype/settings-extension-frontend.png`
- [x] 生成设置与扩展配置移动端预览图：`docs/prototype/settings-extension-mobile.png`
- [x] 生成资料库文件明细前端预览图：`docs/prototype/library-file-detail-frontend.png`
- [x] 生成资料库文件明细移动端预览图：`docs/prototype/library-file-detail-mobile.png`
- [x] 生成 Chrome 扩展手动验收指南：`docs/EXTENSION_MANUAL_TEST.md`
- [x] 生成部署文档：`docs/DEPLOYMENT.md`

### 2.2 新后端骨架

- [x] 建立 FastAPI 应用入口：`backend/app/main.py`
- [x] 建立 API 分层：`backend/app/api/`
- [x] 建立 core 分层：`backend/app/core/`
- [x] 建立 crawler 分层：`backend/app/crawler/`
- [x] 建立 db 分层：`backend/app/db/`
- [x] 建立 services 分层：`backend/app/services/`
- [x] 建立测试目录：`backend/tests/`
- [x] 增加健康检查接口：`GET /api/health`
- [x] 增加输入解析接口骨架：`POST /api/inputs/parse`
- [x] 增加任务接口骨架：`/api/tasks`
- [x] 增加资料库接口骨架：`/api/library`
- [x] 增加配置接口骨架：`/api/config`
- [x] 增加扩展接口骨架：`/api/extension`
- [x] 增加 WebSocket 进度端点：`/ws/progress`
- [x] 增加 SQLAlchemy async 模型骨架
- [x] 增加 Alembic 迁移目录和配置
- [x] `TaskService` 已从内存字典改为 SQLite 持久化
- [x] 输入预检已能读取本地任务状态
- [x] 新增 `TaskRunner` 后台执行器
- [x] 新任务、重试、恢复可触发真实下载执行
- [x] 迁移目录页解析、图片详情页解析、图片下载、文件校验、zip 打包链路
- [x] 增加文件级下载记录表：`download_file`
- [x] 任务进度可写入 SQLite，并通过 WebSocket 服务端广播
- [x] `LibraryService` 已从内存实现改为读取 SQLite 和文件系统
- [x] `/api/library` 可返回真实完整度、文件状态和 ZIP 状态
- [x] `/api/library/{manga_id}/verify` 可重新校验文件并回写状态
- [x] `/api/library/{manga_id}/zip` 可重新打包完整项目
- [x] 增加任务状态流转校验
- [x] `TaskRunner` 在阶段间检查暂停/取消状态
- [x] 服务启动后恢复 queued/running 任务
- [x] `/api/config` 支持保存本地配置到 `config/config.local.json`
- [x] 配置保存后热重载并重建 downloader client
- [x] `/api/config/extension-token` 支持生成扩展 Token
- [x] `/api/library/{manga_id}/retry-failed` 支持创建问题图片修复任务
- [x] `TaskRunner` 支持只重试非 `valid` 图片文件
- [x] `TaskRunner` 支持 `pic_url` 缺失或旧地址失效时重新解析图片详情页
- [x] `TaskRunner` 支持批量任务并发执行：`run_many`
- [x] 图片下载阶段按 `max_thread` 并发下载
- [x] 增加 `/api/logs` 持久日志接口，可按 level、manga_id、task_id 查询失败上下文
- [x] `TaskRunner` 记录任务开始、完成、失败、图片解析失败、图片下载失败和问题图片修复结果
- [x] 服务启动时回填已有失败任务的 `last_error` 到日志表，避免历史失败在日志页不可见

### 2.3 新前端骨架

- [x] 建立 Vite + React + TypeScript 项目：`frontend/`
- [x] 建立后台管理首屏 UI：`frontend/src/main.tsx`
- [x] 建立 Apple 风格 CSS：`frontend/src/styles.css`
- [x] 建立 Vite dev proxy 到后端
- [x] 使用 `lucide-react` 替代 emoji 图标
- [x] 添加任务页接入 `/api/inputs/parse`
- [x] 加入队列接入 `/api/tasks/batch`
- [x] 指标和任务详情接入 `/api/tasks`
- [x] 本地资料库接入 `/api/library`
- [x] WebSocket 接入 `/ws/progress`
- [x] WebSocket 断开后自动回退轮询
- [x] 任务详情增加暂停、继续、取消、重试控制按钮
- [x] 设置面板接入 `/api/config`
- [x] 设置面板支持生成扩展 Token
- [x] 资料库单项详情接入 `/api/library/{manga_id}`
- [x] 资料库详情展示文件级状态、路径、大小、错误原因和更新时间
- [x] 资料库详情支持只看问题文件
- [x] 资料库详情支持一键重试问题文件
- [x] 左侧菜单支持真实页面切换：控制台 / 下载队列 / 本地资料库 / 日志 / 设置
- [x] 增加日志页面接入 `/api/logs`，展示失败原因、阶段、任务 ID 和详细上下文
- [x] 移除首页默认示例输入，不再自动展示 mock 预检数据
- [x] 完成生产构建验证

### 2.4 浏览器扩展骨架

- [x] 建立 Chrome Manifest V3 项目：`extension/`
- [x] 增加 `manifest.json`
- [x] 增加 background service worker
- [x] 增加 content script
- [x] 增加 popup 页面
- [x] 增加 options 页面
- [x] 增加扩展共享 API helper
- [x] 支持从 URL 提取 `manga_id`
- [x] 支持向后台提交当前页面
- [x] options 页支持保存后台地址、后台页面地址和 token
- [x] popup 支持查询后台连接状态
- [x] popup 支持查询当前 ID 本地状态
- [x] 完成 TypeScript typecheck
- [x] 完成扩展 build
- [x] 增加扩展 zip 打包脚本：`npm run package:extension`
- [x] 增加 Chrome 手动加载验收文档

### 2.5 工程配置

- [x] 增加根 README：`README.md`
- [x] 增加 Python 项目配置：`pyproject.toml`
- [x] 增加 npm workspace：`package.json`
- [x] 增加 `package-lock.json`
- [x] 增加 Dockerfile
- [x] 增加 docker-compose
- [x] 增加 Docker 构建上下文忽略文件：`.dockerignore`
- [x] 增加配置示例：`config/config.example.json`
- [x] 增加环境变量示例：`.env.example`
- [x] 更新 `.gitignore`，忽略 node_modules、dist、tsbuildinfo
- [x] 增加 Codex 项目规范：`.codex/README.md`
- [x] 增加 Alembic 初始迁移：`backend/alembic/versions/20260527_0001_initial_schema.py`
- [x] 增加 AppLog 迁移：`backend/alembic/versions/20260527_0002_app_log.py`
- [x] 增加本地 CI 验证脚本：`scripts/validate.sh`
- [x] 本地 CI 纳入后端 mypy 类型检查
- [x] 本地 CI 纳入扩展打包验证
- [x] Docker 镜像支持前端多阶段构建并由 FastAPI 托管静态页面
- [x] docker-compose 增加容器健康检查
- [x] 后端测试隔离到 `/tmp` 临时 SQLite 和下载目录，避免污染真实本地资料库

## 3. 已验证

### 3.1 后端验证

- [x] `python -m compileall backend`
- [x] `pytest -q`
- [x] `ruff check backend`
- [x] `mypy backend`
- [x] FastAPI 应用可 import
- [x] `GET /api/health` 返回正常
- [x] `POST /api/inputs/parse` 可解析 ID/URL
- [x] `POST /api/tasks/batch` 可创建 SQLite 任务
- [x] 创建任务后再次预检可返回 `running` 和 `task_id`
- [x] 本地后端可启动：`http://127.0.0.1:8080`
- [x] 新增下载执行器后 `ruff check backend` 通过
- [x] 新增下载执行器后 `pytest -q` 通过
- [x] 新增下载执行器后 `python -m compileall backend` 通过
- [x] 资料库接口 smoke：list / verify / zip 通过
- [x] 任务控制 smoke：pending 暂停返回 409、取消返回 cancelled、取消后继续返回 409
- [x] 配置接口 smoke：GET / POST 保存通过
- [x] 扩展状态接口 smoke：`GET /api/extension/status` 通过
- [x] 资料库失败图片重试 smoke：失败文件可被修复为 `valid`
- [x] 资料库图片地址重新解析 smoke：缺失 `pic_url` 可通过详情页恢复并下载
- [x] 图片并发下载 smoke：`max_thread` worker 可并行处理同一漫画内多张图片
- [x] 持久日志 smoke：`/api/logs` 可返回失败上下文和 details
- [x] Alembic 临时 SQLite 升级验证：`alembic upgrade head`
- [x] 本地 CI 验证脚本：`npm run validate` 通过
- [x] 前端 ESLint 验证：`npm run lint -w frontend` 通过
- [x] Docker 构建验证：`docker compose build` 通过
- [x] Docker 启动验证：`docker compose up -d` 通过
- [x] Docker 健康检查：`GET http://127.0.0.1:8080/api/health` 返回正常
- [x] Docker 静态首页：`GET http://127.0.0.1:8080/` 返回前端页面

### 3.2 前端验证

- [x] `npm install`
- [x] `npm run build:frontend`
- [x] Vite dev server 可启动：`http://127.0.0.1:5173`
- [x] Chrome 渲染检查通过
- [x] 页面无明显横向溢出
- [x] 前端显示的预检表格、队列指标、任务详情来自真实 API
- [x] 前端显示的资料库表格来自真实 API
- [x] WebSocket 状态可显示为 WS，断开时回退轮询
- [x] 前端任务控制按钮渲染检查通过
- [x] 前端设置面板渲染检查通过
- [x] 桌面和移动端截图检查通过
- [x] 资料库文件明细桌面和移动端截图检查通过
- [x] Docker 前端菜单交互检查：左侧菜单可切换下载队列、本地资料库、日志、设置

### 3.3 扩展验证

- [x] `npm run typecheck:extension`
- [x] `npm run build:extension`
- [x] `npm run package:extension`
- [ ] Chrome 自动加载验收未通过：独立 Chrome 进程可启动，但 `chrome://extensions` 未出现 WNACG 扩展，需要在用户常用 Chrome 中手动加载确认

## 4. 当前运行状态

当前开发服务器：

```text
Backend:  http://127.0.0.1:8080
Frontend: http://127.0.0.1:5173
```

当前 in-app browser 打开的是：

```text
http://127.0.0.1:5173/
```

## 5. 当前代码状态说明

当前 git status 中会看到旧 tracked 文件为 deleted，原因是旧实现已移动到 `old/`：

```text
backend/api/*
backend/crawler/*
backend/db/*
backend/main.py
frontend/app.js
frontend/style.css
config/config.json
doc/设计方案.md
```

这是结构切换导致的预期状态。后续如果确认新架构方向无误，可以将这些删除和 `old/` 目录一起作为一次迁移提交。

## 6. 下一阶段优先级

### P0：任务状态持久化

- [x] 将 `TaskService` 从内存实现改为 SQLite 持久化
- [x] 新增 `DownloadTask` repository
- [x] 实现任务去重
- [x] 实现任务状态流转校验
- [x] 服务重启后任务仍可查询

### P0：输入预检

- [x] `InputService` 查询本地数据库状态
- [x] 已完成项目返回 `exists`
- [x] 部分完成项目返回 `partial`
- [x] 下载中项目返回 `running`
- [x] 无效输入返回 `invalid`
- [x] 预检结果接入前端

### P0：下载核心迁移

- [x] 迁移旧解析逻辑到 `backend/app/crawler/parser.py`
- [x] 迁移下载逻辑到 `backend/app/crawler/downloader.py`
- [x] 增加全局 request delay
- [x] 增加图片文件校验
- [x] 图片下载阶段按 `max_thread` 并发执行
- [x] 批量加入任务后可并发执行多个漫画任务
- [x] 下载失败写入文件级状态
- [x] 不完整任务标记为 `partial`
- [x] 下载完成后可按配置生成 zip
- [ ] 真实站点长任务验收
- [x] 运行中任务的暂停/取消在阶段检查点生效
- [x] 服务启动后自动恢复 queued/running 任务

### P1：资料库

- [x] 实现真实 `LibraryService`
- [x] 从数据库和文件系统计算完整度
- [x] 资料库列表接真实数据
- [x] 支持重新校验
- [x] 支持重新打包
- [x] 资料库详情页展示文件级失败明细
- [x] 支持只重试失败图片
- [x] 支持重新解析图片地址

### P1：前端接 API

- [x] 封装基础 API client
- [x] 添加页调用 `/api/inputs/parse`
- [x] 队列指标调用 `/api/tasks`
- [x] 资料库页调用 `/api/library`
- [x] 设置页调用 `/api/config`
- [x] WebSocket 接入实时进度，替代轮询
- [x] WebSocket 断开后回退轮询
- [x] 任务详情调用 pause/resume/cancel/retry 接口
- [x] 资料库详情调用 `/api/library/{manga_id}` 并展示文件级明细
- [x] 资料库详情调用 `/api/library/{manga_id}/retry-failed` 修复问题图片

### P1：扩展 MVP

- [x] 后台生成 extension token
- [x] options 页保存后台地址和 token
- [x] popup 查询 `/api/extension/status`
- [x] popup 查询当前 ID 本地状态
- [x] popup 一键提交任务
- [x] 后台未启动时显示明确提示
- [x] 扩展可打包为 zip
- [x] 扩展手动验收步骤已文档化
- [ ] Chrome 手动加载扩展验收

### P2：工程完善

- [x] 增加 Alembic 初始迁移
- [x] 增加 GitHub Actions 或本地 CI 脚本
- [x] 增加前端 ESLint 配置
- [x] 增加后端 mypy 检查
- [x] 增加 Docker 构建验证
- [x] 增加 `.env.example`

## 7. 阻塞与风险

- [ ] 旧数据是否迁移尚未决策
- [ ] 旧目录 `old/` 是否纳入版本控制尚未决策
- [ ] 下载执行器和并发 worker 已接入，但还没有对真实站点做完整长任务验收
- [ ] 暂停/取消在单个 HTTP 请求返回后生效，还不能强制中断正在等待中的请求
- [ ] 扩展目前未在 Chrome 中手动加载验收；自动命令行加载未发现 WNACG 扩展，疑似受本机 Chrome 策略/环境影响，手动步骤见 `docs/EXTENSION_MANUAL_TEST.md`
- [ ] `config/config.local.json` 为本地忽略文件，不参与版本控制

## 8. 下一步建议

建议下一步先做：

```text
Chrome 手动加载扩展验收 + 真实站点长任务验收
```

理由：

1. 扩展代码已经能构建，但还没有在 Chrome 扩展管理页加载验收。
2. 失败图片重试已经能处理 `pic_url` 缺失或过期的文件，下一步需要用真实漫画 ID 验证完整长链路。
3. 完成这两项后，后台管理和扩展入口都会更接近日常可用形态。

## 9. 2026-10-10：迁移 1.0 下载可靠性优化

- 首次下载和问题图片修复共用恢复逻辑。图片 403 不再重试旧地址或请求同一地址的浏览器回退，改为重新解析详情页、持久化新 URL；每张图片至多刷新一次，地址未变化或刷新失败时记录失败。
- 缺失图片 URL 可在首次下载时恢复。详情页的 Cloudflare 浏览器回退保持可用。
- 首次解析和刷新均以图片详情页 URL 为相对地址基准；正则回退处理 HTML 实体，拒绝非 HTTP(S) 和残缺地址。
- 新增 Pillow 依赖用于真实格式识别与解码校验，移除 5 KB 门槛；下载、恢复、资料库校验共用规则，检查所有图片帧。
- 下载文件按真实格式命名，持久化真实路径和大小；优先复用数据库记录的有效文件，再查找同页其他扩展名，重复运行只补缺。
- 图片和 ZIP 写入同目录唯一临时文件，完成后原子替换；异常时保留旧文件并清理临时文件。
- ZIP 按文件记录打包，重新校验图片和归档，避免加入旧扩展名文件或临时文件；问题图片修复在 ZIP 成功后才标记完成。
- 压缩功能尚未加入，保存的图片内容保持原始字节。

验证：`ruff check backend`、`mypy backend`、`pytest -q`（87 项通过）、`python -m compileall -q backend`、`git diff --check` 均通过。

测试使用临时数据库、本地生成的图片及模拟响应，并禁止真实 HTTP 客户端和浏览器启动。覆盖完整模拟任务、403 恢复与有界重试、小图片与损坏图片、文件复用、暂停，以及图片和 ZIP 写入失败的恢复；未触发真实下载。

## 10. 2026-10-10：可配置图片压缩

- 后台设置新增图片压缩开关，默认关闭；每张图片大小上限默认 1024 KB，可设置 1–102400 KB，API 和界面均校验输入。
- 保留原图默认开启，允许缩小分辨率默认关闭，两项独立配置。仅实际压缩的图片需要备份，原图写入 `Original/[漫画 ID] 标题/`，不加入 ZIP。
- 先调整编码质量或颜色数量，只有允许缩小分辨率时才逐步缩小；保留透明通道。动画和多帧图片保持原样。
- 大小上限作为压缩目标；无法达到时保留有效图片并记录警告。编码失败回退原图；原图备份失败时也保存原图，避免只留下压缩版本。
- 首次下载和失败图片修复均接入压缩，持久化输出的真实扩展名、路径和大小；已有有效图片继续复用，不因修改配置而重新压缩。
- 配置通过 `/api/config` 保存并在重启后恢复，更新配置示例和 API 文档。

验证：后端 Ruff、Mypy、Compileall 和 Pytest（120 项通过），前端 Lint 与 Build，以及 `git diff --check` 均通过。

使用本地生成的 JPEG、PNG、WebP、BMP、AVIF 和 GIF 验证压缩、分辨率开关、透明度、动画、失败回退、原图备份、文件记录及 ZIP 内容。设置页使用隔离配置和数据库验收，验证默认状态、非法输入、独立开关和保存后重新加载；禁止真实 HTTP 客户端及浏览器下载，未触发真实下载。

## 11. 2026-10-10：任务详情实时日志

- 右侧任务详情新增独立实时日志区，按任务 ID 获取最近 200 条持久化记录，最新优先；支持只看警告/错误、刷新和展开请求详情。
- 日志写入成功后通过 `/ws/progress` 推送 `task_log`，前端按日志 ID 去重；每 5 秒补取历史，恢复断线期间遗漏的记录。全局日志与概览动态同步接收新事件。
- 记录每张图片的解析开始与成功、下载开始与校验成功、有效文件复用，以及问题图片修复过程；沿用原有失败日志，不从进度值生成假日志。
- 日志区放在进度下方，历史独立滚动，任务操作保留在详情底部。

验证：后端 Ruff、Mypy、Compileall 和 Pytest（125 项通过），前端 Lint 与 Build 通过。新增测试覆盖持久化后推送、写入失败不推送、同漫画不同任务隔离、成功/失败/文件复用事件及解析事件。

Docker 实际服务验证 WebSocket 日志与 API 持久化记录一致，页面自动更新、问题筛选、详情展开及刷新后历史恢复正常，无页面控制台错误。仅观察已有下载任务，未创建额外下载任务；18082 预览使用真实记录的只读快照。
