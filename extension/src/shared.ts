export type ExtensionSettings = {
  serverUrl: string;
  adminUrl: string;
  token: string;
};

export type PageInfo = {
  mangaId: string | null;
  url: string;
  title: string;
};

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(["serverUrl", "adminUrl", "token"]);
  return {
    serverUrl: stored.serverUrl || "http://127.0.0.1:8080",
    adminUrl: stored.adminUrl || "http://127.0.0.1:5173",
    token: stored.token || ""
  };
}

type ApiResponse<T> = {
  ok: boolean;
  data: T;
  error: unknown;
};

export async function apiFetch<T>(path: string, init: RequestInit = {}, override?: ExtensionSettings): Promise<T> {
  const settings = override ?? await getSettings();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (settings.token) {
    headers.set("X-Extension-Token", settings.token);
  }
  const response = await fetch(`${settings.serverUrl}${path}`, { ...init, headers });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const body = (await response.json()) as ApiResponse<T>;
  if (!body.ok) {
    throw new Error(String(body.error || "API error"));
  }
  return body.data;
}

export function connectionErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/HTTP (401|403)\b/.test(message)) return "后台 Token 无效，请在连接设置中更新 Token";
  if (/HTTP 404\b/.test(message)) return "后台地址不正确，请在连接设置中检查地址和端口";
  if (/HTTP 5\d\d\b/.test(message)) return "后台服务异常，请稍后刷新重试";
  if (error instanceof SyntaxError) return "后台响应格式不正确，请确认填写的是 API 服务地址";
  return "无法连接后台，请确认服务已启动，并检查连接地址和扩展的站点访问权限";
}

export function extractMangaId(url: string): string | null {
  const match = url.match(/aid-(\d+)/);
  return match ? match[1] : null;
}
