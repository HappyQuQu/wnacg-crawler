import { getSettings } from "./shared.js";
import { checkConnection, initConnectionEditor, type ConnectionResult } from "./connection.js";

let connectionVersion = 0;
function showConnection(result: ConnectionResult) {
  const status = document.getElementById("status-badge")!;
  status.textContent = result.connected ? "已连接" : result.unauthorized ? "未配对" : "离线";
  status.className = `badge connection-badge ${result.connected ? "badge-green" : result.unauthorized ? "badge-orange" : "badge-red"}`;
  const state = document.getElementById("test-state")!;
  state.textContent = result.connected ? "连接正常" : "连接未完成";
  state.className = `badge ${result.connected ? "badge-green" : "badge-orange"}`;
  document.getElementById("test-message")!.textContent = result.message + (result.saved ? "" : "（测试中的地址尚未保存）");
  document.getElementById("tested-address")!.textContent = result.settings.serverUrl;
}

void (async () => {
  await initConnectionEditor({ onTest: (result) => { connectionVersion++; showConnection(result); } });
  try { const version = ++connectionVersion; const result = await checkConnection(await getSettings()); if (version === connectionVersion) showConnection(result); }
  catch { document.getElementById("test-message")!.textContent = "暂时无法读取连接设置，请重新打开页面。"; }
})();

document.getElementById("open-admin")!.addEventListener("click", async () => {
  try { await chrome.tabs.create({ url: (await getSettings()).adminUrl }); }
  catch { document.getElementById("settings-msg")!.textContent = "无法打开后台，请检查已保存的地址。"; }
});
