import type { ItemStatus, LibraryPresence } from "./shared.js";

type ButtonState = "idle" | "loading" | "done" | "dup" | "error" | "downloaded" | "archived" | "unknown" | "attention";

function extractMangaId(url: string): string | null {
  const match = url.match(/aid-(\d+)/);
  return match ? match[1] : null;
}

// ── List page detection ────────────────────────────────────────────────
const LIST_URL_RE =
  /\/albums-index(?:-page-\d+)?(?:-cate-\d+)?\.html$/;

function isListPage(): boolean {
  return LIST_URL_RE.test(location.pathname);
}

function detailMangaId(): string | null {
  return location.pathname.match(/^\/photos-index(?:-page-\d+)?-aid-(\d+)\.html$/)?.[1] ?? null;
}

// ── Persisted task and library state ───────────────────────────────────
const taskStates = new Map<string, string>();
const libraryItems = new Map<string, LibraryPresence>();
let knownLoaded = false;
let knownError = "正在检查资料库…";

async function prefetchKnown(): Promise<void> {
  try {
    const resp = await chrome.runtime.sendMessage({ type: "GET_KNOWN_IDS" });
    if (!resp?.ok || !Array.isArray(resp.tasks) || !Array.isArray(resp.library)) {
      throw new Error(resp?.error || "无法读取资料库状态，请刷新后重试");
    }
    taskStates.clear();
    libraryItems.clear();
    resp.tasks.forEach((item: { manga_id: string; status: string }) => {
      if (["pending", "queued", "running", "paused"].includes(item.status)) taskStates.set(item.manga_id, item.status);
    });
    resp.library.forEach((item: LibraryPresence) => libraryItems.set(item.manga_id, item));
    knownLoaded = true;
  } catch (error) {
    knownLoaded = false;
    knownError = error instanceof Error ? error.message : "后台未连接，服务器状态未知";
  }
}

function presenceLabel(item: LibraryPresence): string {
  return `${item.has_local_files ? "服务器有文件" : item.files_removed_at ? "服务器已清理" : "服务器无文件"} · ${item.taken_at ? "已下载" : "未下载"}`;
}

// ── Inject styles ──────────────────────────────────────────────────────
function injectStyles(): void {
  const id = "wnacg-q-styles";
  if (document.getElementById(id)) return;
  const el = document.createElement("style");
  el.id = id;
  el.textContent = `
    .wnacg-q-btn { --q-bg:#fff; --q-text:#0066d6; --q-line:rgba(60,60,67,.16); position:absolute; top:7px; right:7px; z-index:99999; display:inline-flex; align-items:center; gap:5px; min-height:27px; padding:4px 8px; border:1px solid var(--q-line); border-radius:7px; background:var(--q-bg); color:var(--q-text); box-shadow:0 1px 4px #0000000d; font:550 11px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; cursor:pointer; white-space:normal; max-width:calc(100% - 14px); text-align:left; pointer-events:auto; transition:background 150ms,border-color 150ms; }
    .wnacg-q-btn svg { width:13px; height:13px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; flex-shrink:0; }
    .wnacg-q-btn:hover:not(:disabled) { border-color:#007aff; background:#e8f2ff; }
    .wnacg-q-btn:focus-visible { outline:2px solid #007aff; outline-offset:2px; }
    .wnacg-q-btn[data-state="loading"] { opacity:.55; cursor:default; }
    .wnacg-q-btn[data-state="done"],.wnacg-q-btn[data-state="downloaded"] { color:#248a3d; }
    .wnacg-q-btn[data-state="dup"] { color:#636366; }
    .wnacg-q-btn[data-state="error"] { color:#c93400; }
    .wnacg-q-btn[data-state="archived"],.wnacg-q-btn[data-state="attention"],.wnacg-q-btn[data-state="unknown"] { color:#9a6700; }
    .wnacg-q-item { position:relative; }
    .wnacg-q-status { position:fixed; bottom:12px; right:12px; z-index:999999; display:flex; align-items:center; gap:7px; max-width:calc(100vw - 24px); padding:10px 13px; border:1px solid rgba(60,60,67,.16); border-radius:10px; background:#fff; color:#636366; font:500 11px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; box-shadow:0 2px 12px #0000000d; pointer-events:none; }
    .wnacg-q-status svg { width:15px; height:15px; color:#0066d6; fill:none; stroke:currentColor; stroke-width:1.8; flex-shrink:0; }
    @media (prefers-color-scheme:dark) { .wnacg-q-btn { --q-bg:#1c1c1e; --q-text:#70b5ff; --q-line:rgba(235,235,245,.2); } .wnacg-q-btn:hover:not(:disabled) { background:#18314c; } .wnacg-q-btn[data-state="done"],.wnacg-q-btn[data-state="downloaded"] { color:#56df7b; } .wnacg-q-btn[data-state="dup"] { color:#aeaeb2; } .wnacg-q-btn[data-state="error"] { color:#ff8179; } .wnacg-q-status { background:#1c1c1e; color:#aeaeb2; border-color:rgba(235,235,245,.2); } .wnacg-q-status svg { color:#70b5ff; } }
    @media (prefers-reduced-motion:reduce) { .wnacg-q-btn { transition:none; } }
  `;
  document.head.appendChild(el);
}

// ── Submit a single manga ──────────────────────────────────────────────
async function submitOne(
  mangaId: string,
  url: string,
  titleHint: string,
  pageType: "list" | "detail" = "list"
): Promise<{ ok: boolean; dup: boolean; status?: string }> {
  try {
    const resp = await chrome.runtime.sendMessage({
      type: "SUBMIT_PAGE",
      payload: {
        manga_id: mangaId,
        url,
        title_hint: titleHint,
        page_type: pageType,
      },
    });
    if (resp?.ok) {
      const data = resp.data as Record<string, unknown>;
      return {
        ok: true,
        dup: data?.dedupe_reason === "already_active",
        status: typeof data?.status === "string" ? data.status : undefined,
      };
    }
    return { ok: false, dup: false };
  } catch {
    return { ok: false, dup: false };
  }
}

// ── Detail page entry ──────────────────────────────────────────────────
function initDetailPage(mangaId: string): void {
  if (document.getElementById("wnacg-detail-panel")) return;

  const styles = document.createElement("style");
  styles.id = "wnacg-detail-styles";
  styles.textContent = `
    #wnacg-detail-panel { --wd-bg:#fff; --wd-inset:#f2f2f7; --wd-text:#1c1c1e; --wd-muted:#636366; --wd-line:rgba(60,60,67,.12); --wd-primary:#007aff; --wd-green:#248a3d; --wd-green-bg:rgba(52,199,89,.12); --wd-red:#c93400; --wd-red-bg:rgba(255,59,48,.1); box-sizing:border-box; display:block; clear:both; position:relative; margin:16px 0; padding:16px; border:1px solid var(--wd-line); border-radius:12px; background:var(--wd-bg); color:var(--wd-text); text-align:left; font:13px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    #wnacg-detail-panel.wnacg-detail-floating { position:fixed; right:16px; bottom:16px; z-index:999999; width:340px; max-width:calc(100vw - 32px); margin:0; box-shadow:0 4px 20px #00000018; }
    #wnacg-detail-panel * { box-sizing:border-box; }
    #wnacg-detail-panel .wnacg-detail-header,#wnacg-detail-panel .wnacg-detail-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    #wnacg-detail-panel .wnacg-detail-header { margin-bottom:12px; }
    #wnacg-detail-panel .wnacg-detail-mark { display:grid; place-items:center; width:30px; height:31px; border-radius:8px; color:#fff; background:#007aff; }
    #wnacg-detail-panel .wnacg-detail-mark img { display:block; width:100%; height:100%; }
    #wnacg-detail-panel .wnacg-detail-brand-copy { display:grid; gap:2px; margin-right:auto; min-width:0; }
    #wnacg-detail-panel .wnacg-detail-brand { margin:0; color:var(--wd-text); font-size:12px; font-weight:650; }
    #wnacg-detail-panel .wnacg-detail-brand-copy > span { color:var(--wd-muted); font-size:10px; }
    #wnacg-detail-panel .wnacg-detail-status { display:inline-flex; align-items:center; gap:5px; border:1px solid var(--wd-line); border-radius:20px; padding:2px 7px; font-size:10px; color:var(--wd-muted); background:var(--wd-bg); }
    #wnacg-detail-panel .wnacg-detail-status::before { content:""; width:5px; height:5px; border-radius:50%; background:currentColor; }
    #wnacg-detail-panel .wnacg-detail-status[data-connected="true"] { color:var(--wd-green); }
    #wnacg-detail-panel .wnacg-detail-status[data-connected="false"] { color:var(--wd-red); }
    #wnacg-detail-panel .wnacg-detail-meta { margin:0 0 13px; padding:10px 12px; border:1px solid var(--wd-line); border-radius:8px; color:var(--wd-muted); background:var(--wd-inset); font-size:11px; line-height:1.8; overflow-wrap:anywhere; }
    #wnacg-detail-panel button { display:inline-flex; align-items:center; justify-content:center; gap:5px; position:static; float:none; min-height:33px; margin:0; padding:0 11px; width:auto; height:auto; border:1px solid var(--wd-line); border-radius:7px; box-shadow:none; background:var(--wd-bg); color:var(--wd-text); font:500 11px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; text-decoration:none; cursor:pointer; transition:background 150ms; }
    #wnacg-detail-panel button:hover:not(:disabled) { background:var(--wd-inset); }
    #wnacg-detail-panel button:disabled { opacity:.45; cursor:default; }
    #wnacg-detail-panel button:focus-visible { outline:2px solid var(--wd-primary); outline-offset:3px; }
    #wnacg-detail-panel .wnacg-detail-submit { background:var(--wd-primary); color:#fff; border-color:var(--wd-primary); }
    #wnacg-detail-panel .wnacg-detail-submit:hover:not(:disabled) { filter:brightness(.95); }
    #wnacg-detail-panel .wnacg-detail-refresh { margin-left:auto; padding:0 8px; }
    #wnacg-detail-panel svg { width:15px; height:15px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
    @media (prefers-color-scheme:dark) { #wnacg-detail-panel { --wd-bg:#1c1c1e; --wd-inset:#242426; --wd-text:#f5f5f7; --wd-muted:#aeaeb2; --wd-line:rgba(235,235,245,.14); --wd-primary:#0070e0; --wd-green:#56df7b; --wd-green-bg:rgba(48,209,88,.16); --wd-red:#ff8179; --wd-red-bg:rgba(255,69,58,.16); } }
    @media (prefers-reduced-motion:reduce) { #wnacg-detail-panel button { transition:none; } }
  `;
  document.head.appendChild(styles);

  const panel = document.createElement("section");
  panel.id = "wnacg-detail-panel";
  panel.setAttribute("aria-label", "WNACG 下载器 下载入口");
  panel.innerHTML = `
    <div class="wnacg-detail-header">
      <span class="wnacg-detail-mark"><img src="${chrome.runtime.getURL("icons/icon.svg")}" alt="" width="30" height="31"></span><div class="wnacg-detail-brand-copy"><strong class="wnacg-detail-brand">WNACG 下载器</strong><span>浏览器扩展 · 作品入口</span></div>
      <span class="wnacg-detail-status" role="status">连接中</span>
    </div>
    <p class="wnacg-detail-meta" role="status"></p>
    <div class="wnacg-detail-actions">
      <button type="button" class="wnacg-detail-submit" disabled>加入队列</button>
      <button type="button" class="wnacg-detail-admin">打开后台</button>
      <button type="button" class="wnacg-detail-refresh" title="刷新后台状态" aria-label="刷新后台状态">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 11.5-1L20 9M4 15l2.5 3A7 7 0 0 0 18 17"/></svg>
      </button>
    </div>`;
  const heading = document.querySelector<HTMLElement>("#bodywrap h2, .uwtitle h2, h2");
  if (heading) heading.after(panel);
  else {
    panel.classList.add("wnacg-detail-floating");
    document.body.appendChild(panel);
  }

  const status = panel.querySelector<HTMLElement>(".wnacg-detail-status")!;
  const meta = panel.querySelector<HTMLElement>(".wnacg-detail-meta")!;
  const submit = panel.querySelector<HTMLButtonElement>(".wnacg-detail-submit")!;
  const admin = panel.querySelector<HTMLButtonElement>(".wnacg-detail-admin")!;
  const refresh = panel.querySelector<HTMLButtonElement>(".wnacg-detail-refresh")!;
  const statusLabels: Record<string, string> = {
    ready: "可加入下载队列", pending: "待确认", queued: "排队中", running: "下载中",
    paused: "已暂停，请在后台继续", partial: "部分完成，可重新加入", completed: "有文件",
    archived: "已清理，可重新下载",
    failed: "下载失败，可重新加入", cancelled: "已取消，可重新加入",
  };
  let refreshing = false;
  let submitting = false;
  meta.textContent = `ID ${mangaId} · 正在检查本地状态…`;

  function showItemStatus(item: ItemStatus): void {
    const itemStatus = item.status;
    meta.textContent = `ID ${mangaId} · ${item.in_library ? presenceLabel(item) : "服务器无记录"} · ${statusLabels[itemStatus] ?? itemStatus}`;
    submit.disabled = ["pending", "queued", "running", "paused", "completed"].includes(itemStatus);
    submit.textContent = itemStatus === "completed" ? "服务器有文件" :
      itemStatus === "paused" ? "已暂停" : submit.disabled ? "已在队列" : itemStatus === "archived" ? "重新下载" : "加入队列";
  }

  async function refreshStatus(): Promise<void> {
    if (refreshing || submitting) return;
    refreshing = true;
    refresh.disabled = true;
    submit.disabled = true;
    panel.setAttribute("aria-busy", "true");
    try {
      const resp = await chrome.runtime.sendMessage({ type: "GET_ITEM_STATUS", mangaId });
      if (!resp?.ok || typeof resp.data?.status !== "string") {
        const hint = typeof resp?.error === "string" ? resp.error : "请检查后台和 Token 后刷新";
        status.textContent = "未连接";
        status.dataset.connected = "false";
        meta.textContent = `ID ${mangaId} · ${hint}`;
        submit.textContent = "加入队列";
        return;
      }
      status.textContent = "已连接";
      status.dataset.connected = "true";
      showItemStatus(resp.data as ItemStatus);
    } catch {
      status.textContent = "未连接";
      status.dataset.connected = "false";
      meta.textContent = `ID ${mangaId} · 无法连接后台，请检查后台和 Token 后刷新`;
      submit.textContent = "加入队列";
      submit.disabled = true;
    } finally {
      refreshing = false;
      refresh.disabled = false;
      panel.setAttribute("aria-busy", "false");
    }
  }

  refresh.addEventListener("click", () => void refreshStatus());
  admin.addEventListener("click", async () => {
    admin.disabled = true;
    try {
      const resp = await chrome.runtime.sendMessage({ type: "OPEN_ADMIN" });
      if (!resp?.ok) throw new Error("Admin unavailable");
    } catch {
      meta.textContent = "打开后台失败，请检查扩展连接设置或重新加载扩展";
    } finally {
      admin.disabled = false;
    }
  });
  submit.addEventListener("click", async () => {
    if (submitting || refreshing || submit.disabled) return;
    submitting = true;
    submit.disabled = true;
    refresh.disabled = true;
    submit.textContent = "提交中…";
    const titleHint = (heading?.textContent || document.title).trim().slice(0, 120);
    const result = await submitOne(mangaId, location.href, titleHint, "detail");
    submitting = false;
    refresh.disabled = false;
    if (result.ok) {
      await refreshStatus();
    } else {
      submit.disabled = false;
      submit.textContent = "重试加入";
      meta.textContent = `ID ${mangaId} · 提交失败，请重试或检查后台连接`;
    }
  });

  void refreshStatus();
  const timer = setInterval(() => {
    if (!panel.isConnected) clearInterval(timer);
    else if (!document.hidden) void refreshStatus();
  }, 15000);
}

// ── Button state management ────────────────────────────────────────────
function setBtnState(btn: HTMLElement, state: ButtonState, label?: string): void {
  btn.dataset.state = state;
  btn.toggleAttribute("disabled", ["loading", "done", "dup", "downloaded", "unknown"].includes(state));
  const paths = state === "idle" ? '<path d="M12 5v14M5 12h14"/>' : state === "error" ? '<path d="m6 6 12 12M6 18 18 6"/>' : state === "loading" ? '<path d="M20 12a8 8 0 1 1-8-8"/>' : '<path d="m5 12 4 4L19 6"/>';
  const defaultLabels: Record<ButtonState, string> = { idle: "添加下载", loading: "提交中…", done: "已加入", dup: "已在队列", downloaded: "服务器有文件", archived: "已清理 · 重新下载", unknown: "服务器状态未知", attention: "服务器文件不完整 · 重新加入", error: "重试加入" };
  btn.replaceChildren();
  btn.insertAdjacentHTML("afterbegin", `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`);
  const text = document.createElement("span");
  text.textContent = label ?? defaultLabels[state];
  btn.appendChild(text);
  if (state === "error") setTimeout(() => { if (btn.dataset.state === "error") setBtnState(btn, "idle"); }, 2500);
}

function showListStatus(btn: HTMLElement): void {
  if (btn.dataset.state === "loading") return;
  const mangaId = btn.dataset.mangaId!;
  const item = libraryItems.get(mangaId);
  const taskStatus = taskStates.get(mangaId);
  btn.dataset.taken = String(!!item?.taken_at);
  btn.title = !knownLoaded ? knownError : item ? presenceLabel(item) : "服务器无记录";
  if (!knownLoaded) setBtnState(btn, "unknown");
  else if (taskStatus) setBtnState(btn, "dup", `${taskStatus === "running" ? "下载中" : taskStatus === "paused" ? "已暂停" : "已在队列"}${item?.taken_at ? " · 已下载" : ""}`);
  else if (item?.status === "completed") setBtnState(btn, "downloaded", presenceLabel(item));
  else if (item?.status === "archived") setBtnState(btn, "archived", `已清理 · ${item.taken_at ? "已下载" : "未下载"} · 重新下载`);
  else if (item) setBtnState(btn, "attention", `${item.has_local_files ? "服务器文件不完整" : "服务器无文件"} · ${item.taken_at ? "已下载" : "未下载"} · 加入队列`);
  else setBtnState(btn, "idle");
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

    showListStatus(btn);

    container.appendChild(btn);
  });
}

// ── Status bar (bottom-right floating panel) ───────────────────────────
let statusBar: HTMLElement | null = null;
let statusCount = 0;

function updateStatusBar(): void {
  if (!statusBar) return;
  if (!knownLoaded) { statusBar.textContent = knownError; return; }
  const injected = document.querySelectorAll(".wnacg-q-btn").length;
  const dlCount = document.querySelectorAll('.wnacg-q-btn[data-state="downloaded"]').length;
  const queued = document.querySelectorAll('.wnacg-q-btn[data-state="done"],.wnacg-q-btn[data-state="dup"]').length;
  statusBar.replaceChildren();
  statusBar.insertAdjacentHTML("afterbegin", '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4"/></svg>');
  const text = document.createElement("span");
  const historical = document.querySelectorAll('.wnacg-q-btn[data-state="archived"]').length;
  const taken = document.querySelectorAll('.wnacg-q-btn[data-taken="true"]').length;
  text.textContent = `本页 ${injected} · 服务器有 ${dlCount} · 已下载 ${taken} · 已清理 ${historical} · 排队 ${queued}` + (statusCount > 0 ? " · 本次 +" + statusCount : "");
  statusBar.appendChild(text);
}

function createStatusBar(): void {
  if (statusBar) return;
  statusBar = document.createElement("div");
  statusBar.className = "wnacg-q-status";
  statusBar.setAttribute("role", "status");
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
  if (state && !["idle", "error", "archived", "attention"].includes(state)) return;

  const mangaId = btn.dataset.mangaId;
  const href = btn.dataset.href ?? "";
  const titleHint = btn.dataset.titleHint ?? "";
  if (!mangaId) return;

  void (async () => {
    setBtnState(btn, "loading");
    const result = await submitOne(mangaId, href, titleHint);
    if (result.ok && !result.dup) {
      setBtnState(btn, "done");
      taskStates.set(mangaId, "queued");
      statusCount++;
    } else if (result.ok && result.dup) {
      setBtnState(btn, "dup");
      taskStates.set(mangaId, "queued");
    } else {
      setBtnState(btn, "error");
    }
    updateStatusBar();
  })();
}

// ── Keep buttons alive across lazy-load / infinite scroll ──────────────
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let refreshingList = false;

async function refreshListStatus(): Promise<void> {
  if (refreshingList) return;
  refreshingList = true;
  try {
    await prefetchKnown();
    scanAndInject();
    document.querySelectorAll<HTMLElement>(".wnacg-q-btn").forEach(showListStatus);
    updateStatusBar();
  } finally { refreshingList = false; }
}

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
  const mangaId = detailMangaId();
  if (mangaId) {
    initDetailPage(mangaId);
    return;
  }
  if (!isListPage()) return;

  injectStyles();
  createStatusBar();

  await refreshListStatus();
  setInterval(() => { if (!document.hidden) void refreshListStatus(); }, 15000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void refreshListStatus(); });

  // Click delegation on document
  document.addEventListener("click", onButtonClick, true);

  // Re-scan on DOM mutations (lazy load / infinite scroll)
  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.body, { childList: true, subtree: true });
}

void init();
