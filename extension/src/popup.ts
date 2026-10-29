import { apiFetch, extractMangaId, getSettings, libraryPresenceLabel, type ItemStatus, type LibraryPresence, type PageInfo, type ExtensionSettings } from "./shared.js";
import { checkConnection, initConnectionEditor } from "./connection.js";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const statusBadge = $("status-badge"), serverUrl = $("server-url"), notice = $("connection-notice");
const list = $("task-list"), refresh = $<HTMLButtonElement>("refresh-btn"), pageTitle = $("page-title"), pageMeta = $("page-meta"), pageState = $("page-state"), feedback = $("page-feedback");
const submit = $<HTMLButtonElement>("submit"), settingsPanel = $("settings-panel"), toggle = $<HTMLButtonElement>("settings-toggle");
const activeStatuses = ["running", "queued", "pending", "paused"];
type TaskItem = { task_id: string; manga_id: string; title: string; status: string; stage: string; progress_current: number; progress_total: number; last_error?: string | null };
let currentPage: PageInfo = { mangaId: null, url: "", title: "" };
let currentSettings: ExtensionSettings | null = null;
let connected = false, refreshing = false, submitting = false;
let taskView: "active" | "attention" = "active";
let latestTasks: TaskItem[] = [];
let dashboardError = "";
const labels: Record<string, string> = { ready: "可加入", pending: "待确认", queued: "排队中", running: "运行中", paused: "已暂停", partial: "部分完成", completed: "有文件", failed: "失败", cancelled: "已取消", archived: "已清理" };
const stages: Record<string, string> = { none: "等待", fetching_info: "获取信息", fetching_pages: "获取目录", resolving_images: "解析图片", downloading: "下载图片", retrying_failed_images: "修复图片", verifying: "校验", zipping: "打包", done: "完成" };
const icon = (path: string, className = "") => `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
const arrow = icon('<path d="m9 6 6 6-6 6"/>', "task-chevron");
const download = icon('<path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4"/>');
const warning = icon('<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v4m0 4h.01"/>');
function escapeHtml(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
function badgeClass(status: string) { return status === "completed" ? "badge-green" : status === "failed" ? "badge-red" : ["running", "queued", "ready"].includes(status) ? "badge-blue" : "badge-orange"; }
async function openAdmin() {
  try { await chrome.tabs.create({ url: (await getSettings()).adminUrl }); }
  catch { feedback.textContent = "无法打开后台，请检查连接设置。"; }
}

async function detectServer() {
  try {
    currentSettings = await getSettings();
    serverUrl.textContent = currentSettings.serverUrl;
    serverUrl.title = currentSettings.serverUrl;
    const result = await checkConnection(currentSettings);
    statusBadge.textContent = result.connected ? "已连接" : result.permissionRequired ? "待授权" : result.unauthorized ? "未配对" : "离线";
    statusBadge.className = `badge connection-badge ${result.connected ? "badge-green" : result.permissionRequired || result.unauthorized ? "badge-orange" : "badge-red"}`;
    notice.textContent = result.message; notice.hidden = result.connected;
    return result.connected;
  } catch {
    statusBadge.textContent = "设置异常"; statusBadge.className = "badge connection-badge badge-orange";
    notice.textContent = "无法读取连接设置，请重新打开扩展后重试。"; notice.hidden = false; return false;
  }
}

function empty(message: string) { list.innerHTML = `<div class="empty-text">${download}<span>${escapeHtml(message)}</span></div>`; }
function clearDashboard(message: string) {
  latestTasks = []; dashboardError = message;
  for (const id of ["stat-library", "stat-active", "stat-completed", "active-count", "attention-count"]) $(id).textContent = "—";
  $("task-count").textContent = ""; $("queue-breakdown").textContent = "状态暂不可用"; empty(message);
}
function renderTasks() {
  if (dashboardError) { empty(dashboardError); return; }
  const scroll = list.scrollTop;
  const items = latestTasks.filter((task) => taskView === "active" ? activeStatuses.includes(task.status) : ["failed", "partial"].includes(task.status));
  $("task-count").textContent = `${items.length} 项`;
  if (!items.length) { empty(taskView === "active" ? "当前没有进行中的任务" : "暂无待处理问题"); return; }
  list.innerHTML = items.map((task) => {
    const hasProgress = task.progress_total > 0;
    const percent = Math.max(0, Math.min(100, Math.round(task.progress_current / task.progress_total * 100)));
    const name = escapeHtml(task.title || `作品 ${task.manga_id}`), stage = stages[task.stage] || task.stage;
    const unit = task.stage === "fetching_pages" ? "目录页" : task.stage === "resolving_images" ? "图片页" : "张图片";
    return `<button type="button" class="task-item" aria-label="在后台查看作品 ${escapeHtml(task.manga_id)}"><span class="task-symbol ${taskView === "attention" ? "attention" : ""}">${taskView === "attention" ? warning : download}</span><span class="task-copy"><span class="task-top"><span class="task-name" title="${name}">${name}</span><span class="badge ${badgeClass(task.status)}">${labels[task.status] || escapeHtml(task.status)}</span></span><span class="task-meta"><span>ID ${escapeHtml(task.manga_id)}</span><span class="task-progress">${hasProgress ? `${task.progress_current} / ${task.progress_total} ${unit}` : escapeHtml(stage)}</span>${hasProgress ? `<span class="progress-percent">${percent}%</span>` : ""}</span>${hasProgress ? `<span class="progress-bar" role="progressbar" aria-label="当前阶段" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span class="progress-fill" style="display:block;width:${percent}%"></span></span>` : ""}${taskView === "attention" && task.last_error ? `<span class="task-error">${escapeHtml(task.last_error)}</span>` : ""}</span>${arrow}</button>`;
  }).join("");
  list.scrollTop = scroll;
}
async function fetchDashboard() {
  try {
    const [library, tasks] = await Promise.all([apiFetch<{ total: number; items: LibraryPresence[] }>("/api/library"), apiFetch<{ items: TaskItem[] }>("/api/tasks")]);
    dashboardError = "";
    latestTasks = tasks.items ?? [];
    const active = latestTasks.filter((task) => activeStatuses.includes(task.status));
    $("stat-library").textContent = String(library.total); $("stat-active").textContent = String(active.length);
    $("stat-completed").textContent = String(library.items.filter((item) => item.taken_at).length);
    $("stat-completed").title = `未下载 ${library.items.filter((item) => !item.taken_at).length} 项`;
    $("active-count").textContent = String(active.length); $("attention-count").textContent = String(latestTasks.filter((task) => ["failed", "partial"].includes(task.status)).length);
    $("queue-breakdown").textContent = `${active.filter((task) => task.status === "running").length} 运行 · ${active.filter((task) => ["queued", "pending"].includes(task.status)).length} 等待 · ${active.filter((task) => task.status === "paused").length} 暂停`;
    renderTasks();
  } catch { clearDashboard("任务加载失败，请刷新后重试"); }
}

function showItem(item: ItemStatus) {
  pageState.textContent = labels[item.status] || item.status; pageState.className = `badge ${badgeClass(item.status)}`;
  pageMeta.textContent = `ID ${item.manga_id} · ${item.in_library ? libraryPresenceLabel(item) : "服务器无记录"}`;
  const blocked = ["pending", "queued", "running", "paused", "completed"].includes(item.status);
  submit.disabled = blocked || !connected || submitting;
  if (!submitting) submit.textContent = item.status === "completed" ? "服务器有文件" : item.status === "paused" ? "已暂停" : blocked ? "已在队列" : item.status === "archived" ? "重新下载" : ["partial", "failed", "cancelled"].includes(item.status) ? "重新加入" : "加入队列";
  feedback.textContent = item.status === "paused" ? "请在后台继续这个任务。" : "";
}
async function detectPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || "";
  let id: string | null = null;
  try { const parsed = new URL(url); if (["http:", "https:"].includes(parsed.protocol) && /^(www\.)?wnacg\.(com|org)$/.test(parsed.hostname) && /^\/photos-index(?:-page-\d+)?-aid-\d+\.html$/.test(parsed.pathname)) id = extractMangaId(url); } catch { /* unsupported tab */ }
  currentPage = { mangaId: id, url, title: tab?.title || "" };
  pageTitle.title = id ? currentPage.title : "";
  submit.disabled = true; submit.textContent = "加入队列"; feedback.textContent = "";
  if (!id) { pageTitle.textContent = "当前页面没有可识别的作品"; pageMeta.textContent = "在原站详情页使用此入口"; pageState.textContent = "未识别"; pageState.className = "badge badge-orange"; submit.textContent = "等待识别"; return; }
  pageTitle.textContent = currentPage.title || `作品 ${id}`; pageTitle.title = currentPage.title; pageMeta.textContent = `ID ${id}`;
  if (!connected) { pageState.textContent = "未连接"; pageState.className = "badge badge-orange"; submit.textContent = "加入队列"; return; }
  try { showItem(await apiFetch<ItemStatus>(`/api/extension/item/${id}`)); }
  catch { pageState.textContent = "查询失败"; pageState.className = "badge badge-orange"; feedback.textContent = "暂时无法确认本地状态，请刷新后重试。"; }
}

submit.addEventListener("click", async () => {
  if (!currentPage.mangaId || submit.disabled || submitting || refreshing || !connected) return;
  submitting = true; submit.disabled = true; submit.textContent = "提交中…"; feedback.textContent = "";
  try {
    const response = await chrome.runtime.sendMessage({ type: "SUBMIT_PAGE", payload: { manga_id: currentPage.mangaId, url: currentPage.url, title_hint: currentPage.title, page_type: "detail" } });
    if (!response?.ok) throw new Error("submit failed");
    submitting = false; await refreshAll();
  } catch { submitting = false; submit.textContent = "重试加入"; submit.disabled = false; feedback.textContent = "提交失败，请重试或检查后台连接。"; }
});
$("open-admin").addEventListener("click", () => void openAdmin());
list.addEventListener("click", (event) => { if ((event.target as HTMLElement).closest(".task-item")) void openAdmin(); });
for (const view of ["active", "attention"] as const) {
  $("tab-" + view).addEventListener("click", () => {
    taskView = view; list.setAttribute("aria-labelledby", "tab-" + view);
    for (const key of ["active", "attention"]) { const tab = $("tab-" + key); tab.setAttribute("aria-selected", String(view === key)); tab.tabIndex = view === key ? 0 : -1; }
    renderTasks();
  });
}
document.querySelector(".task-tabs")!.addEventListener("keydown", (event) => {
  const key = (event as KeyboardEvent).key;
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(key)) return;
  event.preventDefault();
  const next = key === "Home" ? "active" : key === "End" ? "attention" : taskView === "active" ? "attention" : "active";
  $("tab-" + next).click(); $("tab-" + next).focus();
});
toggle.addEventListener("click", () => {
  const open = settingsPanel.classList.toggle("open");
  $("popup").classList.toggle("settings-open", open); toggle.setAttribute("aria-expanded", String(open));
  $("settings-label").textContent = open ? "返回下载概览" : "连接设置";
  if (open) $("input-server").focus();
  else { $("input-token").setAttribute("type", "password"); const visibility = $("btn-visibility"); visibility.setAttribute("aria-pressed", "false"); visibility.setAttribute("aria-label", "显示 Token"); visibility.title = "显示 Token"; }
});
void initConnectionEditor({ onTest: (result) => { if (result.saved) void refreshAll(); } });
refresh.addEventListener("click", () => void refreshAll());
async function refreshAll() {
  if (refreshing || submitting) return;
  refreshing = true; submit.disabled = true; refresh.disabled = true; refresh.querySelector("svg")?.classList.add("spin"); list.setAttribute("aria-busy", "true");
  try { connected = await detectServer(); if (connected) await Promise.all([fetchDashboard(), detectPage()]); else { clearDashboard("后台未连接，请检查连接设置"); await detectPage(); } }
  catch { clearDashboard("状态读取失败，请刷新后重试"); }
  finally { refreshing = false; refresh.disabled = false; refresh.querySelector("svg")?.classList.remove("spin"); list.setAttribute("aria-busy", "false"); }
}
void refreshAll();
setInterval(() => { if (!settingsPanel.classList.contains("open") && !document.hidden) void refreshAll(); }, 5000);
