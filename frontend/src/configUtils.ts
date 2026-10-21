import type { AppConfig } from "./types";

export const configFields = [
  { key: "theme", label: "界面主题", section: "appearance" },
  { key: "download_path", label: "下载目录", section: "download" },
  { key: "max_thread", label: "图片并发", section: "download" },
  { key: "request_delay_ms", label: "请求间隔", section: "download" },
  { key: "timeout_seconds", label: "请求超时", section: "download" },
  { key: "is_zip", label: "自动打包 ZIP", section: "download" },
  { key: "enable_image_compression", label: "图片压缩", section: "compression" },
  { key: "image_max_size_kb", label: "图片大小上限", section: "compression" },
  { key: "keep_original_images", label: "保留原图", section: "compression" },
  { key: "allow_image_resize", label: "允许缩小分辨率", section: "compression" },
  { key: "proxy.is_proxy", label: "启用网络代理", section: "network" },
  { key: "proxy.address", label: "代理地址", section: "network" },
  { key: "proxy.port", label: "代理端口", section: "network" },
  { key: "proxy.username", label: "代理账号", section: "network" },
  { key: "proxy.password", label: "代理密码", section: "network" },
  { key: "extension_token", label: "扩展 Token", section: "extension" },
] as const;
export type ConfigPath = typeof configFields[number]["key"];
export type ConfigErrors = Partial<Record<ConfigPath, string>>;

function value(config: AppConfig, path: ConfigPath): unknown {
  return path.startsWith("proxy.")
    ? config.proxy[path.slice(6) as keyof AppConfig["proxy"]]
    : config[path as keyof AppConfig];
}

export function changedConfigFields(draft: AppConfig | null, saved: AppConfig | null) {
  return draft && saved ? configFields.filter((field) => !Object.is(value(draft, field.key), value(saved, field.key))) : [];
}

// Update server values while retaining edits made since the previous snapshot.
export function mergeConfigDraft(server: AppConfig, draft: AppConfig | null, baseline: AppConfig | null, force: ConfigPath[] = []): AppConfig {
  const top: Record<string, unknown> = {};
  const proxy: Record<string, unknown> = {};
  for (const field of changedConfigFields(draft, baseline)) {
    if (force.includes(field.key)) continue;
    if (field.key.startsWith("proxy.")) proxy[field.key.slice(6)] = value(draft!, field.key);
    else top[field.key] = value(draft!, field.key);
  }
  return { ...server, ...top, proxy: { ...server.proxy, ...proxy } } as AppConfig;
}

export function editableConfig(config: AppConfig) {
  return {
    theme: config.theme, download_path: config.download_path, is_zip: config.is_zip,
    enable_image_compression: config.enable_image_compression, image_max_size_kb: config.image_max_size_kb,
    keep_original_images: config.keep_original_images, allow_image_resize: config.allow_image_resize,
    max_thread: config.max_thread, request_delay_ms: config.request_delay_ms,
    timeout_seconds: config.timeout_seconds, extension_token: config.extension_token, proxy: { ...config.proxy },
  };
}

export function validateConfig(config: AppConfig): ConfigErrors {
  const errors: ConfigErrors = {};
  const integer = (key: ConfigPath, input: number, min: number, max: number, message: string) => {
    if (!Number.isInteger(input) || input < min || input > max) errors[key] = message;
  };
  if (!config.download_path.trim()) errors.download_path = "请输入下载目录。";
  integer("max_thread", config.max_thread, 1, 20, "请输入 1–20 的整数。");
  integer("request_delay_ms", config.request_delay_ms, 0, 10000, "请输入 0–10000 的整数。");
  integer("timeout_seconds", config.timeout_seconds, 5, 120, "请输入 5–120 的整数。");
  integer("image_max_size_kb", config.image_max_size_kb, 1, 102400, "请输入 1–102400 的整数。");
  integer("proxy.port", config.proxy.port, 1, 65535, "请输入 1–65535 的整数。");
  if (config.proxy.is_proxy && !config.proxy.address.trim()) errors["proxy.address"] = "请输入代理地址。";
  if (config.extension_token.length > 256) errors.extension_token = "Token 长度不能超过 256 个字符。";
  return errors;
}
