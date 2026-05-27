# 数据模型与状态机

版本：v0.1  
日期：2026-05-27

## 1. 设计原则

1. 任务状态必须可持久化。
2. 文件完整度不能只靠内存变量。
3. 页面、图片详情页、图片文件需要分层记录。
4. 重复运行时只补缺，不覆盖有效文件。
5. 目录名和 ZIP 名必须包含 manga_id。

## 2. 实体关系

```text
MangaInfo 1 ---- n MangaPage
MangaInfo 1 ---- n MangaPicPage
MangaPicPage 1 ---- 1 DownloadFile
MangaInfo 1 ---- n DownloadTask
DownloadTask 1 ---- n TaskEvent
```

## 3. MangaInfo

漫画基础信息。

字段：

```text
id                  string primary key
title               string
cover_url           string
page_count          int
pic_count           int
status              string
is_finished         bool
is_error            bool
created_at          datetime
updated_at          datetime
last_error          text
```

status：

```text
unknown
ready
partial
completed
failed
missing
```

## 4. MangaPage

目录页 HTML 缓存。

字段：

```text
id                  int primary key
manga_id            string index
page_index          int
page_url            string
page_name           string unique
page_context        text
status              string
error_message       text
created_at          datetime
updated_at          datetime
```

约束：

```text
unique(manga_id, page_index)
```

status：

```text
pending
fetched
failed
```

## 5. MangaPicPage

图片详情页和真实图片地址。

字段：

```text
id                  int primary key
manga_id            string index
page_index          int
page_url            string
page_name           string
pic_index           int
pic_num             string
pic_url             string
status              string
error_message       text
created_at          datetime
updated_at          datetime
```

约束：

```text
unique(manga_id, page_index)
```

status：

```text
pending
resolved
failed
```

## 6. DownloadFile

图片文件状态。

字段：

```text
id                  int primary key
manga_id            string index
pic_page_id         int
file_path           string
file_name           string
file_size           int
content_type        string
checksum            string
status              string
error_message       text
created_at          datetime
updated_at          datetime
```

status：

```text
missing
downloading
valid
invalid
failed
```

## 7. DownloadTask

下载任务。

字段：

```text
id                  string primary key
manga_id            string index
source              string
status              string
stage               string
priority            int
progress_current    int
progress_total      int
retry_count         int
created_at          datetime
started_at          datetime
finished_at         datetime
updated_at          datetime
last_error          text
```

source：

```text
manual
batch_text
file_import
extension
library_retry_failed
cli
file_watch
api
```

status：

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

stage：

```text
none
fetching_info
fetching_pages
resolving_images
downloading
retrying_failed_images
verifying
zipping
done
```

## 8. AppLog

后台持久化日志，用于解释任务为什么失败、哪张图片失败、修复任务是否成功。

字段：

```text
id                  int primary key
level               string index
event               string index
message             text
manga_id            string index
task_id             string index
stage               string index
details             json/text
created_at          datetime index
```

level：

```text
info
warning
error
```

event：

```text
task_started
task_completed
task_partial
task_failed
task_controlled
legacy_task_failure
manga_info_resolved
image_urls_resolved
image_url_resolve_failed
image_download_failed
retry_failed_images_started
retry_failed_images_finished
problem_image_retry_failed
```

## 9. AppConfig

配置建议。

字段：

```text
download_path       string
db_path             string
is_zip              bool
max_thread          int
re_count            int
request_delay_ms    int
timeout_seconds     int
user_agent          string
proxy               object
extension_token     string
```

校验规则：

```text
max_thread: 1-20，控制单个漫画下载图片阶段的并发 worker 数
re_count: 1-12
request_delay_ms: 0-10000
timeout_seconds: 5-120
proxy.port: 1-65535
```

## 10. 任务状态机

主路径：

```text
pending -> queued -> running -> completed
```

运行阶段：

```text
running(fetching_info)
  -> running(fetching_pages)
  -> running(resolving_images)
  -> running(downloading)
  -> running(verifying)
  -> running(zipping)
  -> completed(done)
```

部分完成：

```text
running -> partial
partial --retry--> queued
queued -> running
```

失败：

```text
running -> failed
failed --retry--> queued
queued -> running
```

暂停：

```text
queued -> paused
running -> paused
paused -> queued
```

取消：

```text
pending -> cancelled
queued -> cancelled
running -> cancelled
paused -> cancelled
cancelled --retry--> queued
```

启动恢复：

```text
running --service_restart--> queued
queued --service_start--> running
```

## 11. 完成判定

任务进入 `completed` 必须满足：

```text
MangaInfo 存在
MangaPage 数量 == page_count
MangaPicPage 数量 == pic_count
DownloadFile valid 数量 == pic_count
如果 is_zip=true，则 ZIP 状态为 created
```

否则：

```text
存在可补缺文件 -> partial
关键阶段无法继续 -> failed
用户取消 -> cancelled
```

## 12. 文件命名

目录：

```text
Manga/[{manga_id}] {safe_title}
Zip/[{manga_id}] {safe_title}.zip
```

图片：

```text
{pic_index:04d}_{safe_pic_num}.{ext}
```

示例：

```text
Manga/[123456] 夏日补档合集/0001_1.jpg
Zip/[123456] 夏日补档合集.zip
```

## 13. 校验规则

有效图片文件需要满足：

```text
文件存在
文件大小 > 15 KB
文件头符合图片格式
扩展名属于 jpg/jpeg/png/gif/webp/bmp
```

ZIP 前校验：

```text
valid_file_count == pic_count
```

不满足时不生成 ZIP，任务进入 `partial`。

## 14. 数据迁移注意

旧命令行版本可能已有：

```text
MangaInfo
MangaPage
MangaPicPage
```

迁移时需要：

1. 保留原始数据库备份。
2. 将 `Y/N` 状态转换为 bool 或新状态枚举。
3. 根据文件系统生成 DownloadFile。
4. 根据完整度推导 MangaInfo.status。
5. 不自动删除旧文件。
