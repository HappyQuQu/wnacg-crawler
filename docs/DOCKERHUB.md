# WNACG 下载器

在电脑或 NAS 上运行 WNACG 下载后台：批量添加作品、查看任务进度、管理本地资料库，并校验图片与 ZIP 的完整性。镜像包含前端、后端和 Chromium，支持 **amd64 / arm64**。

**[项目源码与完整文档](https://github.com/HappyQuQu/wnacg-crawler) · [安装 Chrome 扩展](https://chromewebstore.google.com/detail/ipnoamlkghnlmmbcpombpfbjihiafdbp) · [问题反馈](https://github.com/HappyQuQu/wnacg-crawler/issues)**

## 后台和扩展怎么配合

- **这个 Docker 镜像**提供完整后台，负责下载、校验、保存文件和管理资料库，可独立使用。
- **Chrome 扩展**在 WNACG 详情页和列表页提供加入队列、查询本地状态的入口，需要连接自己部署的后台。

从扩展商店来到这里：先部署下面的后台，再回到扩展填写地址和 Token。已经部署好后台：直接[安装扩展](https://chromewebstore.google.com/detail/ipnoamlkghnlmmbcpombpfbjihiafdbp)，无需从源码构建。

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

在文件所在目录运行：

```bash
docker compose up -d
```

打开 **http://localhost:8080**。部署在 NAS 或服务器上时，将 `localhost` 换成服务器 IP，端口以实际映射为准。无需克隆源码或安装 Python、Node.js。

适合本机或可信内网使用。后台没有登录验证，默认端口映射可供内网访问；仅本机使用时可改为 `127.0.0.1:8080:8080`。扩展 Token 仅用于扩展接口鉴权。

## 安装并连接 Chrome 扩展

1. [在 Chrome 网上应用店安装 WNACG 下载器](https://chromewebstore.google.com/detail/ipnoamlkghnlmmbcpombpfbjihiafdbp)，无需开启开发者模式。
2. 在后台「设置」中生成扩展 Token。
3. 在扩展「连接设置」中填写后台服务地址、后台管理页面地址和 Token。Docker 部署时两个地址通常相同，例如 `http://localhost:8080` 或 `http://服务器IP:8080`。
4. 点击「测试连接」，允许浏览器访问填写的后台地址，连接成功后保存。
5. 在支持的 WNACG 页面加入队列、查看服务器文件和下载记录，或直接打开后台管理。

后台在另一台机器上时，请填写电脑浏览器能访问的服务器 IP 或域名。扩展中的 `127.0.0.1` 指的是运行 Chrome 的电脑。

## 常用功能

- 批量解析 ID 或链接，预检与去重，减少重复添加。
- 任务支持暂停、继续、取消和重试，保留失败原因，补齐缺失文件。
- 资料库区分服务器文件与下载到电脑的记录；清理服务器文件后可保留历史。
- 下载到电脑支持批量发送；默认将大文件拆成每包小于 2 GB 的独立 ZIP，便于阅读器打开。
- 下载参数、代理、图片处理和界面主题都可在后台设置。

## 更新、日志与数据

```bash
# 更新镜像并重建容器
docker compose pull
docker compose up -d

# 查看日志
docker compose logs -f wnacg

# 停止服务
docker compose down
```

`./data` 保存图片、ZIP 和可选原图备份；`./config` 保存设置、SQLite 数据库与下载历史。更新容器会保留这两个挂载目录，备份时请一并保留。

默认镜像为 `evanqu/wnacg-crawler:latest`，也可使用 Tags 中已有的版本或 `sha-<完整提交 SHA>` 固定版本。

[完整使用方法](https://github.com/HappyQuQu/wnacg-crawler#使用方法) · [详细部署指南](https://github.com/HappyQuQu/wnacg-crawler/blob/main/docs/DEPLOYMENT.md) · [扩展连接说明](https://github.com/HappyQuQu/wnacg-crawler#连接后台)
