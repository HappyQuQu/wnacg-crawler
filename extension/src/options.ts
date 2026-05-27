import { getSettings } from "./shared.js";

const serverUrl = document.querySelector<HTMLInputElement>("#server-url")!;
const adminUrl = document.querySelector<HTMLInputElement>("#admin-url")!;
const token = document.querySelector<HTMLInputElement>("#token")!;
const save = document.querySelector<HTMLButtonElement>("#save")!;
const message = document.querySelector<HTMLElement>("#message")!;

async function load() {
  const settings = await getSettings();
  serverUrl.value = settings.serverUrl;
  adminUrl.value = settings.adminUrl;
  token.value = settings.token;
}

save.addEventListener("click", async () => {
  await chrome.storage.local.set({
    serverUrl: serverUrl.value.trim() || "http://127.0.0.1:8080",
    adminUrl: adminUrl.value.trim() || "http://127.0.0.1:5173",
    token: token.value.trim()
  });
  message.textContent = "已保存";
});

void load();
