# WNACG Downloader 产品需求文档

版本：v0.1  
日期：2026-05-26  
状态：草案  
项目定位：本地下载中枢 + 后台管理 + 浏览器扩展增强入口

## 1. 背景

当前项目从原命令行工具演进而来。命令行版本以 `wnacg.txt` 作为批量输入源，具备批量下载、断点补全、失败日志、完整性检查、打包等能力。新的 Web 项目探索了“内置浏览器 + 下载队列”的交互，但内置代理浏览器存在安全边界复杂、站点结构易变、移动端体验弱、维护成本高等问题。

后续产品应从“带下载按钮的浏览器”转向“本地下载中枢”。后台管理页面作为核心产品独立可用，用户可以直接输入 ID 或 URL 完成下载；浏览器扩展作为增强入口，负责在真实浏览器中识别当前页面并投喂任务。

## 2. 产品目标

### 2.1 核心目标

1. 后台管理页面不依赖浏览器扩展，支持手动输入 ID、URL、批量文本、导入文件完成下载。
2. 浏览器扩展作为可选增强入口，支持从原站详情页、列表页、搜索页快速发送下载任务到本地后台。
3. 下载流程具备可靠的任务状态、失败恢复、断点续传、完整性检查和打包控制。
4. 用户可以管理本地资料库，查看已下载内容、完整度、保存路径、ZIP 状态和失败原因。
5. 保留命令行批处理思路，未来可通过 CLI/API/File Watch 等入口复用同一套下载核心。

### 2.2 非目标

1. 不将内置代理浏览器作为主流程。
2. 不在浏览器扩展内实现下载逻辑。
3. 不把后台管理做成资源站的完整替代前端。
4. 不在 MVP 阶段实现账号体系、多用户权限或云同步。

## 3. 用户画像

### 3.1 普通下载用户

用户知道漫画 ID 或详情页链接，希望快速添加任务并下载到本地。关注简单、稳定、能失败重试。

### 3.2 批量整理用户

用户有一批 ID 或链接，可能来自文本文件、收藏列表、旧命令行工具。关注批量导入、去重、预检、完整性检查和日志。

### 3.3 浏览发现用户

用户习惯在真实浏览器中浏览原站，希望看到喜欢的内容后点一下加入下载。关注浏览器扩展的一键添加、本页批量添加、状态提示。

### 3.4 本地收藏管理用户

用户已经下载了大量内容，需要查看本地资料库、搜索、打开目录、重新打包、补全缺失图片。

## 4. 产品形态

### 4.1 后台管理

后台管理是核心产品，运行在本地服务上，例如：

```text
http://127.0.0.1:8080
```

后台管理应完整支持：

- 手动添加任务
- 批量粘贴 ID/URL
- 导入文本文件
- 任务预检
- 下载队列管理
- 失败重试
- 完整性检查
- ZIP 打包
- 本地资料库
- 设置管理

### 4.2 浏览器扩展

浏览器扩展是增强入口。它负责：

- 识别当前页面是否为可下载内容
- 从详情页提取 ID
- 从列表页提取多个 ID
- 提交任务到本地后台
- 显示当前内容的下载状态
- 打开后台管理页面

扩展不负责：

- 下载图片
- 写本地文件
- 管理数据库
- 执行打包

### 4.3 CLI/API/File Watch

后续可保留高级入口：

- CLI：适合自动化和批处理
- HTTP API：适合扩展、脚本和第三方工具调用
- File Watch：监听 `wnacg.txt` 或指定目录，自动导入新 ID

## 5. 信息架构

后台管理页面分为 5 个一级模块：

```text
1. 添加任务
2. 下载队列
3. 失败恢复
4. 本地资料库
5. 设置
```

推荐导航结构：

```text
侧边栏
- 添加
- 队列
- 失败
- 资料库
- 设置
```

也可以在 MVP 阶段采用顶部 Tab：

```text
添加 | 队列 | 资料库 | 设置
```

## 6. 核心流程

### 6.1 手动添加流程

用户进入后台管理，输入一个或多个 ID/URL：

```text
123456
https://www.wnacg.com/photos-index-page-1-aid-123457.html
123458, 123459
```

系统执行：

1. 解析输入，提取 ID。
2. 去重。
3. 查询本地数据库是否已有记录。
4. 拉取或读取元信息。
5. 展示预检结果。
6. 用户确认后加入下载队列。

预检结果示例：

```text
ID       标题       页数       状态
123456   A          40        未下载
123457   B          36        已存在，缺 3 张
123458   -          -         识别失败
```

### 6.2 批量导入流程

用户拖入或选择 `.txt` 文件，系统读取其中的 ID/URL。

要求：

- 支持换行、空格、逗号、中文逗号分隔。
- 支持混合 ID 和 URL。
- 自动去重。
- 展示有效项、重复项、无效项。
- 用户可选择“仅添加未下载”“补全缺失”“全部加入”。

### 6.3 扩展添加流程

用户在真实浏览器访问原站，扩展识别页面内容。

详情页：

1. 扩展识别当前 manga_id。
2. Popup 显示标题、ID、状态。
3. 用户点击“加入队列”。
4. 扩展发送任务到后台。
5. 后台返回任务状态。
6. Popup 显示“已加入”或“已存在”。

列表页：

1. 扩展解析当前页面所有作品 ID。
2. 用户点击“加入本页全部”。
3. 扩展提交批量任务。
4. 后台将任务加入待确认或队列。

### 6.4 下载流程

任务进入队列后，系统按状态推进：

```text
pending -> fetching_info -> fetching_pages -> resolving_images -> downloading -> verifying -> zipping -> completed
```

异常状态：

```text
failed
partial
cancelled
paused
```

系统要求：

- 每个阶段都有明确状态。
- 失败时记录失败阶段、错误信息、重试次数。
- 下载图片后校验文件大小和图片格式。
- 只在图片完整时执行 ZIP。
- ZIP 失败不应覆盖下载完成状态，应单独记录打包失败。

### 6.5 失败恢复流程

用户进入“失败”页面，可以看到：

- 失败任务
- 缺失目录页
- 缺失图片详情页
- 缺失图片文件
- ZIP 失败项

用户可执行：

- 重试当前任务
- 只重试失败图片
- 重新解析图片地址
- 重新获取目录页
- 重新打包

### 6.6 本地资料库流程

下载完成或部分完成的项目进入资料库。

资料库展示：

- 封面
- 标题
- ID
- 图片数量
- 完整度
- ZIP 状态
- 下载时间
- 保存路径

用户可操作：

- 打开目录
- 打开 ZIP 所在目录
- 重新校验
- 重新打包
- 继续补全
- 删除任务记录

删除文件属于高风险操作，MVP 阶段不默认提供，或必须二次确认。

## 7. 页面需求

### 7.1 添加任务页

#### 功能

- 多行输入 ID/URL。
- 粘贴后自动解析。
- 支持“解析”按钮。
- 支持拖入 `.txt`。
- 显示预检列表。
- 支持批量选择。
- 支持加入队列。

#### 字段

预检列表字段：

- 选择框
- ID
- 标题
- 封面
- 页数
- 本地状态
- 操作

本地状态：

- 未下载
- 下载中
- 已完成
- 部分完成
- 解析失败

### 7.2 下载队列页

#### 功能

- 展示进行中和待处理任务。
- 实时进度更新。
- 支持暂停、继续、取消、重试。
- 支持查看任务详情。

#### 字段

- ID
- 标题
- 阶段
- 图片进度
- 速度
- 重试次数
- 当前错误
- 创建时间
- 操作

### 7.3 任务详情页

#### 功能

- 展示任务完整生命周期。
- 展示目录页列表。
- 展示图片详情页列表。
- 展示图片文件列表。
- 展示失败日志。
- 支持针对阶段重试。

### 7.4 失败页

#### 功能

- 汇总所有失败项。
- 按失败类型过滤。
- 支持批量重试。
- 支持导出失败列表。

失败类型：

- 元信息获取失败
- 目录页获取失败
- 图片地址解析失败
- 图片下载失败
- 图片校验失败
- ZIP 失败

### 7.5 资料库页

#### 功能

- 封面网格或表格模式。
- 搜索 ID/标题。
- 按状态过滤。
- 按下载时间排序。
- 打开目录。
- 继续补全。
- 重新打包。

### 7.6 设置页

#### 功能

- 下载目录
- 数据库目录
- 并发数
- 请求间隔
- 重试次数
- 超时时间
- 是否打包 ZIP
- 代理配置
- 浏览器扩展配对
- API Token 管理

设置需要校验，不允许保存明显非法值。

## 8. 浏览器扩展需求

### 8.1 支持平台

优先支持 Chromium 内核浏览器：

- Chrome
- Edge
- Brave

后续可评估 Firefox。

### 8.2 扩展组件

```text
manifest.json
background service worker
content script
popup page
options page
```

### 8.3 Content Script

负责：

- 识别当前页面类型。
- 提取当前页面 ID。
- 提取列表页多个 ID。
- 在页面注入轻量按钮。
- 向 background 发送结构化数据。

页面类型：

- 详情页
- 列表页
- 搜索结果页
- 作者/标签页
- 未识别页面

### 8.4 Popup

Popup 显示：

- 后台连接状态
- 当前页面识别结果
- 当前 ID 本地状态
- 加入队列按钮
- 加入本页全部按钮
- 打开后台按钮

### 8.5 Background

负责：

- 保存后台地址。
- 保存配对 Token。
- 与后台 API 通信。
- 创建右键菜单。
- 处理跨页面消息。

### 8.6 右键菜单

支持：

- 发送当前页面到 Downloader
- 发送当前链接到 Downloader
- 打开后台管理

## 9. 安全需求

### 9.1 本地 API 保护

后台服务默认监听：

```text
127.0.0.1
```

不要默认暴露到公网或局域网。

扩展调用后台 API 时必须携带 Token：

```text
X-Extension-Token: <token>
```

### 9.2 扩展配对

首次使用扩展时：

1. 扩展请求配对。
2. 后台生成一次性配对码。
3. 用户在后台确认。
4. 后台返回长期 Token。
5. 扩展保存 Token 到浏览器本地存储。

MVP 可简化为：

- 后台生成固定本地 Token。
- 用户复制到扩展设置页。

### 9.3 CORS

后台只允许：

- 本地后台页面
- 已配对扩展 origin

禁止任意网页直接调用任务接口。

### 9.4 输入校验

所有 ID、URL、文件名、路径都必须校验。

要求：

- manga_id 仅允许数字。
- URL 仅允许白名单域名。
- 文件名必须清理非法字符。
- 下载目录必须可写。
- 配置保存前必须通过 schema 校验。

### 9.5 高风险操作确认

以下操作需要二次确认：

- 删除本地文件
- 清空任务历史
- 覆盖 ZIP
- 修改下载根目录

## 10. 数据模型

### 10.1 MangaInfo

```text
id
title
cover_url
page_count
pic_count
status
is_finished
is_error
created_at
updated_at
last_error
```

### 10.2 MangaPage

```text
id
manga_id
page_index
page_url
page_name
page_context
status
error_message
created_at
updated_at
```

### 10.3 MangaPicPage

```text
id
manga_id
page_index
page_url
pic_index
pic_num
pic_url
status
error_message
created_at
updated_at
```

### 10.4 DownloadFile

```text
id
manga_id
pic_page_id
file_path
file_name
file_size
content_type
checksum
status
error_message
created_at
updated_at
```

### 10.5 DownloadTask

```text
id
manga_id
source
status
stage
priority
progress_current
progress_total
retry_count
created_at
started_at
finished_at
last_error
```

source 示例：

```text
manual
batch_text
file_import
extension
cli
file_watch
api
```

### 10.6 AppConfig

```text
download_path
db_path
is_zip
max_concurrency
request_delay_ms
retry_count
timeout_seconds
user_agent
proxy
extension_token
```

## 11. API 需求

### 11.1 后台管理 API

```text
POST /api/inputs/parse
POST /api/tasks
POST /api/tasks/batch
GET  /api/tasks
GET  /api/tasks/{task_id}
POST /api/tasks/{task_id}/pause
POST /api/tasks/{task_id}/resume
POST /api/tasks/{task_id}/retry
POST /api/tasks/{task_id}/cancel
GET  /api/library
GET  /api/library/{manga_id}
POST /api/library/{manga_id}/verify
POST /api/library/{manga_id}/zip
GET  /api/config
POST /api/config
```

### 11.2 扩展 API

```text
GET  /api/extension/status
POST /api/extension/pair
POST /api/extension/submit
POST /api/extension/submit-many
GET  /api/extension/item/{manga_id}
```

### 11.3 WebSocket

```text
GET /ws/progress
```

消息示例：

```json
{
  "type": "task_progress",
  "task_id": "uuid",
  "manga_id": "123456",
  "stage": "downloading",
  "current": 12,
  "total": 40
}
```

## 12. 状态定义

### 12.1 任务状态

```text
pending
queued
running
paused
partial
completed
failed
cancelled
```

### 12.2 阶段状态

```text
fetching_info
fetching_pages
resolving_images
downloading
verifying
zipping
done
```

### 12.3 文件状态

```text
missing
downloading
valid
invalid
failed
```

## 13. 下载可靠性要求

1. 下载前检查是否已有有效文件。
2. 已有文件需要满足最小大小和图片格式校验。
3. 无效文件应重新下载。
4. 下载失败不能标记任务完成。
5. 部分成功应标记为 `partial`。
6. ZIP 前必须校验图片完整度。
7. 任务可重复运行，重复运行应补缺而不是覆盖所有内容。
8. 同名漫画目录必须加入 ID 避免冲突，例如：

```text
Manga/[123456] title
Zip/[123456] title.zip
```

## 14. 配置需求

配置字段：

```text
download_path
is_zip
max_thread
re_count
request_delay_ms
timeout_seconds
proxy.is_proxy
proxy.address
proxy.port
proxy.username
proxy.password
```

配置保存要求：

- 保存前 schema 校验。
- `max_thread` 范围建议 1 到 20。
- `request_delay_ms` 范围建议 0 到 10000。
- `timeout_seconds` 范围建议 5 到 120。
- 代理端口范围 1 到 65535。
- 配置保存失败不能破坏旧配置。
- 热重载失败应回滚到旧配置。

## 15. 非功能需求

### 15.1 性能

- 后台页面打开时间小于 2 秒。
- 任务列表 1000 条以内滚动流畅。
- 下载并发可配置。
- 图片下载应受全局并发和请求间隔控制。

### 15.2 稳定性

- 服务重启后任务状态可恢复。
- 运行中任务至少恢复到可重试状态。
- 数据库写入失败要记录日志。
- 下载中断后重新运行可补缺。

### 15.3 可观测性

- 日志按日期切分。
- 每个任务有独立错误摘要。
- 每个失败文件保留失败原因。
- UI 可查看最近错误。

### 15.4 可维护性

- 下载核心与接口层分离。
- 浏览器扩展与后台通过稳定 API 通信。
- 解析器独立封装，便于适配站点结构变化。
- API 返回结构保持版本兼容。

## 16. MVP 范围

### 16.1 必做

1. 后台添加页支持 ID/URL 批量输入。
2. 输入解析和去重。
3. 任务预检。
4. 下载队列。
5. 实时进度。
6. 失败状态正确展示。
7. 断点补缺。
8. 完整性检查。
9. 完整后打包 ZIP。
10. 设置页支持代理、并发、下载路径。

### 16.2 可推迟

1. 浏览器扩展。
2. 资料库封面墙。
3. File Watch。
4. CLI 入口。
5. 移动端专用适配。
6. 多主题。

## 17. 浏览器扩展 MVP 范围

1. Popup 显示后台连接状态。
2. 识别详情页 ID。
3. 一键加入队列。
4. 当前页面已下载/下载中状态查询。
5. 打开后台按钮。

第二阶段再做：

1. 列表页批量添加。
2. 页面内注入按钮。
3. 右键菜单。
4. 扩展配对流程。

## 18. 迭代计划

### Phase 1：后台管理核心

目标：不依赖扩展也能完整使用。

交付：

- 添加任务页
- 队列页
- 下载状态修复
- 失败重试
- 配置校验
- 完整性检查

### Phase 2：资料库和恢复能力

目标：从“下载器”升级为“本地管理器”。

交付：

- 资料库页
- 任务详情页
- 文件校验
- 重新打包
- 失败列表

### Phase 3：浏览器扩展

目标：让真实浏览器成为发现入口。

交付：

- 扩展基础框架
- Popup
- 详情页识别
- 后台 API Token
- 一键添加

### Phase 4：增强入口

目标：覆盖批量和自动化场景。

交付：

- 列表页批量添加
- 右键菜单
- File Watch
- CLI/API 文档

## 19. 成功指标

### 19.1 可用性指标

- 用户无需扩展即可完成下载。
- 批量添加 100 个 ID 能稳定进入队列。
- 服务重启后任务状态不丢失。
- 失败任务可一键重试。

### 19.2 可靠性指标

- 下载完成任务的文件完整度为 100%。
- 不完整任务不会被错误标记为完成。
- ZIP 只在文件完整时生成。
- 配置非法输入不会导致服务不可启动。

### 19.3 体验指标

- 添加单个 ID 到任务入队不超过 3 次点击。
- 扩展详情页一键添加不超过 2 次点击。
- 用户能在队列页直接看到失败原因。

## 20. 风险与对策

### 20.1 站点结构变化

风险：解析规则失效。  
对策：解析器独立封装，失败时记录 HTML 片段和解析阶段，便于快速修复。

### 20.2 反爬限制

风险：请求过快导致 403/429。  
对策：全局请求间隔、指数退避、代理配置、可调整 User-Agent。

### 20.3 本地 API 被网页滥用

风险：任意网页调用本地下载接口。  
对策：Token、CORS 限制、只监听 localhost。

### 20.4 文件覆盖

风险：同名漫画互相覆盖。  
对策：目录名和 ZIP 名包含 ID。

### 20.5 状态不一致

风险：UI 显示完成但实际缺图。  
对策：任务完成前必须通过完整性校验。

## 21. 待决策问题

1. 后台是否默认保留当前内置浏览器入口？
2. 任务加入后是否默认立即下载，还是默认进入待确认？
3. 扩展 MVP 是否需要页面内注入按钮，还是先只做 Popup？
4. 下载目录命名是否统一改为 `[id] title`？
5. 是否兼容旧命令行数据库结构，还是提供迁移脚本？

## 22. 推荐结论

推荐产品方向：

```text
后台管理是核心产品，浏览器扩展是增强入口，CLI/File Watch 是高级入口。
```

优先实现后台独立可用能力，再实现浏览器扩展。内置代理浏览器可以保留为探索或备用功能，但不应成为主路径。

