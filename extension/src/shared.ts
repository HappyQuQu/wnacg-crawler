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

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const settings = await getSettings();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (settings.token) {
    headers.set("X-Extension-Token", settings.token);
  }
  const response = await fetch(`${settings.serverUrl}${path}`, { ...init, headers });
  const body = (await response.json()) as ApiResponse<T>;
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  if (!body.ok) {
    throw new Error(String(body.error || "API error"));
  }
  return body.data;
}

export function extractMangaId(url: string): string | null {
  const match = url.match(/aid-(\d+)/);
  return match ? match[1] : null;
}
