# Chrome 商店资料

- 扩展名称：WNACG 下载器
- 扩展 ID：`ipnoamlkghnlmmbcpombpfbjihiafdbp`
- 安装地址：https://chromewebstore.google.com/detail/ipnoamlkghnlmmbcpombpfbjihiafdbp
- 首页网址：https://github.com/HappyQuQu/wnacg-crawler
- 支持网址：https://github.com/HappyQuQu/wnacg-crawler/issues
- 隐私政策：https://gist.github.com/HappyQuQu/d0746e70758d046ca7baa0268e09672a
- 成人内容：开启

## 商店说明

WNACG Downloader 的浏览器配套扩展。连接自己部署的下载后台，在浏览站点时提交作品任务、查看任务进度和本地资料库状态。

项目与后台部署：https://github.com/HappyQuQu/wnacg-crawler
Docker 镜像：https://hub.docker.com/r/evanqu/wnacg-crawler

主要功能
• 在 WNACG 详情页和列表页识别作品，点击加入后台队列。
• 显示服务器是否已有文件、是否下载到电脑，帮助避免重复提交。
• 在弹窗中查看进行中的任务和需要处理的问题。
• 通过右键菜单提交作品链接，打开后台管理页面。
• 在连接设置中直接访问项目主页与后台部署说明。

使用步骤
1. 按项目文档部署 WNACG Downloader 后台，在后台设置中生成扩展 Token。
2. 在扩展连接设置中填写后台服务地址、管理页面地址和 Token。
3. 点击测试连接，允许访问所填写的后台主机，连接成功后保存。
4. 打开 wnacg.com 或 wnacg.org 的作品详情页或列表页，按需加入队列。

本机 Docker 部署默认地址为 http://localhost:8080。连接 NAS 或服务器时，填写浏览器能够访问的服务器 IP 或域名。

扩展负责识别页面、提交任务和查询状态；实际下载、图片校验、文件保存和 ZIP 打包由用户部署的后台执行。只安装扩展还不能下载。状态查询可以自动刷新，任务由用户点击提交。

连接配置保存在浏览器本机。作品 ID、页面链接、标题和鉴权 Token 按功能需要发送到用户指定的后台。自定义后台仅按需申请对应主机权限。扩展不包含广告、分析追踪服务或远程执行代码。

问题反馈：https://github.com/HappyQuQu/wnacg-crawler/issues

## 审核测试说明

Requires a self-hosted WNACG Downloader backend. Deploy per https://github.com/HappyQuQu/wnacg-crawler . Generate an Extension Token in backend settings. Set backend/admin URLs and Token in extension settings, grant the backend host, then test/save. On wnacg.com or wnacg.org detail/list pages, clicking Join Queue sends work ID/URL/title to the backend for downloading. Status queries do not create tasks. 2.0.1 adds project/setup links. This resubmission updates listing text only.
