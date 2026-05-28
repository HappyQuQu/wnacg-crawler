import type {
  ApiResponse,
  ParseResult,
  Task,
  TaskList,
  LibraryItem,
  LibraryList,
  LibraryRetryFailedResult,
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
  const body = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !body.ok) {
    throw new Error(`API request failed: ${path}`);
  }
  return body.data;
}

export async function fetchTasks(): Promise<TaskList> {
  return api<TaskList>("/api/tasks");
}

export async function fetchLibrary(): Promise<LibraryList> {
  return api<LibraryList>("/api/library");
}

export async function fetchLogs(): Promise<LogList> {
  return api<LogList>("/api/logs?limit=300");
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

export async function generateExtensionTokenApi(): Promise<AppConfig> {
  return api<AppConfig>("/api/config/extension-token", { method: "POST" });
}
