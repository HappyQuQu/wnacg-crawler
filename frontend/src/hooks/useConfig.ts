import { useCallback, useState } from "react";
import type { AppConfig } from "../types";
import { fetchConfig, saveConfigApi, generateExtensionTokenApi } from "../api";

export function useConfig() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await fetchConfig();
    setConfig(data);
    setInitialLoading(false);
  }, []);

  const save = useCallback(async () => {
    if (!config) return null;
    const data = await saveConfigApi({
      download_path: config.download_path,
      is_zip: config.is_zip,
      max_thread: config.max_thread,
      request_delay_ms: config.request_delay_ms,
      timeout_seconds: config.timeout_seconds,
      extension_token: config.extension_token,
      proxy: config.proxy,
    });
    setConfig(data);
    return data;
  }, [config]);

  const generateToken = useCallback(async () => {
    const data = await generateExtensionTokenApi();
    setConfig(data);
    return data;
  }, []);

  const updateConfig = useCallback((patch: Partial<AppConfig>) => {
    setConfig((c) => (c ? { ...c, ...patch } : c));
  }, []);

  const updateProxy = useCallback((patch: Partial<AppConfig["proxy"]>) => {
    setConfig((c) => (c ? { ...c, proxy: { ...c.proxy, ...patch } } : c));
  }, []);

  return { config, initialLoading, refresh, save, generateToken, updateConfig, updateProxy };
}
