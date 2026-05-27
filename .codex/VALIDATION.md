# 验收清单

## 通用验证命令

后端：

```bash
.venv/bin/ruff check backend
.venv/bin/mypy backend
.venv/bin/pytest -q
.venv/bin/python -m compileall backend
WNACG_CONFIG_PATH=/tmp/wnacg-missing-config.json WNACG_DB_PATH=/tmp/wnacg-alembic-test.sqlite .venv/bin/alembic upgrade head
```

前端：

```bash
npm run lint -w frontend
npm run build:frontend
```

扩展：

```bash
npm run build:extension
npm run package:extension
```

服务健康检查：

```bash
curl -sS http://127.0.0.1:8080/api/health
```

完整本地验证：

```bash
npm run validate
```

## API smoke test 原则

创建任务 smoke test 默认不要触发真实下载：

```json
{
  "items": [{ "manga_id": "900000001" }],
  "source": "smoke",
  "start_immediately": false
}
```

需要验证真实下载时，应使用用户明确给出的 ID，并提前说明会访问真实站点和写入下载目录。

## 后端改动后

至少确认：

- FastAPI 应用可 import。
- `GET /api/health` 正常。
- `POST /api/inputs/parse` 可解析 ID 和 URL。
- `POST /api/tasks/batch` 可创建任务。
- 数据写入 SQLite 后服务重启仍可查。
- 失败或 partial 状态不会被误判为 completed。
- 资料库问题文件重试只处理非 `valid` 文件，且成功后刷新完整度。
- `pic_url` 缺失或旧地址失效时，问题文件重试会重新解析图片详情页。
- 数据模型变更必须有 Alembic migration，并用临时 SQLite 执行 `alembic upgrade head`。

## 前端改动后

至少确认：

- `npm run build:frontend` 通过。
- 本地页面可打开。
- 页面无明显横向溢出。
- 按钮 disabled/loading 状态正常。
- 添加任务、预检、队列指标、任务详情来自真实 API。
- 资料库详情能从 `/api/library/{manga_id}` 展示文件级状态、路径和错误原因。
- 资料库详情的重试问题文件按钮调用 `/api/library/{manga_id}/retry-failed`。
- 日志页面必须调用 `/api/logs`，能展示失败原因、阶段、任务 ID 和 details。
- 左侧菜单必须能切换控制台、下载队列、本地资料库、日志、设置，不能只是视觉按钮。
- 首页输入框不能预置 mock ID 或自动解析示例数据。
- 如改动布局，尽量做桌面和窄屏截图检查。

## 扩展改动后

至少确认：

- `npm run build:extension` 通过。
- `npm run package:extension` 能生成 `dist/wnacg-downloader-extension.zip`。
- manifest 仍符合 MV3。
- popup/options 不依赖硬编码 token。
- 后台未启动时有明确错误提示。
- 提交任务走 `/api/extension/*`，并带扩展 token。

## 文档改动后

至少确认：

- `docs/PROGRESS.md` 反映真实进度。
- 新增约束同步到 `.codex/`。
- API 或状态机变更同步到 `docs/API.md` 和 `docs/DATA_MODEL.md`。
