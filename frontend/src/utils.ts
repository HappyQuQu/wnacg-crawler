const TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const SHORT_TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return TIME_FORMATTER.format(date);
}

export function formatTimeShort(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return SHORT_TIME_FORMATTER.format(date);
}

export function formatBytes(value: number): string {
  if (value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const size = value / 1024 ** index;
  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function stageLabel(stage: string): string {
  const labelMap: Record<string, string> = {
    none: "等待",
    fetching_info: "获取信息",
    fetching_pages: "获取目录",
    resolving_images: "解析图片",
    downloading: "下载",
    retrying_failed_images: "修复图片",
    verifying: "校验",
    zipping: "打包",
    done: "完成",
  };
  return labelMap[stage] ?? stage;
}

export function canPause(task: { status: string }): boolean {
  return ["queued", "running"].includes(task.status);
}

export function canResume(task: { status: string }): boolean {
  return ["pending", "paused"].includes(task.status);
}

export function canCancel(task: { status: string }): boolean {
  return ["pending", "queued", "running", "paused"].includes(task.status);
}

export function canRetry(task: { status: string }): boolean {
  return ["failed", "partial", "completed", "cancelled"].includes(task.status);
}

export function isProblemFile(file: { status: string }): boolean {
  return file.status !== "valid";
}

export function formatLogMessage(item: { message: string; event: string }): string {
  const message = item.message.trim();
  if (message) return message;
  const labelMap: Record<string, string> = {
    task_failed: "任务失败，但异常没有返回文本",
    retry_failed_images_failed: "问题图片修复失败，但异常没有返回文本",
    image_download_failed: "图片下载失败，但异常没有返回文本",
    problem_image_retry_failed: "问题图片重试失败，但异常没有返回文本",
  };
  return labelMap[item.event] ?? "无错误信息";
}

export function formatLogDetails(details: Record<string, unknown>): string {
  return Object.entries(details)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ");
}

export function taskDisplayName(task: { title: string; manga_id: string; stage: string }): string {
  if (task.title && task.title.trim()) return task.title;
  if (task.stage && task.stage !== "none" && task.stage !== "done") {
    return `${stageLabel(task.stage)}中...`;
  }
  return `等待获取信息`;
}

export function libraryDisplayName(item: { title: string; manga_id: string }): string {
  if (item.title && item.title.trim()) return item.title;
  return `漫画 ${item.manga_id}`;
}

export function progressPercent(current: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(Math.round((current / total) * 100), 100);
}

export function formatDuration(start: string | null, end?: string | null): string {
  if (!start) return "-";
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : new Date();
  const ms = endDate.getTime() - startDate.getTime();
  if (ms < 0 || Number.isNaN(ms)) return "-";
  if (ms < 60_000) return `${Math.round(ms / 1000)}秒`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}分钟`;
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.round((ms % 3_600_000) / 60_000);
  return `${hours}小时${minutes}分钟`;
}
