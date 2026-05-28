import { useCallback, useMemo, useState } from "react";
import type { LogItem } from "../types";
import { fetchLogs } from "../api";

export function useLogs() {
  const [logItems, setLogItems] = useState<LogItem[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await fetchLogs();
    setLogItems(data.items);
    setInitialLoading(false);
  }, []);

  const logCounts = useMemo(() => ({
    error: logItems.filter((i) => i.level === "error").length,
    warning: logItems.filter((i) => i.level === "warning").length,
    total: logItems.length,
  }), [logItems]);

  const recentActivity = useMemo(() => logItems.slice(0, 8), [logItems]);

  return { logItems, logCounts, recentActivity, initialLoading, refresh };
}
