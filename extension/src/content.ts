// ── Types ──────────────────────────────────────────────────────────────
type ButtonState = "idle" | "loading" | "done" | "dup" | "error" | "downloaded";

function extractMangaId(url: string): string | null {
  const match = url.match(/aid-(\d+)/);
  return match ? match[1] : null;
}

// ── List page detection ────────────────────────────────────────────────
const LIST_URL_RE =
  /\/albums-index(?:-page-\d+)?(?:-cate-\d+)?\.html$/;

function isListPage(): boolean {
  return LIST_URL_RE.test(location.pathname + location.search);
}

// ── Existing task / library cache (populated once on load) ─────────────
const taskIds = new Set<string>();
const downloadedIds = new Set<string>();

async function prefetchKnown(): Promise<void> {
  try {
    const resp = await chrome.runtime.sendMessage({ type: "GET_KNOWN_IDS" });
    if (resp && Array.isArray(resp.taskIds)) resp.taskIds.forEach((id: string) => taskIds.add(id));
    if (resp && Array.isArray(resp.libraryIds)) resp.libraryIds.forEach((id: string) => downloadedIds.add(id));
  } catch {
    // non-fatal
  }
}

// ── Inject styles ──────────────────────────────────────────────────────
function injectStyles(): void {
  const id = "wnacg-q-styles";
  if (document.getElementById(id)) return;
  const el = document.createElement("style");
  el.id = id;
  el.textContent = `
    .wnacg-q-btn {
      position: absolute;
      top: 6px;
      right: 6px;
      z-index: 99999;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      border: none;
      border-radius: 6px;
      background: rgba(0,0,0,.55);
      color: #fff;
      font: 700 11px/1 -apple-system, sans-serif;
      cursor: pointer;
      backdrop-filter: blur(4px);
      transition: background .15s, transform .1s;
      white-space: nowrap;
      pointer-events: auto;
    }
    .wnacg-q-btn:hover { background: rgba(0,122,255,.85); transform: scale(1.05); }
    .wnacg-q-btn:active { transform: scale(.96); }
    .wnacg-q-btn[data-state="loading"] { opacity: .6; pointer-events: none; }
    .wnacg-q-btn[data-state="done"]    { background: rgba(52,199,89,.8); pointer-events: none; }
    .wnacg-q-btn[data-state="dup"]     { background: rgba(255,159,10,.75); pointer-events: none; }
    .wnacg-q-btn[data-state="error"]   { background: rgba(255,59,48,.8); }
    .wnacg-q-btn[data-state="downloaded"] { background: rgba(52,199,89,.9); pointer-events: none; }
    .wnacg-q-item { position: relative; }
  `;
  document.head.appendChild(el);
}

// ── Submit a single manga ──────────────────────────────────────────────
async function submitOne(
  mangaId: string,
  url: string,
  titleHint: string
): Promise<{ ok: boolean; dup: boolean }> {
  try {
    const resp = await chrome.runtime.sendMessage({
      type: "SUBMIT_PAGE",
      payload: {
        manga_id: mangaId,
        url,
        title_hint: titleHint,
        page_type: "list",
      },
    });
    if (resp?.ok) {
      const data = resp.data as Record<string, unknown>;
      if (data?.dedupe_reason === "already_active") return { ok: true, dup: true };
      return { ok: true, dup: false };
    }
    return { ok: false, dup: false };
  } catch {
    return { ok: false, dup: false };
  }
}

// ── Button state management ────────────────────────────────────────────
function setBtnState(btn: HTMLElement, state: ButtonState, label?: string): void {
  btn.dataset.state = state;
  switch (state) {
    case "idle":
      btn.textContent = "＋ 加入队列";
      break;
    case "loading":
      btn.textContent = "提交中…";
      break;
    case "done":
      btn.textContent = label ?? "✓ 已加入";
      break;
    case "dup":
      btn.textContent = label ?? "已在队列";
      break;
    case "downloaded":
      btn.textContent = "✓ 已下载";
      break;
    case "error":
      btn.textContent = label ?? "✗ 失败";
      setTimeout(() => setBtnState(btn, "idle"), 2500);
      break;
  }
}

// ── Find the best container to attach the button to ────────────────────
function findContainer(a: HTMLAnchorElement): HTMLElement {
  const selectors = [
    "li.gallary_item",
    "li[class*='gallary']",
    "div.gallary_item",
  ];
  for (const sel of selectors) {
    const el = a.closest<HTMLElement>(sel);
    if (el) return el;
  }
  // Walk up at most 4 levels looking for a block-level container
  let el: HTMLElement = a;
  for (let i = 0; i < 4; i++) {
    const tag = el.tagName;
    if (tag === "LI" || tag === "DIV") return el;
    if (!el.parentElement) break;
    el = el.parentElement;
  }
  return a;
}

// ── Scan the page and inject buttons ───────────────────────────────────
function scanAndInject(): void {
  const anchors = document.querySelectorAll<HTMLAnchorElement>(
    'a[href*="photos-index-aid-"]'
  );

  anchors.forEach((a) => {
    const href = a.getAttribute("href") ?? a.href;
    const mangaId = extractMangaId(href);
    if (!mangaId) return;

    const container = findContainer(a);

    if (!container.classList.contains("wnacg-q-item")) {
      container.classList.add("wnacg-q-item");
    }

    // Avoid duplicates on the same container
    if (container.querySelector(".wnacg-q-btn")) return;

    const btn = document.createElement("button");
    btn.className = "wnacg-q-btn";
    btn.dataset.mangaId = mangaId;
    btn.dataset.href = a.href;

    // Title hint: grab text from nearby heading / title span
    const titleEl =
      container.querySelector<HTMLElement>(
        "h3, h2, .title, .photo_title, span.title"
      ) ?? a;
    btn.dataset.titleHint = (titleEl.textContent ?? "").trim().slice(0, 120);

    // Pre-mark items based on status
    if (downloadedIds.has(mangaId)) {
      setBtnState(btn, "downloaded");
    } else if (taskIds.has(mangaId)) {
      setBtnState(btn, "dup");
    } else {
      setBtnState(btn, "idle");
    }

    container.appendChild(btn);
  });
}

// ── Status bar (bottom-right floating panel) ───────────────────────────
let statusBar: HTMLElement | null = null;
let statusCount = 0;

function updateStatusBar(): void {
  if (!statusBar) return;
  const injected = document.querySelectorAll(".wnacg-q-btn").length;
  const dlCount = document.querySelectorAll('.wnacg-q-btn[data-state="downloaded"]').length;
  const queued = document.querySelectorAll('.wnacg-q-btn[data-state="done"],.wnacg-q-btn[data-state="dup"]').length;
  statusBar.textContent =
    "📥 " + injected + " 项 · " + dlCount + " 已下载 · " + queued + " 已在队列" +
    (statusCount > 0 ? " · 本次 +" + statusCount : "");
}

function createStatusBar(): void {
  if (statusBar) return;
  statusBar = document.createElement("div");
  statusBar.style.cssText = [
    "position:fixed",
    "bottom:12px",
    "right:12px",
    "z-index:999999",
    "padding:8px 14px",
    "background:rgba(0,0,0,.7)",
    "color:#fff",
    "font:600 12px/1.4 -apple-system,sans-serif",
    "border-radius:10px",
    "backdrop-filter:blur(6px)",
    "pointer-events:none",
  ].join(";");
  document.body.appendChild(statusBar);
  updateStatusBar();
}

// ── Click handler (event delegation) ───────────────────────────────────
function onButtonClick(e: Event): void {
  const target = e.target as HTMLElement;
  const btn = target.closest<HTMLElement>(".wnacg-q-btn");
  if (!btn) return;

  e.preventDefault();
  e.stopPropagation();

  const state = btn.dataset.state;
  if (state && state !== "idle" && state !== "error") return;

  const mangaId = btn.dataset.mangaId;
  const href = btn.dataset.href ?? "";
  const titleHint = btn.dataset.titleHint ?? "";
  if (!mangaId) return;

  void (async () => {
    setBtnState(btn, "loading");
    const result = await submitOne(mangaId, href, titleHint);
    if (result.ok && !result.dup) {
      setBtnState(btn, "done");
      taskIds.add(mangaId);
      statusCount++;
    } else if (result.ok && result.dup) {
      setBtnState(btn, "dup");
      taskIds.add(mangaId);
    } else {
      setBtnState(btn, "error");
    }
    updateStatusBar();
  })();
}

// ── Keep buttons alive across lazy-load / infinite scroll ──────────────
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleScan(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(scanAndInject, 300);
}

// ── Original single-page GET_PAGE_INFO handler (kept for popup) ────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_PAGE_INFO") {
    sendResponse({
      mangaId: extractMangaId(location.href),
      url: location.href,
      title: document.title,
    });
  }
});

// ── Bootstrap ──────────────────────────────────────────────────────────
async function init(): Promise<void> {
  if (!isListPage()) return;

  injectStyles();
  createStatusBar();

  await prefetchKnown();
  scanAndInject();

  // Click delegation on document
  document.addEventListener("click", onButtonClick, true);

  // Re-scan on DOM mutations (lazy load / infinite scroll)
  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.body, { childList: true, subtree: true });
}

void init();
