import type {
  ApiResponse,
  ParseResult,
  Task,
  TaskList,
  LibraryItem,
  LibraryList,
  LibraryRetryFailedResult,
  LibrarySortKey,
  LibraryDownloadResult,
  LibraryDeleteResult,
  LogList,
  AppConfig,
} from "./types";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  let body: ApiResponse<T>;
  try {
    body = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new Error(`API response is not valid JSON: ${path} (${response.status})`);
  }
  if (!response.ok || !body.ok) {
    const detail = body.error || (body as ApiResponse<T> & { detail?: unknown }).detail;
    throw new Error(typeof detail === "string" ? detail : detail ? JSON.stringify(detail) : `请求失败（HTTP ${response.status}）`);
  }
  return body.data;
}

export async function fetchTasks(): Promise<TaskList> {
  return api<TaskList>("/api/tasks");
}

export async function clearCompletedTasksApi(taskId?: string): Promise<{ deleted: number; task_ids: string[] }> {
  return api(`/api/tasks/${taskId ? encodeURIComponent(taskId) : "completed"}`, { method: "DELETE" });
}

export async function deleteLibraryApi(mangaIds: string[], deleteFiles: boolean): Promise<LibraryDeleteResult> {
  return api("/api/library/delete", {
    method: "POST",
    body: JSON.stringify({ manga_ids: mangaIds, delete_files: deleteFiles }),
  });
}

export async function prepareLibraryDownloadsApi(mangaIds: string[]): Promise<LibraryDownloadResult> {
  return api("/api/library/downloads", {
    method: "POST",
    body: JSON.stringify({ manga_ids: mangaIds }),
  });
}

export async function fetchLibrary(params?: {
  sort_by?: LibrarySortKey;
  sort_order?: "asc" | "desc";
  zip_status?: "zipped" | "unzipped";
}): Promise<LibraryList> {
  const searchParams = new URLSearchParams();
  if (params?.sort_by) searchParams.set("sort_by", params.sort_by);
  if (params?.sort_order) searchParams.set("sort_order", params.sort_order);
  if (params?.zip_status) searchParams.set("zip_status", params.zip_status);
  const qs = searchParams.toString();
  return api<LibraryList>(`/api/library${qs ? `?${qs}` : ""}`);
}

export async function fetchLogs(taskId?: string): Promise<LogList> {
  const params = new URLSearchParams({ limit: taskId ? "200" : "300" });
  if (taskId) params.set("task_id", taskId);
  return api<LogList>(`/api/logs?${params}`);
}

export async function fetchLibraryDetail(mangaId: string): Promise<LibraryItem> {
  return api<LibraryItem>(`/api/library/${mangaId}`);
}

export async function fetchConfig(): Promise<AppConfig> {
  return api<AppConfig>("/api/config");
}

export async function parseInput(text: string): Promise<ParseResult> {
  return api<ParseResult>("/api/inputs/parse", {
    method: "POST",
    body: JSON.stringify({ text, source: "manual" }),
  });
}

export async function batchCreateTasks(items: { manga_id: string }[]): Promise<{ created: Task[]; skipped: unknown[] }> {
  return api("/api/tasks/batch", {
    method: "POST",
    body: JSON.stringify({ items, source: "manual", start_immediately: true }),
  });
}

export async function retryTaskApi(taskId: string): Promise<Task> {
  return api<Task>(`/api/tasks/${taskId}/retry`, {
    method: "POST",
    body: JSON.stringify({ scope: "task" }),
  });
}

export async function controlTaskApi(taskId: string, action: "pause" | "resume" | "cancel"): Promise<Task> {
  return api<Task>(`/api/tasks/${taskId}/${action}`, { method: "POST" });
}

export async function verifyLibraryApi(mangaId: string): Promise<LibraryItem> {
  return api<LibraryItem>(`/api/library/${mangaId}/verify`, { method: "POST" });
}

export async function zipLibraryApi(mangaId: string): Promise<LibraryItem> {
  return api<LibraryItem>(`/api/library/${mangaId}/zip`, { method: "POST" });
}

export async function retryFailedLibraryApi(mangaId: string): Promise<LibraryRetryFailedResult> {
  return api<LibraryRetryFailedResult>(`/api/library/${mangaId}/retry-failed`, { method: "POST" });
}

export async function saveConfigApi(config: Partial<AppConfig>): Promise<AppConfig & { message: string }> {
  return api("/api/config", {
    method: "POST",
    body: JSON.stringify(config),
  });
}

export async function generateExtensionTokenApi(): Promise<AppConfig & { message: string }> {
  return api("/api/config/extension-token", { method: "POST" });
}
