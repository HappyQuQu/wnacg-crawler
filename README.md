# WNACG Downloader

本项目是一个本地下载中枢，目标形态是：

```text
后台管理是核心产品
浏览器扩展是增强入口
CLI/File Watch 是高级入口
```

旧实现已保留在 `old/` 目录，新版本按干净架构重新 scaffold。

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

浏览器扩展：

- Chrome Manifest V3
- TypeScript
- background service worker
- content script
- popup/options

## 目录

```text
backend/      FastAPI 后端
frontend/     后台管理 Web UI
extension/    浏览器扩展
config/       示例配置和本地配置
docs/         产品和开发文档
old/          旧实现参考
```

## 本地开发

后端：

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
alembic upgrade head
uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8080
```

本地运行时也可以不复制 `.env`，默认会读取 `config/config.local.json`，不存在时使用内置默认值。

前端：

```bash
npm install
npm run dev -w frontend
```

扩展：

```bash
npm run build -w extension
```

然后在 Chrome 扩展管理页加载 `extension/` 目录。

如需生成分发包：

```bash
npm run package:extension
```

产物会生成到 `dist/wnacg-downloader-extension.zip`。

一键本地验证：

```bash
npm run validate
```

## Docker 部署

```bash
docker compose up -d --build
```

启动后访问：

```text
http://127.0.0.1:8080/
```

查看状态和日志：

```bash
docker compose ps
docker compose logs -f wnacg
```

## 文档

- `docs/PRD.md`
- `docs/DEVELOPMENT.md`
- `docs/ARCHITECTURE.md`
- `docs/API.md`
- `docs/DATA_MODEL.md`
- `docs/UI_SPEC.md`
- `docs/FLOWS.md`
- `docs/EXTENSION_MANUAL_TEST.md`
- `docs/DEPLOYMENT.md`
