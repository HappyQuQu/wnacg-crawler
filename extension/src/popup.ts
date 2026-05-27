import { apiFetch, extractMangaId, getSettings, type PageInfo } from "./shared.js";

const statusEl = document.querySelector<HTMLElement>("#status")!;
const serverEl = document.querySelector<HTMLElement>("#server")!;
const titleEl = document.querySelector<HTMLElement>("#page-title")!;
const metaEl = document.querySelector<HTMLElement>("#page-meta")!;
const submitEl = document.querySelector<HTMLButtonElement>("#submit")!;
const openAdminEl = document.querySelector<HTMLButtonElement>("#open-admin")!;

let currentPage: PageInfo = {
  mangaId: null,
  url: "",
  title: ""
};

type ItemStatus = {
  manga_id: string;
  status: string;
  task_id: string | null;
};

async function detectServer() {
  try {
    const settings = await getSettings();
    await apiFetch("/api/extension/status");
    statusEl.textContent = "已连接";
    serverEl.textContent = settings.serverUrl;
  } catch {
    statusEl.textContent = "离线";
    serverEl.textContent = "后台未连接";
  }
}

async function detectPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || "";
  currentPage = {
    mangaId: extractMangaId(url),
    url,
    title: tab?.title || ""
  };
  titleEl.textContent = currentPage.title || "当前页面";
  metaEl.textContent = currentPage.mangaId ? `ID ${currentPage.mangaId}` : "未识别到 ID";
  submitEl.disabled = !currentPage.mangaId;
  if (currentPage.mangaId) {
    try {
      const item = await apiFetch<ItemStatus>(`/api/extension/item/${currentPage.mangaId}`);
      metaEl.textContent = `ID ${item.manga_id} · ${statusLabel(item.status)}`;
    } catch {
      metaEl.textContent = `ID ${currentPage.mangaId} · 状态查询失败`;
    }
  }
}

submitEl.addEventListener("click", async () => {
  if (!currentPage.mangaId) {
    return;
  }
  const response = await chrome.runtime.sendMessage({
    type: "SUBMIT_PAGE",
    payload: {
      manga_id: currentPage.mangaId,
      url: currentPage.url,
      title_hint: currentPage.title,
      page_type: "detail"
    }
  });
  statusEl.textContent = response?.ok ? "已发送" : "发送失败";
  if (!response?.ok) {
    serverEl.textContent = response?.error || "请检查后台和 Token";
  }
});

openAdminEl.addEventListener("click", async () => {
  const settings = await getSettings();
  await chrome.tabs.create({ url: settings.adminUrl });
});

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    ready: "可加入",
    pending: "待确认",
    queued: "排队中",
    running: "下载中",
    paused: "已暂停",
    partial: "部分完成",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消"
  };
  return labels[status] ?? status;
}

void detectServer();
void detectPage();
