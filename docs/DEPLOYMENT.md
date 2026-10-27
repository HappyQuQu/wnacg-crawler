# 部署文档

## GitHub Actions 与 Docker Hub

仓库的自动化流程为：

- Pull Request 和手动运行 `CI`：执行 `npm run validate`、上传扩展 ZIP，并在原生 amd64、arm64 runner 上构建和验证镜像。
- 推送 `main`：检查通过后发布 Docker Hub `latest` 和 `sha-<完整提交 SHA>`。
- 推送 `v*.*.*` 标签：发布版本号和主次版本标签，例如 `v2.0.0` 对应 `2.0.0`、`2.0`。
- 手动运行 `Publish Docker image`：通过 `image_tag` 指定标签，默认 `edge`。

在仓库 Settings → Secrets and variables → Actions 中配置：

| 类型 | 名称 | 用途 |
| --- | --- | --- |
| Secret | `DOCKERHUB_USERNAME` | Docker Hub 登录用户名 |
| Secret | `DOCKERHUB_TOKEN` | 有镜像仓库写入权限的访问令牌 |
| Variable（可选） | `DOCKERHUB_NAMESPACE` | Docker Hub 命名空间，默认使用登录用户名 |

镜像地址为 `<命名空间>/wnacg-crawler`。两个架构分别构建，使用镜像 digest 验证内置 Chromium、API、静态首页和 SQLite 文件，再将通过验证的 digest 合并为多架构标签。
镜像验证使用隔离网络和全新数据卷，不访问真实站点或创建下载任务。

本项目发布的镜像为 `evanqu/wnacg-crawler`，支持 amd64/arm64。推荐使用下方的 Docker Compose 部署，也可直接运行：

```bash
docker run -d --name wnacg --restart unless-stopped --shm-size=2g \
  -p 127.0.0.1:8080:8080 \
  -v "$(pwd)/data:/app/data" -v "$(pwd)/config:/app/config" \
  evanqu/wnacg-crawler:latest
```

扩展 ZIP 可在每次成功运行的 `CI` 或发布流程的 Artifacts 中下载。

## Docker Compose

需要 Docker Compose 2.24.0 或更新版本，支持可选的 `.env` 配置文件，参见
[Compose 官方说明](https://docs.docker.com/reference/compose-file/services/#required)。

在项目根目录拉取已发布的镜像并启动：

```bash
docker compose pull
docker compose up -d
```

默认使用 `evanqu/wnacg-crawler:latest`，无需在本地构建或安装 Python、Node.js。
需要固定版本时，将 `docker-compose.yml` 的 `image` 改为对应的已发布版本号或 `sha-<完整提交 SHA>` 标签。

更新到最新镜像：

```bash
docker compose pull
docker compose up -d
```

更新会重建容器，挂载目录中的配置、数据库和下载文件会保留。

访问后台管理：

```text
http://127.0.0.1:8080/
```

健康检查：

```bash
curl http://127.0.0.1:8080/api/health
```

查看状态和日志：

```bash
docker compose ps
docker compose logs -f wnacg
```

停止服务：

```bash
docker compose down
```

## 数据挂载

Compose 会挂载本地目录：

```text
./data   -> /app/data
./config -> /app/config
```

因此数据库、配置、下载文件和 ZIP 会保留在项目目录中。默认路径为：

```text
config/data.sqlite
config/config.local.json
data/Manga
data/Zip
```

## 镜像内容

Docker 镜像采用多阶段构建：

```text
Node stage   -> 构建 frontend/dist
Python stage -> 安装 FastAPI 后端并复制 frontend/dist
```

容器只暴露 `8080`。FastAPI 同时提供：

```text
/             后台管理静态页面
/api/*        后端 API
/ws/progress  任务进度 WebSocket
```

## 注意事项

- 如果宿主机 `8080` 被本地开发服务占用，先停止本地 uvicorn，或修改 `docker-compose.yml` 的端口映射。
- 如果在容器里使用宿主机代理，代理地址不要填 `127.0.0.1`，应使用 Docker 可访问的宿主机地址，例如 Docker Desktop 下的 `host.docker.internal`。
- `config/config.local.json` 是本地配置文件，不提交版本控制。

## 环境配置

不创建 `.env` 也能启动。需要自定义配置时，可复制 `.env.example` 到 `.env`，再编辑需要的项。
Compose 会将 `.env` 中的变量传入容器；浏览器参数也支持用同名系统环境变量覆盖：

```bash
WNACG_ENABLE_BROWSER=false docker compose up -d
```

所有后端变量使用 `WNACG_` 前缀，包括 `WNACG_FETCH_MODE`、`WNACG_ENABLE_BROWSER`、
`WNACG_ENABLE_STEALTH` 和 `WNACG_BROWSER_HEADLESS`。修改 Compose 环境变量后，
运行 `docker compose up -d` 重新创建容器，使新值生效。

后端配置优先级为：系统环境变量 > `.env` > `config/config.local.json` > 内置默认值。
嵌套代理设置逐字段合并，例如 `WNACG_PROXY__PORT` 只覆盖端口，保留 JSON 中的地址和用户名。
容器内的文件路径按 `/app` 工作目录解释，路径应对应挂载后的容器目录。

后台保存配置只更新提交的字段，保留已有爬虫参数和其他配置。环境变量优先控制的字段
会通过保存响应的 `overridden_fields` 和页面提示说明；取消环境覆盖并重启后，JSON 中的值才生效。
`.env.example` 中可由后台修改的参数默认注释，避免复制示例后锁住后台设置。

`WNACG_ENABLE_BROWSER=false` 时，`auto` 模式只使用 HTTP，不再回退到浏览器；
同时设置 `WNACG_FETCH_MODE=browser` 会提示配置冲突。`http` 模式也不会启动浏览器。
