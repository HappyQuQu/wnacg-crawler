import { apiFetch, connectionErrorMessage, getSettings, type ExtensionSettings } from "./shared.js";

export type ConnectionResult = { connected: boolean; message: string; settings: ExtensionSettings; saved: boolean; unauthorized: boolean };
type Callbacks = { onSaved?: (settings: ExtensionSettings) => void; onTest?: (result: ConnectionResult) => void };

export async function checkConnection(settings: ExtensionSettings, saved = true): Promise<ConnectionResult> {
  try {
    await apiFetch("/api/extension/status", { signal: AbortSignal.timeout(8000) }, settings);
    return { connected: true, message: "后台连接正常", settings, saved, unauthorized: false };
  } catch (error) {
    return { connected: false, message: connectionErrorMessage(error), settings, saved, unauthorized: error instanceof Error && /HTTP (401|403)\b/.test(error.message) };
  }
}

export async function initConnectionEditor(callbacks: Callbacks = {}): Promise<void> {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const server = $<HTMLInputElement>("input-server"), admin = $<HTMLInputElement>("input-admin"), token = $<HTMLInputElement>("input-token");
  const fields = $<HTMLFieldSetElement>("editor-fields"), save = $<HTMLButtonElement>("btn-save"), test = $<HTMLButtonElement>("btn-test"), discard = $<HTMLButtonElement>("btn-discard");
  const clear = $<HTMLButtonElement>("btn-clear"), paste = $<HTMLButtonElement>("btn-paste"), visibility = $<HTMLButtonElement>("btn-visibility");
  const message = $("settings-msg"), state = $("editor-status"), tokenState = $("token-state");
  let baseline: ExtensionSettings | null = null;
  let busy = false;
  const read = (): ExtensionSettings => ({ serverUrl: server.value.trim().replace(/\/+$/, ""), adminUrl: admin.value.trim().replace(/\/+$/, ""), token: token.value.trim() });
  const changed = () => baseline ? Object.entries(read()).filter(([key, value]) => value !== baseline![key as keyof ExtensionSettings]).length : 0;
  function validate(input: HTMLInputElement): boolean {
    let valid = false;
    try { const url = new URL(input.value.trim()); valid = ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash; } catch { /* show inline feedback */ }
    const error = $(input.id + "-error");
    error.textContent = valid ? "" : "请输入有效的 http:// 或 https:// 地址。";
    error.hidden = valid;
    input.setAttribute("aria-invalid", String(!valid));
    return valid;
  }
  function update(): boolean {
    const serverValid = validate(server), adminValid = validate(admin), count = changed();
    const tokenValid = token.value.trim().length <= 256;
    token.setAttribute("aria-invalid", String(!tokenValid));
    $("input-token-error").hidden = tokenValid;
    const valid = serverValid && adminValid && tokenValid;
    state.textContent = baseline ? count ? `${count} 项更改尚未保存` : "与已保存设置一致" : "正在读取设置…";
    state.classList.toggle("dirty", count > 0);
    tokenState.textContent = token.value.trim() !== baseline?.token ? "待保存" : token.value.trim() ? "已填写" : "未填写";
    tokenState.className = `badge ${token.value.trim() !== baseline?.token ? "badge-orange" : token.value.trim() ? "badge-green" : "badge-blue"}`;
    save.disabled = busy || !baseline || !valid || !count;
    test.disabled = busy || !baseline || !valid;
    discard.disabled = busy || !count;
    clear.disabled = busy || !token.value;
    fields.disabled = busy || !baseline;
    return valid;
  }
  function notify(text: string, tone: "ok" | "err" | "warn") { message.textContent = text; message.className = `msg msg-${tone}`; }
  function apply(settings: ExtensionSettings) { server.value = settings.serverUrl; admin.value = settings.adminUrl; token.value = settings.token; update(); }
  [server, admin, token].forEach((input) => input.addEventListener("input", () => { message.textContent = ""; update(); }));
  discard.addEventListener("click", () => { if (baseline) apply(baseline); message.textContent = ""; });
  visibility.addEventListener("click", () => {
    const show = token.type === "password";
    token.type = show ? "text" : "password";
    visibility.setAttribute("aria-pressed", String(show));
    visibility.setAttribute("aria-label", show ? "隐藏 Token" : "显示 Token");
    visibility.title = show ? "隐藏 Token" : "显示 Token";
  });
  paste.addEventListener("click", async () => {
    try { token.value = (await navigator.clipboard.readText()).trim(); update(); notify("已粘贴，保存后生效。", "ok"); }
    catch { notify("无法读取剪贴板，请手动粘贴 Token。", "err"); }
  });
  clear.addEventListener("click", () => { token.value = ""; update(); notify("Token 已清空，保存后生效。", "warn"); });
  test.addEventListener("click", async () => {
    if (busy || !update()) return;
    const draft = read(), isSaved = changed() === 0;
    busy = true; test.textContent = "检测中…"; update();
    const result = await checkConnection(draft, isSaved);
    callbacks.onTest?.(result);
    notify(result.connected ? isSaved ? "后台连接正常。" : "连接正常，当前更改尚未保存。" : result.message, result.connected ? "ok" : "err");
    busy = false; test.textContent = "测试连接"; update();
  });
  save.addEventListener("click", async () => {
    if (busy || !update() || !changed()) return;
    const settings = read();
    busy = true; save.textContent = "保存中…"; update();
    try {
      await chrome.storage.local.set(settings);
      baseline = settings;
      apply(settings);
      callbacks.onSaved?.(settings);
      const result = await checkConnection(settings);
      callbacks.onTest?.(result);
      notify(result.connected ? "设置已保存，后台连接正常。" : `设置已保存。${result.message}`, result.connected ? "ok" : "warn");
    } catch { notify("保存失败，当前编辑已保留，请重试。", "err"); }
    finally { busy = false; save.textContent = "保存设置"; update(); }
  });
  try { const saved = await getSettings(); baseline = { serverUrl: saved.serverUrl.trim().replace(/\/+$/, ""), adminUrl: saved.adminUrl.trim().replace(/\/+$/, ""), token: saved.token.trim() }; apply(baseline); }
  catch { notify("读取设置失败，请重新打开扩展后重试。", "err"); }
}
