# 部署文档

## Docker Compose

构建并启动：

```bash
docker compose up -d --build
```

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
