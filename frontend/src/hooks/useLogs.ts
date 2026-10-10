import { useCallback, useMemo, useState } from "react";
import type { LogItem } from "../types";
import { fetchLogs } from "../api";
import { useWsLog } from "./useWebSocket";

export function useLogs(taskId?: string) {
  const [logItems, setLogItems] = useState<LogItem[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const limit = taskId ? 200 : 300;

  useWsLog((item) => {
    if (taskId && item.task_id !== taskId) return;
    setLogItems((current) => mergeLogs([item, ...current], limit));
  });

  const refresh = useCallback(async () => {
    const data = await fetchLogs(taskId);
    const newestId = Math.max(0, ...data.items.map((item) => item.id));
    setLogItems((current) => mergeLogs([
      ...current.filter((item) => item.id > newestId), ...data.items,
    ], limit));
    setInitialLoading(false);
  }, [taskId, limit]);

  const logCounts = useMemo(() => ({
    error: logItems.filter((i) => i.level === "error").length,
    warning: logItems.filter((i) => i.level === "warning").length,
    total: logItems.length,
  }), [logItems]);

  const recentActivity = useMemo(() => logItems.slice(0, 8), [logItems]);

  return { logItems, logCounts, recentActivity, initialLoading, refresh };
}

function mergeLogs(items: LogItem[], limit: number): LogItem[] {
  return [...new Map(items.map((item) => [item.id, item])).values()]
    .sort((a, b) => b.id - a.id).slice(0, limit);
}
