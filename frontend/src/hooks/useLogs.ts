import { useCallback, useMemo, useRef, useState } from "react";
import type { LogFilter, LogItem } from "../types";
import { fetchLogs } from "../api";
import { useWsLog } from "./useWebSocket";

export function useLogs(taskId?: string, level: LogFilter = "all", maxItems?: number) {
  const [snapshot, setSnapshot] = useState<{ key: string; items: LogItem[]; loaded: boolean; error: string }>({ key: "", items: [], loaded: false, error: "" });
  const limit = maxItems ?? (taskId ? 200 : 300);
  const key = JSON.stringify([taskId ?? "", level, limit]);
  const currentKey = useRef(key);
  currentKey.current = key;
  const version = useRef(0);
  const matches = (item: LogItem) => (!taskId || item.task_id === taskId) &&
    (level === "all" || (level === "problems" ? ["error", "warning"].includes(item.level) : item.level === level));

  useWsLog((item) => {
    if (!matches(item)) return;
    setSnapshot((current) => ({ key, loaded: current.key === key && current.loaded, error: current.key === key ? current.error : "", items: mergeLogs([item, ...(current.key === key ? current.items : [])], limit) }));
  });

  const refresh = useCallback(async () => {
    const request = ++version.current;
    try {
      const levels = level === "problems" ? ["error", "warning"] : [level === "all" ? undefined : level];
      const results = await Promise.all(levels.map((value) => fetchLogs(taskId, { level: value, limit })));
      if (request !== version.current || key !== currentKey.current) return;
      const items = mergeLogs(results.flatMap((data) => data.items), limit);
      const newestId = Math.max(0, ...items.map((item) => item.id));
      setSnapshot((current) => ({ key, loaded: true, error: "", items: mergeLogs([
        ...(current.key === key ? current.items.filter((item) => item.id > newestId) : []), ...items,
      ], limit) }));
    } catch (error) {
      if (request === version.current && key === currentKey.current) setSnapshot((current) => ({ key, loaded: true, items: current.key === key ? current.items : [], error: error instanceof Error ? error.message : "日志读取失败" }));
      throw error;
    }
  }, [taskId, level, limit, key]);

  const logItems = useMemo(() => snapshot.key === key ? snapshot.items : [], [snapshot, key]);
  const logCounts = useMemo(() => ({
    error: logItems.filter((i) => i.level === "error").length,
    warning: logItems.filter((i) => i.level === "warning").length,
    total: logItems.length,
  }), [logItems]);
  const recentActivity = useMemo(() => logItems.slice(0, 8), [logItems]);
  return { logItems, logCounts, recentActivity, initialLoading: snapshot.key !== key || !snapshot.loaded, loadError: snapshot.key === key ? snapshot.error : "", refresh };
}

function mergeLogs(items: LogItem[], limit: number): LogItem[] {
  return [...new Map(items.map((item) => [item.id, item])).values()]
    .sort((a, b) => b.id - a.id).slice(0, limit);
}
