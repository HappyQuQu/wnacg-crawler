# WNACG Downloader 开发文档总览

版本：v0.1  
日期：2026-05-27  
状态：草案

## 1. 文档用途

本文档组用于指导后续开发，把产品想法拆成可以实现、测试、联调的工程契约。

当前产品方向：

```text
后台管理是核心产品，浏览器扩展是增强入口，CLI/File Watch 是高级入口。
```

已有文档：

- `docs/PRD.md`：产品需求文档
- `docs/prototype/index.html`：Apple 风格静态原型
- `docs/FLOWS.md`：核心业务流程
- `docs/UI_SPEC.md`：后台页面和组件说明
- `docs/ARCHITECTURE.md`：技术架构
- `docs/API.md`：HTTP/WebSocket API 契约
- `docs/DATA_MODEL.md`：数据模型和状态机

## 2. 推荐阅读顺序

1. `PRD.md`：先确认产品边界。
2. `FLOWS.md`：理解用户和系统流程。
3. `DATA_MODEL.md`：确定状态和持久化结构。
4. `API.md`：确定前后端、扩展和后台的通信契约。
5. `UI_SPEC.md`：根据原型实现后台界面。
6. `ARCHITECTURE.md`：按模块重构和落地。

## 3. 当前关键决策

### 3.1 后台必须独立可用

浏览器扩展不是必需品。用户只打开后台管理页面，也必须能完成：

- 输入 ID/URL
- 批量导入
- 预检
- 下载
- 失败重试
- 完整性校验
- 打包 ZIP
- 查看资料库

### 3.2 扩展只负责投喂任务

浏览器扩展不下载文件、不写数据库、不参与打包。它只做：

- 识别页面 ID
- 识别列表页条目
- 查询本地状态
- 提交任务到后台
- 打开后台页面

### 3.3 下载完成必须经过校验

不能因为下载协程结束就标记完成。任务完成条件：

```text
元信息完整
目录页完整
图片详情页完整
图片文件完整
ZIP 成功或 ZIP 被配置关闭
```

如果只完成了一部分，应标记为 `partial`，不能标记为 `completed`。

### 3.4 目录命名必须包含 ID

避免同名漫画覆盖：

```text
Manga/[123456] title
Zip/[123456] title.zip
```

## 4. 推荐迭代顺序

### Phase 1：后台核心可用

目标：不依赖扩展也能完整下载。

任务：

- 新任务状态机
- 输入解析接口
- 预检列表
- 下载队列
- 失败状态修复
- 完整性校验
- ZIP 前校验

### Phase 2：资料库和恢复能力

目标：从“能下载”变成“能管理”。

任务：

- 资料库页面
- 任务详情页面
- 文件级状态
- 失败列表
- 只重试失败图片
- 重新解析图片地址
- 重新打包

### Phase 3：浏览器扩展 MVP

目标：让真实浏览器成为投喂入口。

任务：

- manifest
- background service worker
- popup
- 详情页 ID 识别
- 后台连接状态
- 一键加入队列

### Phase 4：批量增强

目标：覆盖批量整理和自动化。

任务：

- 列表页批量添加
- 右键菜单
- File Watch
- CLI/API 文档
- 导入/导出失败列表

## 5. 代码组织建议

推荐后续目录：

```text
backend/
  api/
    inputs_router.py
    tasks_router.py
    library_router.py
    extension_router.py
    config_router.py
    ws_router.py
  crawler/
    downloader.py
    parser.py
    rate_limiter.py
  db/
    models.py
    repository.py
    migrations/
  service/
    input_service.py
    task_service.py
    manga_service.py
    library_service.py
    verify_service.py
    zip_service.py
  core/
    errors.py
    schemas.py
    paths.py
    security.py

frontend/
  index.html
  app.js
  style.css

extension/
  manifest.json
  background.js
  content.js
  popup.html
  popup.js
  options.html
```

## 6. 基础开发原则

1. 先落状态机，再做 UI 美化。
2. 失败要可恢复，不能只写日志。
3. 前端展示的状态必须来自后端持久化状态。
4. 扩展 API 与后台 UI API 可以共享底层服务，但接口命名应分开。
5. 配置保存必须先校验，再写文件，再热重载。
6. 文件系统操作要幂等，重复运行只补缺，不破坏已有有效文件。
7. 任何任务完成前必须执行完整性校验。

## 7. 本地验收清单

开发一个阶段前后，至少检查：

- 服务可启动。
- 后台页面可打开。
- 输入单个 ID 能进入预检。
- 输入多个 ID 能去重。
- 已下载项能识别为已完成或部分完成。
- 下载失败不会显示为完成。
- 重启服务后任务状态仍可查询。
- ZIP 只在文件完整时生成。
- 配置非法值不会写坏配置。

## 8. 数据库迁移

项目使用 Alembic 管理数据库结构。新环境初始化：

```bash
alembic upgrade head
```

迁移与后端使用同一套配置加载逻辑，自动读取项目根目录 `.env`。
`WNACG_CONFIG_PATH` 指定 JSON 配置文件，`WNACG_DB_PATH` 可覆盖数据库路径。
优先级为：系统环境变量 > `.env` > JSON 配置 > 内置默认值。

当前初始迁移：

```text
backend/alembic/versions/20260527_0001_initial_schema.py
```

应用启动仍会执行 `Base.metadata.create_all` 作为开发期兜底，但正式结构变更应优先写 Alembic migration。
