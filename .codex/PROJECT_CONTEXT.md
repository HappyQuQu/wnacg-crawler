# 项目上下文

## 产品定位

WNACG Downloader 是一个本地下载中枢。目标形态：

```text
后台管理是核心产品
浏览器扩展是增强入口
CLI/File Watch 是高级入口
```

后台管理必须独立可用；浏览器扩展只负责识别页面和投喂任务，不承担下载、校验、打包或数据库写入。

## 当前阶段

截至 2026-05-27：

- 项目已从旧 MVP 结构迁移到新架构。
- 旧实现保留在 `old/` 作为参考，不要随意删除。
- 新结构已包含 `backend/`、`frontend/`、`extension/`、`docs/`、`config/`。
- 后端已有真实任务持久化、`TaskRunner` 后台执行器、真实 `LibraryService`、状态流转校验和配置持久化。
- 前端首屏已接入真实 API、资料库列表、资料库文件级详情、失败图片重试、图片地址重新解析、WebSocket 实时进度、任务控制按钮和设置面板。
- 扩展 MVP 代码已可构建，options/popup/background 已接入本地后台 API，仍需 Chrome 手动加载验收。
- 暂停/取消会在 `TaskRunner` 阶段检查点生效，但不能强制打断正在等待中的单个 HTTP 请求。

最新状态以 `docs/PROGRESS.md` 为准。

## 技术栈

后端：

- Python 3.12
- FastAPI
- SQLAlchemy Async
- SQLite
- Pydantic Settings
- httpx
- BeautifulSoup4/lxml
- Alembic

前端：

- Vite
- React
- TypeScript
- lucide-react

扩展：

- Chrome Manifest V3
- TypeScript
- background service worker
- content script
- popup/options

## 运行地址

本地开发默认：

```text
Backend:  http://127.0.0.1:8080
Frontend: http://127.0.0.1:5173
```

后端默认只监听本地地址。除非用户明确要求，不要改成局域网或公网监听。

## 关键产品原则

1. UI 展示状态必须来自后端持久化状态，避免假数据。
2. 下载完成必须经过完整性校验，不能只因协程结束就标记完成。
3. 文件系统操作要幂等：重复运行只补缺，不破坏已有有效文件。
4. 任务失败要可恢复，要能看到失败原因和重试入口。
5. 文件目录必须包含漫画 ID，避免同名覆盖。

目录格式：

```text
Manga/[123456] title
Zip/[123456] title.zip
```
