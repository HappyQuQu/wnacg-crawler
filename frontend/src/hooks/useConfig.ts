import { useCallback, useRef, useState } from "react";
import type { AppConfig } from "../types";
import { fetchConfig, saveConfigApi, generateExtensionTokenApi } from "../api";
import { changedConfigFields, editableConfig, mergeConfigDraft } from "../configUtils";

export function useConfig() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [savedConfig, setSavedConfig] = useState<AppConfig | null>(null);
  const draftRef = useRef<AppConfig | null>(null);
  const savedRef = useRef<AppConfig | null>(null);
  const version = useRef(0);
  const mutating = useRef(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveFeedback, setSaveFeedback] = useState<{ message: string; overridden: string[] } | null>(null);

  const accept = useCallback((server: AppConfig, draft: AppConfig) => {
    savedRef.current = server;
    draftRef.current = draft;
    setSavedConfig(server);
    setConfig(draft);
  }, []);

  const refresh = useCallback(async () => {
    if (mutating.current) return;
    const request = ++version.current;
    try {
      const data = await fetchConfig();
      if (request !== version.current) return;
      accept(data, mergeConfigDraft(data, draftRef.current, savedRef.current));
      setLoadError("");
    } catch (error) {
      if (request === version.current) setLoadError(error instanceof Error ? error.message : "读取配置失败，请重试");
    } finally {
      if (request === version.current) setInitialLoading(false);
    }
  }, [accept]);

  const save = useCallback(async () => {
    const submitted = draftRef.current;
    if (!submitted || mutating.current) return null;
    mutating.current = true;
    version.current++;
    setSaveError("");
    try {
      const data = await saveConfigApi(editableConfig(submitted));
      accept(data, mergeConfigDraft(data, draftRef.current, submitted));
      setLoadError("");
      setSaveFeedback({ message: data.message, overridden: data.overridden_fields ?? [] });
      return data;
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "保存失败，请重试");
      throw error;
    } finally { mutating.current = false; }
  }, [accept]);

  const generateToken = useCallback(async () => {
    if (mutating.current) return null;
    mutating.current = true;
    version.current++;
    try {
      const data = await generateExtensionTokenApi();
      accept(data, mergeConfigDraft(data, draftRef.current, savedRef.current, ["extension_token"]));
      setSaveFeedback({ message: data.message, overridden: data.overridden_fields ?? [] });
      setLoadError("");
      return data;
    } finally { mutating.current = false; }
  }, [accept]);

  const updateConfig = useCallback((patch: Partial<AppConfig>) => {
    if (!draftRef.current) return;
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setConfig(next);
    setSaveError("");
    setSaveFeedback(null);
  }, []);

  const updateProxy = useCallback((patch: Partial<AppConfig["proxy"]>) => {
    if (draftRef.current) updateConfig({ proxy: { ...draftRef.current.proxy, ...patch } });
  }, [updateConfig]);

  const discard = useCallback(() => {
    if (!savedRef.current) return;
    draftRef.current = savedRef.current;
    setConfig(savedRef.current);
    setSaveError("");
    setSaveFeedback(null);
  }, []);

  return { config, savedConfig, initialLoading, loadError, saveError, saveFeedback,
    dirtyFields: changedConfigFields(config, savedConfig), refresh, save, generateToken,
    updateConfig, updateProxy, discard };
}
