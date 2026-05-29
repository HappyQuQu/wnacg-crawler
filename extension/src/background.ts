import { apiFetch, extractMangaId } from "./shared.js";

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
  await apiFetch("/api/extension/submit", {
    method: "POST",
    body: JSON.stringify({
      manga_id: mangaId,
      url,
      title_hint: tab?.title || "",
      page_type: "context_menu"
    })
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
