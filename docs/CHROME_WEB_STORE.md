# Chrome 商店资料

- 扩展名称：WNACG 下载器
- 扩展 ID：`ipnoamlkghnlmmbcpombpfbjihiafdbp`
- 安装地址：https://chromewebstore.google.com/detail/ipnoamlkghnlmmbcpombpfbjihiafdbp
- 首页网址：https://github.com/HappyQuQu/wnacg-crawler
- 支持网址：https://github.com/HappyQuQu/wnacg-crawler/issues
- 隐私政策：https://gist.github.com/HappyQuQu/d0746e70758d046ca7baa0268e09672a
- 成人内容：开启

## 商店说明

WNACG Downloader 的浏览器配套扩展，用于连接用户自行部署的后台，在支持的 WNACG 页面提交作品任务并查看处理状态。使用前需要启动后台并配置地址和 Token。

项目与后台部署：https://github.com/HappyQuQu/wnacg-crawler
Docker 镜像：https://hub.docker.com/r/evanqu/wnacg-crawler

扩展提供的功能
• 在 wnacg.com、wnacg.org 的详情页与列表页识别作品 ID，提供加入队列入口。
• 用户点击加入队列或右键提交时，将作品 ID、页面链接和标题发送到自己配置的后台。
• 查询后台任务进度、服务器文件状态和下载到电脑的记录；状态可自动刷新。
• 打开用户配置的后台管理页面，在连接设置中访问项目主页与部署说明。

后台负责的功能
实际作品下载、图片校验、本地文件保存与 ZIP 打包由后台执行。后台可独立使用；扩展需要连接后台。扩展安装包不包含作品图片、视频或内置作品目录。

首次使用
1. 按项目文档部署后台，在后台设置中生成扩展 Token。
2. 在扩展连接设置中填写后台服务地址、管理页面地址和 Token。
3. 点击测试连接，允许访问对应后台主机，连接成功后保存。
4. 打开支持的站点页面，按需加入队列。

本机 Docker 部署默认地址为 http://localhost:8080。连接 NAS 或服务器时，请填写电脑浏览器可以访问的服务器 IP 或域名。

数据与权限
后台地址与 Token 保存在浏览器本机。作品信息和鉴权 Token 只发送到用户指定的后台。扩展按需申请自定义后台主机权限；不包含广告、分析追踪服务或远程执行代码。

本扩展专用于 WNACG 站点，该站点可能包含成人内容，仅供成年人使用。请仅处理有权访问、保存的内容，并遵守适用法律及站点规则。

问题反馈：https://github.com/HappyQuQu/wnacg-crawler/issues

## 审核测试说明

Grey Lithium resubmission: 2.0.1 adds help links/styles; WNACG integration remains. No work images/videos are bundled. Clicking Submit sends ID/URL/title to a self-hosted backend that downloads the work. The site may contain adult content; Mature is enabled. Please reassess this workflow. Test: deploy per https://github.com/HappyQuQu/wnacg-crawler , generate Token, enter backend/admin URLs and Token in extension settings, test/save. Metadata clarified; site integration was not removed.
