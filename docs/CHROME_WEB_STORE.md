# Chrome 商店资料

- 扩展名称：WNACG 下载器
- 扩展 ID：`ipnoamlkghnlmmbcpombpfbjihiafdbp`
- 安装地址：https://chromewebstore.google.com/detail/ipnoamlkghnlmmbcpombpfbjihiafdbp
- 首页网址：https://github.com/HappyQuQu/wnacg-crawler
- 支持网址：https://github.com/HappyQuQu/wnacg-crawler/issues
- 隐私政策：https://gist.github.com/HappyQuQu/d0746e70758d046ca7baa0268e09672a
- 成人内容：开启

## 商店说明

这是开源项目 WNACG Downloader 的配套扩展。使用前请先部署下载后台，再在扩展中填写后台地址和 Token。

后台项目与安装说明：
https://github.com/HappyQuQu/wnacg-crawler

Docker 镜像与快速部署：
https://hub.docker.com/r/evanqu/wnacg-crawler

已经装好扩展，但还没有后台？打开上面的项目或 Docker Hub 链接，按 Docker Compose 步骤启动后台即可。镜像包含完整前端、后端和 Chromium，无需安装 Python、Node.js 或克隆源码。

主要功能
• 在支持的 WNACG 详情页和列表页识别作品，点击加入后台下载队列。
• 显示服务器是否已有文件、是否下载到电脑，减少重复提交。
• 在扩展弹窗查看任务进度、需要处理的任务和当前作品状态。
• 通过右键菜单提交页面或链接，随时打开后台管理。
• 支持本机、NAS、局域网或用户指定的 HTTP/HTTPS 后台。

首次连接
1. 按项目文档部署后台，并在后台「设置」中生成扩展 Token。
2. 打开扩展「连接设置」，填写后台服务地址、后台管理页面地址和 Token。Docker 部署时两个地址通常相同。
3. 点击「测试连接」，允许访问所填写的后台地址，连接成功后保存。
4. 打开支持的 wnacg.com 或 wnacg.org 页面，使用加入队列入口。

本机 Docker 部署默认使用 http://localhost:8080。后台部署在 NAS 或服务器上时，请填写电脑浏览器能访问的服务器 IP 或域名；扩展中的 localhost / 127.0.0.1 指的是运行 Chrome 的电脑。

后台与扩展的分工
后台可以独立使用，负责下载、图片完整性校验、文件保存和 ZIP 打包。扩展负责页面入口、任务提交和状态查询。只安装扩展还不能下载；已有后台时无需再部署一份。

数据与权限
连接设置保存在浏览器本机。提交任务时，作品 ID、页面网址及标题会发送到用户配置的后台；Token 用于该后台鉴权。自定义后台只按需申请对应主机的访问权限。扩展不包含广告、分析追踪服务或远程执行代码。

本扩展专用于可能包含成人内容的 WNACG 站点，仅供成年人使用。请仅处理有权访问、保存的内容，并遵守适用法律及站点规则。

使用问题与反馈：
https://github.com/HappyQuQu/wnacg-crawler/issues
