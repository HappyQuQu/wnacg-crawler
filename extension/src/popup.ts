import { apiFetch, extractMangaId, getSettings, type PageInfo, type ExtensionSettings } from "./shared.js";

// ── DOM refs ───────────────────────────────────────────────────────────
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const statusBadge = $<HTMLSpanElement>("status-badge");
const serverUrlEl = $<HTMLElement>("server-url");
const statLibrary = $<HTMLElement>("stat-library");
const statActive = $<HTMLElement>("stat-active");
const statCompleted = $<HTMLElement>("stat-completed");
const taskListEl = $<HTMLElement>("task-list");
const refreshBtn = $<HTMLButtonElement>("refresh-btn");
const pageCard = $<HTMLElement>("page-card");
const pageTitle = $<HTMLElement>("page-title");
const pageMeta = $<HTMLElement>("page-meta");
const submitBtn = $<HTMLButtonElement>("submit");
const openAdminBtn = $<HTMLButtonElement>("open-admin");
const settingsToggle = $<HTMLButtonElement>("settings-toggle");
const settingsPanel = $<HTMLElement>("settings-panel");
const inputServer = $<HTMLInputElement>("input-server");
const inputAdmin = $<HTMLInputElement>("input-admin");
const inputToken = $<HTMLInputElement>("input-token");
const btnVisibility = $<HTMLButtonElement>("btn-visibility");
const btnPaste = $<HTMLButtonElement>("btn-paste");
const btnClear = $<HTMLButtonElement>("btn-clear");
const btnSave = $<HTMLButtonElement>("btn-save");
const settingsMsg = $<HTMLElement>("settings-msg");

// ── State ──────────────────────────────────────────────────────────────
let currentPage: PageInfo = { mangaId: null, url: "", title: "" };
let currentSettings: ExtensionSettings | null = null;

type ItemStatus = { manga_id: string; status: string; task_id: string | null };
type TaskItem = {
  task_id: string;
  manga_id: string;
  title: string;
  status: string;
  stage: string;
  progress_current: number;
  progress_total: number;
};
type LibraryResponse = { items: unknown[]; total: number };
type TasksResponse = { items: TaskItem[]; total: number };

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Status helpers ─────────────────────────────────────────────────────
const statusLabels: Record<string, string> = {
  ready: "可加入", pending: "待确认", queued: "排队中", running: "下载中",
  paused: "已暂停", partial: "部分完成", completed: "已完成", failed: "失败", cancelled: "已取消",
};
const label = (s: string) => statusLabels[s] ?? s;

function badgeClass(s: string): string {
  if (s === "已连接") return "badge-green";
  if (s === "离线") return "badge-red";
  return "badge-orange";
}

function taskBadgeClass(s: string): string {
  if (["running", "queued"].includes(s)) return "badge-blue";
  if (s === "paused") return "badge-orange";
  if (s === "completed") return "badge-green";
  if (s === "failed") return "badge-red";
  return "badge-orange";
}

// ── Server detection ───────────────────────────────────────────────────
async function detectServer(): Promise<boolean> {
  try {
    const settings = await getSettings();
    currentSettings = settings;
    await apiFetch("/api/extension/status");
    statusBadge.textContent = "已连接";
    statusBadge.className = "badge badge-green";
    serverUrlEl.textContent = settings.serverUrl;
    return true;
  } catch {
    statusBadge.textContent = "离线";
    statusBadge.className = "badge badge-red";
    serverUrlEl.textContent = currentSettings?.serverUrl ?? "后台未连接";
    return false;
  }
}

// ── Stats ──────────────────────────────────────────────────────────────
async function fetchStats(): Promise<void> {
  try {
    const [lib, tasks] = await Promise.all([
      apiFetch<LibraryResponse>("/api/library"),
      apiFetch<TasksResponse>("/api/tasks"),
    ]);
    statLibrary.textContent = String(lib.total ?? 0);
    const items = tasks.items ?? [];
    statActive.textContent = String(items.filter((t) => ["running", "queued", "pending", "paused"].includes(t.status)).length);
    statCompleted.textContent = String(items.filter((t) => t.status === "completed").length);
  } catch {
    statLibrary.textContent = "-";
    statActive.textContent = "-";
    statCompleted.textContent = "-";
  }
}

// ── Task list ──────────────────────────────────────────────────────────
async function fetchTasks(): Promise<void> {
  try {
    const data = await apiFetch<TasksResponse>("/api/tasks");
    const items = (data.items ?? []).filter((t) => ["running", "queued", "pending", "paused"].includes(t.status));
    if (items.length === 0) {
      taskListEl.innerHTML = '<p class="empty-text">暂无进行中的任务</p>';
      return;
    }
    taskListEl.innerHTML = items.map((t) => {
      const pct = t.progress_total > 0 ? Math.round((t.progress_current / t.progress_total) * 100) : 0;
      const doneClass = pct >= 100 ? "done" : "";
      const name = escapeHtml(t.title || t.manga_id);
      return `
        <div class="task-item">
          <div class="task-top">
            <span class="task-name" title="${name}">${name}</span>
            <span class="badge ${taskBadgeClass(t.status)}">${label(t.status)}</span>
          </div>
          <div class="task-meta">
            <span>${t.manga_id}</span>
            ${t.progress_total > 0 ? `<span>${t.progress_current}/${t.progress_total}</span>` : ""}
            <span>${pct}%</span>
          </div>
          ${t.progress_total > 0 ? `
            <div class="progress-bar">
              <div class="progress-fill ${doneClass}" style="width:${pct}%"></div>
            </div>` : ""}
        </div>`;
    }).join("");
  } catch {
    taskListEl.innerHTML = '<p class="empty-text">加载失败</p>';
  }
}

// ── Page detection ─────────────────────────────────────────────────────
async function detectPage(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || "";
  currentPage = { mangaId: extractMangaId(url), url, title: tab?.title || "" };

  if (!currentPage.mangaId) {
    pageCard.style.display = "none";
    return;
  }
  pageCard.style.display = "";
  pageTitle.textContent = currentPage.title || "当前页面";
  pageMeta.textContent = `ID ${currentPage.mangaId}`;
  submitBtn.disabled = false;

  try {
    const item = await apiFetch<ItemStatus>(`/api/extension/item/${currentPage.mangaId}`);
    pageMeta.textContent = `ID ${item.manga_id} · ${label(item.status)}`;
  } catch {
    pageMeta.textContent = `ID ${currentPage.mangaId}`;
  }
}

// ── Submit ─────────────────────────────────────────────────────────────
submitBtn.addEventListener("click", async () => {
  if (!currentPage.mangaId) return;
  submitBtn.disabled = true;
  submitBtn.textContent = "提交中…";
  try {
    const resp = await chrome.runtime.sendMessage({
      type: "SUBMIT_PAGE",
      payload: {
        manga_id: currentPage.mangaId,
        url: currentPage.url,
        title_hint: currentPage.title,
        page_type: "detail",
      },
    });
    if (resp?.ok) {
      submitBtn.textContent = "✓ 已加入";
      void refreshAll();
    } else {
      submitBtn.textContent = "加入队列";
      submitBtn.disabled = false;
      pageMeta.textContent = resp?.error || "发送失败";
    }
  } catch {
    submitBtn.textContent = "加入队列";
    submitBtn.disabled = false;
  }
});

openAdminBtn.addEventListener("click", async () => {
  const settings = await getSettings();
  await chrome.tabs.create({ url: settings.adminUrl });
});

// ── Settings panel ─────────────────────────────────────────────────────
settingsToggle.addEventListener("click", () => {
  settingsPanel.classList.toggle("open");
});

// Load existing settings into inputs
void (async () => {
  const settings = await getSettings();
  inputServer.value = settings.serverUrl;
  inputAdmin.value = settings.adminUrl;
  if (settings.token) {
    inputToken.value = settings.token;
  }
})();

// Toggle password visibility
btnVisibility.addEventListener("click", () => {
  const isPassword = inputToken.type === "password";
  inputToken.type = isPassword ? "text" : "password";
  btnVisibility.textContent = isPassword ? "🙈" : "👁";
});

// Paste from clipboard
btnPaste.addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    inputToken.value = text.trim();
    settingsMsg.textContent = "已粘贴";
    settingsMsg.className = "msg msg-ok";
  } catch {
    settingsMsg.textContent = "无法读取剪贴板";
    settingsMsg.className = "msg msg-err";
  }
});

// Clear token
btnClear.addEventListener("click", () => {
  inputToken.value = "";
  settingsMsg.textContent = "已清除，点击保存生效";
  settingsMsg.className = "msg msg-ok";
});

// Save settings
btnSave.addEventListener("click", async () => {
  const serverUrl = inputServer.value.trim() || "http://127.0.0.1:8080";
  const adminUrl = inputAdmin.value.trim() || "http://127.0.0.1:5173";
  const token = inputToken.value.trim();
  await chrome.storage.local.set({ serverUrl, adminUrl, token });
  settingsMsg.textContent = "已保存";
  settingsMsg.className = "msg msg-ok";
  // Re-detect with new settings
  void refreshAll();
});

// ── Refresh ────────────────────────────────────────────────────────────
refreshBtn.addEventListener("click", () => void refreshAll());

async function refreshAll(): Promise<void> {
  const ok = await detectServer();
  if (ok) {
    await Promise.all([fetchStats(), fetchTasks(), detectPage()]);
  }
}

// ── Auto-refresh every 5s ──────────────────────────────────────────────
void refreshAll();
setInterval(() => void refreshAll(), 5000);
