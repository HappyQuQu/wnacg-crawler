import { extractMangaId, type PageInfo } from "./shared.js";

function collectPageInfo(): PageInfo {
  return {
    mangaId: extractMangaId(location.href),
    url: location.href,
    title: document.title
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_PAGE_INFO") {
    sendResponse(collectPageInfo());
  }
});
