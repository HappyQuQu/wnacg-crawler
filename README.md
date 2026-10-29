# WNACG 下载器

<img src="extension/icons/icon.svg" alt="WNACG" width="64" height="64">

通过 Web 后台批量下载 WNACG 作品，查看任务进度、管理本地资料库，并校验图片与 ZIP 的完整性。搭配 Chrome 扩展，可从站点页面直接添加任务。

**Docker 一键部署 · amd64 / arm64 · 可恢复下载 · 可选浏览器扩展**

[快速部署](#快速部署) · [使用方法](#使用方法) · [界面预览](#界面预览) · [浏览器扩展](#浏览器扩展) · [配置与数据](#配置与数据) · [本地开发](#本地开发) · [文档](#文档)

当前为 **2.0 开发版本**，后台可独立使用。

## 快速部署

安装 Docker 和 Docker Compose，将以下内容保存为 `docker-compose.yml`：

```yaml
services:
  wnacg:
    image: evanqu/wnacg-crawler:latest
    ports:
      - "8080:8080"
    volumes:
      - ./data:/app/data
      - ./config:/app/config
    restart: unless-stopped
```

在文件所在目录执行：

```bash
docker compose up -d
```

打开 **[http://localhost:8080](http://localhost:8080)** 即可使用。部署在服务器上时，将 `localhost` 换成服务器 IP。

镜像已包含前端、后端和 Chromium，支持 amd64 / arm64，无需安装 Python、Node.js 或克隆源码。下载参数在后台「设置」中调整。

### 更新与管理

```bash
# 更新镜像并重建容器
docker compose pull
docker compose up -d

# 查看日志
docker compose logs -f wnacg

# 停止服务
docker compose down
```

`data/` 和 `config/` 保存在宿主机当前目录，更新或重建容器不会删除其中的数据。需要固定版本时，将 `latest` 换成已发布的版本号或 `sha-<完整提交 SHA>` 标签。

> 适合本机或可信内网使用。后台没有登录验证，默认端口映射可供内网访问；仅本机使用可改为 `127.0.0.1:8080:8080`。扩展 Token 仅用于扩展接口鉴权。

部署和镜像发布细节见[部署指南](docs/DEPLOYMENT.md)。

## 主要功能

| 功能 | 说明 |
| --- | --- |
| 批量添加 | 支持漫画 ID 和链接，预检输入、去重并查询本地状态 |
| 任务管理 | 查看阶段进度，暂停、继续、取消、重试，重启后恢复未完成任务 |
| 本地资料库 | 查看文件明细、校验与补全，支持批量下载到电脑 |
| 下载记录 | 自动记录已下载到电脑的作品，按「已下载 / 未下载」筛选，支持批量补记 |
| 释放空间 | 清理服务器图片和 ZIP，保留资料库记录及下载历史，之后可重新下载 |
| 完整性校验 | 检查元信息、页面解析、图片及 ZIP，保留缺失和失败原因 |
| 图片处理 | 可选压缩、分辨率调整和原图备份，默认关闭压缩 |
| 运行日志 | 按级别或任务筛选，实时更新，展开和复制错误详情 |
| 外观设置 | 浅色、深色和跟随系统，支持封面模糊 |
| 浏览器扩展 | 从详情页或列表页提交任务，区分服务器文件和电脑下载记录，打开后台 |

重复下载会复用已有有效文件、补齐缺失内容；保存目录包含漫画 ID，避免同名覆盖。

## 使用方法

1. **设置下载参数**：在「设置」中确认下载路径、代理、并发数和 ZIP 选项。
2. **批量添加作品**：输入 ID 或链接，每行一项，点击「解析预检」。
3. **加入队列**：确认预检结果后提交，在「下载任务」中查看进度或暂停、重试。
4. **下载到电脑**：在「资料库」中点击「下载到电脑」；批量下载时，每项作品分别下载为独立文件。文件发送完成后自动更新为「已下载」。
5. **排查问题**：在「日志」中按任务或级别筛选，展开错误详情。

「解析预检」仅查询本地记录；「加入队列」会访问站点并写入下载目录。图片缺失、校验失败或 ZIP 不完整时，任务会保留为部分完成或失败，方便继续补全。

### 下载记录与空间清理

资料库分别记录「服务器上是否有文件」和「是否下载到电脑」。任务完成表示服务器文件准备好了；卡片上的「已下载 / 未下载」用于区分哪些作品已经下载到电脑。

- **找出还没下载的作品**：筛选「未下载」，可批量下载。自动记录以服务器正常发送完文件为准；若浏览器保存失败，可手动改为「未下载」。
- **补记以前下载过的作品**：选中作品，点击「标为已下载」。升级前的下载无法自动追溯，需要补记一次。
- **服务器空间不足**：选中作品，点击「清理文件」。图片、原图备份和 ZIP 会从服务器删除，作品记录及下载历史仍保留，并显示「已清理」。需要时可重新下载到服务器。
- **彻底移除作品**：使用删除操作会同时移除资料记录；只想释放空间时请选择「清理文件」。

下载历史保存在 `config/data.sqlite`，备份时请一并保留。扩展也会显示服务器文件及电脑下载状态，便于在原站识别已经处理过的作品。

## 界面预览

截图展示深色界面，使用隔离环境中的示例记录和示意封面；部分截图来自较早版本，标题、图标和状态文字以当前界面为准。

![概览：任务统计、运行状态和最近活动](docs/screenshots/dashboard-dark.png)

### 批量添加

![批量预检：识别有效、重复和无效输入](docs/screenshots/add-task-dark.png)

### 下载任务与日志

| 下载任务 | 运行日志 |
| --- | --- |
| ![任务筛选、阶段进度和详情](docs/screenshots/tasks-dark.png) | ![问题筛选和错误详情](docs/screenshots/logs-dark.png) |

### 资料库与作品详情

| 本地资料库 | 作品详情 |
| --- | --- |
| ![作品卡片、完整度和批量选择](docs/screenshots/library-dark.png) | ![封面、文件明细和维护操作](docs/screenshots/library-detail-dark.png) |

### 设置

![外观、存储路径与保存状态](docs/screenshots/settings-dark.png)

![图片压缩、代理和扩展连接设置](docs/screenshots/settings-details-dark.png)

## 浏览器扩展

扩展是可选入口，需要先启动后台。

### 下载与安装

1. 打开 [GitHub Actions](https://github.com/HappyQuQu/wnacg-crawler/actions/workflows/dockerhub.yml)，选择一次成功的发布运行。
2. 在 **Artifacts** 中下载 `wnacg-downloader-extension`，解压得到 `wnacg-downloader-extension.zip`，再将该 ZIP 解压到一个固定目录。
3. 打开 `chrome://extensions/`，启用「开发者模式」。
4. 点击「加载已解压的扩展程序」，选择包含 `manifest.json` 的目录。
5. 在后台「设置」中生成扩展 Token，填写到扩展设置页，测试连接并保存。浏览器请求访问后台地址时，点击「允许」。

默认连接配置：

| 配置 | 值 |
| --- | --- |
| 后台服务地址 | `http://127.0.0.1:8080` |
| 后台管理页面地址 | `http://127.0.0.1:8080` |
| Extension Token | 后台生成的 Token |

扩展默认支持 `wnacg.com`、`wnacg.org` 和本机后台。连接内网后台时，填写服务器地址，在「保存」或「测试连接」时授予该地址的访问权限即可，无需修改扩展文件。使用其他原站域名时，仍需调整 `manifest.json` 的站点匹配规则并重新加载。详细步骤见[扩展验收指南](docs/EXTENSION_MANUAL_TEST.md)。

### 扩展界面

![扩展弹窗：连接状态、当前作品和任务进度](docs/screenshots/extension-popup-dark.png)

![扩展设置：后台地址、Token 和连接测试](docs/screenshots/extension-settings-dark.png)

也可以从源码构建，需 Node.js 24 LTS 和 npm：

```bash
npm ci
npm run package:extension
```

产物为 `dist/wnacg-downloader-extension.zip`，解压后按上述步骤加载。

## 配置与数据

常用参数直接在后台「设置」中修改，无需准备 `.env`。默认文件布局：

```text
config/
  config.local.json          后台保存的配置
  data.sqlite                任务、资料库、下载历史和日志数据库
data/
  Manga/[123456] title/      图片文件
  Zip/[123456] title.zip     ZIP 归档
  Original/[123456] title/   原图备份（按配置生成）
```

容器内 `/app/data` 对应宿主机 `./data`，`/app/config` 对应 `./config`。修改下载路径时，需要同时确认挂载位置；备份时保留这两个目录。

高级配置支持环境变量，优先级为：

```text
系统环境变量 > .env > config/config.local.json > 内置默认值
```

本地开发时，后端自动读取项目根目录的 `.env`；Docker 部署需要在 Compose 中添加 `env_file` 或 `environment`，具体见[环境配置](docs/DEPLOYMENT.md#环境配置)。环境变量覆盖后台设置时，页面会显示提示。

配置示例：[.env.example](.env.example) · [config/config.example.json](config/config.example.json)。

## 本地开发

需要 **Python 3.12、Node.js 24 LTS（最低 24.22.1）、npm**，完整验证及扩展打包还需要 Bash 和 `zip`。以下命令在项目根目录执行。

### 后端

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -e ".[dev]"
[ -f .env ] || cp .env.example .env
python -m playwright install chromium
alembic upgrade head
uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8080
```

以上激活命令适用于 macOS / Linux。Linux 缺少 Chromium 系统依赖时，使用 `python -m playwright install --with-deps chromium`。

### 前端

在另一个终端执行；使用 nvm 时可先运行 `nvm install && nvm use`：

```bash
npm ci
npm run dev:frontend
```

访问 [http://127.0.0.1:5173](http://127.0.0.1:5173)。API 和 WebSocket 请求会代理到本机 8080 后端；本地开发时，将扩展的后台管理页面地址设为此地址。

### 构建与验证

```bash
# 前端构建，构建后也可通过后端 8080 端口访问
npm run build:frontend

# 扩展打包
npm run package:extension

# 完整检查：后端、数据库迁移、前端和扩展
npm run validate

# 从源码构建 Docker 镜像
docker build --pull -t wnacg-crawler:local .
```

GitHub Actions 会在推送 `main` 后执行检查并发布多架构镜像，也支持版本标签和手动发布。流程及所需变量见[自动构建与发布](docs/DEPLOYMENT.md#github-actions-与-docker-hub)。

## 常见问题

| 问题 | 处理方式 |
| --- | --- |
| 8080 端口被占用 | 修改 Compose 左侧的宿主机端口，并同步调整扩展地址及权限 |
| 后台保存设置后没有生效 | 检查系统环境变量或 `.env` 覆盖，取消覆盖后重启服务 |
| 容器无法连接宿主机代理 | 容器内 `127.0.0.1` 指向自身；Docker Desktop 可用 `host.docker.internal`，其他环境使用容器可访问的宿主机地址 |
| 扩展连接失败 | 检查后台地址和 Token；局域网地址在扩展连接设置中点击“测试连接”，允许访问该后台；显示“待授权”时无需重启后台 |
| 图片已下载，任务仍未完成 | 查看文件明细和日志，检查缺失图片、校验失败或 ZIP 不完整的原因 |
| 以前下载过，仍显示「未下载」 | 升级前的电脑下载没有历史记录；选中这些作品，批量「标为已下载」。新下载会自动记录 |
| 服务器空间不足，又想保留历史 | 使用资料库「清理文件」，保留作品和下载记录；不要使用删除资料操作 |

## 文档

- [部署指南](docs/DEPLOYMENT.md) · [开发文档](docs/DEVELOPMENT.md) · [项目进度](docs/PROGRESS.md)
- [产品需求](docs/PRD.md) · [技术架构](docs/ARCHITECTURE.md) · [UI 规格](docs/UI_SPEC.md)
- [API 契约](docs/API.md) · [数据模型](docs/DATA_MODEL.md) · [核心流程](docs/FLOWS.md)
- [扩展验收指南](docs/EXTENSION_MANUAL_TEST.md) · [工程规则](AGENTS.md)

欢迎通过 Issue 提交复现步骤、运行环境和脱敏日志。提交代码前请运行 `npm run validate`。

## 许可证

[MIT License](LICENSE)。

仓库内 `.codex/skills/ui-ux-pro-max/` 来自 [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)，原始许可证和版权声明保留在[第三方许可证](.codex/skills/ui-ux-pro-max/LICENSE)中。
