import { apiFetch, connectionErrorMessage, extractMangaId, getSettings } from "./shared.js";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "send-current-page",
    title: "发送到 WNACG Downloader",
    contexts: ["page", "link"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const url = info.linkUrl || tab?.url || "";
  const mangaId = extractMangaId(url);
  if (!mangaId) {
    return;
  }
  try {
    await apiFetch("/api/extension/submit", {
      method: "POST",
      body: JSON.stringify({
        manga_id: mangaId,
        url,
        title_hint: tab?.title || "",
        page_type: "context_menu"
      })
    });
  } catch (error) {
    console.error("Context menu submit failed:", error);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_ITEM_STATUS") {
    if (typeof message.mangaId !== "string" || !/^\d+$/.test(message.mangaId)) {
      sendResponse({ ok: false, error: "无效的作品 ID" });
      return false;
    }
    Promise.all([
      apiFetch("/api/extension/status"),
      apiFetch(`/api/extension/item/${message.mangaId}`),
    ])
      .then(([, data]) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: connectionErrorMessage(error) }));
    return true;
  }

  if (message?.type === "OPEN_ADMIN") {
    getSettings()
      .then((settings) => chrome.tabs.create({ url: settings.adminUrl }))
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type === "GET_KNOWN_IDS") {
    Promise.all([
      apiFetch<{ items: { manga_id: string }[] }>("/api/tasks").catch(() => ({ items: [] })),
      apiFetch<{ items: { manga_id: string }[] }>("/api/library").catch(() => ({ items: [] })),
    ]).then(([tasks, library]) => {
      const taskIds = (tasks.items ?? []).map((t) => t.manga_id);
      const libraryIds = (library.items ?? []).map((t) => t.manga_id);
      sendResponse({ taskIds, libraryIds });
    }).catch(() => sendResponse({ taskIds: [], libraryIds: [] }));
    return true;
  }

  if (message?.type !== "SUBMIT_PAGE") {
    return false;
  }
  apiFetch("/api/extension/submit", {
    method: "POST",
    body: JSON.stringify(message.payload)
  })
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: String(error) }));
  return true;
});
