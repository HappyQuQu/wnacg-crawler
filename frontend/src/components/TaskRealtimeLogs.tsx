import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useLogs } from "../hooks/useLogs";
import { useWebSocket } from "../hooks/useWebSocket";
import { formatLogDetails, formatLogMessage, formatTime, stageLabel } from "../utils";
import { LogLevelBadge } from "./Common";

export function TaskRealtimeLogs({ taskId }: { taskId: string }) {
  const { logItems, initialLoading, refresh } = useLogs(taskId);
  const wsStatus = useWebSocket();
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let disposed = false;
    let fetching = false;
    async function load() {
      if (fetching) return;
      fetching = true;
      try {
        await refresh();
        if (!disposed) setError("");
      } catch {
        if (!disposed) setError("日志获取失败，将自动重试");
      } finally {
        fetching = false;
      }
    }
    void load();
    // Reconcile missed events after reconnection; polling also supports older servers.
    const timer = window.setInterval(() => void load(), 5000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [refresh, wsStatus]);

  async function handleRefresh() {
    setRefreshing(true);
    try { await refresh(); setError(""); }
    catch { setError("日志获取失败，将自动重试"); }
    finally { setRefreshing(false); }
  }

  const visibleLogs = onlyProblems
    ? logItems.filter((item) => ["warning", "error"].includes(item.level))
    : logItems;

  return (
    <section className="task-live-logs" aria-label="任务实时日志">
      <div className="task-live-logs-header">
        <h3>实时日志</h3>
        <span className={`task-log-connection ${wsStatus === "connected" ? "connected" : ""}`}>
          {wsStatus === "connected" ? "实时连接" : "自动刷新"}
        </span>
        <button className="icon-button" title="刷新任务日志" aria-label="刷新任务日志" disabled={refreshing} onClick={() => void handleRefresh()}>
          <RefreshCw size={14} className={refreshing ? "spin" : ""} />
        </button>
      </div>
      <div className="task-live-logs-tools">
        <span>最新在上 · 最近 {logItems.length}/200 条</span>
        <label><input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />只看问题</label>
      </div>
      {error && <p className="task-log-error" role="status">{error}</p>}
      <div className="task-live-logs-list" role="log" aria-label="当前任务日志记录" aria-live="polite" aria-relevant="additions">
        {visibleLogs.map((item) => (
          <article className="task-live-log" key={item.id}>
            <div className="task-live-log-meta">
              <LogLevelBadge level={item.level} />
              <time>{formatTime(item.created_at)}</time>
              {item.stage && <span>{stageLabel(item.stage)}</span>}
            </div>
            <p>{formatLogMessage(item)}</p>
            {Object.keys(item.details).length > 0 && (
              <details><summary>查看详情</summary><div>{formatLogDetails(item.details)}</div></details>
            )}
          </article>
        ))}
        {visibleLogs.length === 0 && (
          <p className="task-log-empty">{error ? "暂时无法获取日志" : initialLoading ? "正在加载日志…" : onlyProblems ? "暂无警告或错误" : "暂无日志，任务开始后会自动显示"}</p>
        )}
      </div>
    </section>
  );
}
