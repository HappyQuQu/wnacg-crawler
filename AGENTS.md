# WNACG Downloader 项目规则

## 项目概述

WNACG Downloader 是一个本地下载中枢，目标形态：
- 后台管理是核心产品
- 浏览器扩展是增强入口
- CLI/File Watch 是高级入口

## 技术栈

**后端：**
- Python 3.12
- FastAPI
- SQLAlchemy Async + SQLite
- Pydantic Settings
- httpx + BeautifulSoup4/lxml
- Alembic

**前端：**
- Node.js 24 LTS 最新补丁版本（通过 `.nvmrc` 选择，Docker 构建使用 `node:24-slim`）
- Vite + React + TypeScript
- lucide-react 图标

**扩展：**
- Chrome Manifest V3
- TypeScript
- background service worker + content script + popup/options

## 目录结构

```
backend/app/api/       HTTP/WebSocket 接口
backend/app/core/      配置、schema、安全、路径工具
backend/app/crawler/   远端请求、HTML 解析、下载辅助
backend/app/db/        SQLAlchemy 模型和 repository
backend/app/services/  业务编排和任务执行
backend/tests/         后端测试
frontend/src/          前端源码
extension/src/         扩展源码
docs/                  产品和开发文档
config/                配置文件
```

## 工程规则

### 通用规则
1. 优先沿用现有目录和命名风格
2. 不做与当前任务无关的大重构
3. 不回滚用户已有改动
4. 不把本地生成物、缓存、数据库、下载文件提交进版本控制
5. 涉及真实站点请求时要谨慎，测试 API 创建任务时默认使用 `start_immediately: false`
6. 不要为了 smoke test 随便触发真实下载

### 后端边界
- API 层只做请求响应、参数转发、HTTP 错误处理
- 业务编排放在 `services/`
- 数据库访问通过 repository 封装
- 远端 HTML 解析集中在 `crawler/parser.py`
- HTTP 请求和下载逻辑集中在 `crawler/downloader.py`
- 任务执行阶段由 `TaskRunner` 写入任务进度，并广播 WebSocket 消息

### 前端边界
- 不再引入假任务数据
- 任务、资料库、设置状态必须来自 API
- UI 保持 Apple 风格：克制、清晰、信息密度适中
- 使用 `lucide-react` 图标，不用 emoji 承担正式 UI 图标
- 关键操作要有 disabled/loading 状态

### 扩展边界
扩展只做入口增强：
- 识别详情页 ID / 列表页 ID
- 查询后台连接状态
- 提交任务到后台
- 打开后台管理页面

扩展不做：
- 下载图片、写数据库、写本地文件、打包 ZIP、绕过后台安全校验

## 数据和状态规则

任务状态流转：
```
pending -> queued -> running -> completed
pending -> queued -> running -> partial
pending -> queued -> running -> failed
running -> paused
running -> cancelled
partial/failed -> queued
```

完成条件：
- 元信息完整
- 目录页完整
- 图片详情页完整
- 图片文件完整有效
- ZIP 成功或 ZIP 被配置关闭

如果文件缺失、图片校验失败或图片地址解析不完整，应标记为 `partial` 或 `failed`，不能标记为 `completed`。

## 验证命令

**后端：**
```bash
.venv/bin/ruff check backend
.venv/bin/mypy backend
.venv/bin/pytest -q
.venv/bin/python -m compileall backend
```

**前端：**
```bash
npm run lint -w frontend
npm run build:frontend
```

**扩展：**
```bash
npm run build:extension
npm run package:extension
```

**完整验证：**
```bash
npm run validate
```

## 运行地址

本地开发默认：
- Backend: http://127.0.0.1:8080
- Frontend: http://127.0.0.1:5173

后端默认只监听本地地址。除非用户明确要求，不要改成局域网或公网监听。

## 关键产品原则

1. UI 展示状态必须来自后端持久化状态，避免假数据
2. 下载完成必须经过完整性校验，不能只因协程结束就标记完成
3. 文件系统操作要幂等：重复运行只补缺，不破坏已有有效文件
4. 任务失败要可恢复，要能看到失败原因和重试入口
5. 文件目录必须包含漫画 ID，避免同名覆盖

目录格式：
```
Manga/[123456] title
Zip/[123456] title.zip
```

## API Smoke Test 原则

创建任务 smoke test 默认不要触发真实下载：
```json
{
  "items": [{ "manga_id": "900000001" }],
  "source": "smoke",
  "start_immediately": false
}
```

需要验证真实下载时，应使用用户明确给出的 ID，并提前说明会访问真实站点和写入下载目录。

## 权威文档

产品与技术文档位于 `docs/` 目录：
- `docs/PRD.md` - 产品需求文档
- `docs/ARCHITECTURE.md` - 技术架构
- `docs/API.md` - API 契约
- `docs/DATA_MODEL.md` - 数据模型
- `docs/FLOWS.md` - 核心流程
- `docs/UI_SPEC.md` - UI 规格
- `docs/PROGRESS.md` - 项目进度
