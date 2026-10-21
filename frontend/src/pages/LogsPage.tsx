import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, ChevronLeft, ChevronRight, CircleAlert, Copy, FileText, Filter, Info, RefreshCw, X } from "lucide-react";
import type { LogFilter, LogItem, Task, WsStatus } from "../types";
import { useLogs } from "../hooks/useLogs";
import { formatLogMessage, formatTime, stageLabel } from "../utils";
import { LogLevelBadge } from "../components/Common";
import { SkeletonTable } from "../components/Skeleton";
import { useToast } from "../components/Toast";

const levels: { key: LogFilter; label: string }[] = [
  { key: "all", label: "全部" }, { key: "problems", label: "只看问题" },
  { key: "error", label: "错误" }, { key: "warning", label: "警告" }, { key: "info", label: "信息" },
];
const pageSize = 50;
const limit = 1000;

export function LogsPage({ level, taskId, searchQuery, wsStatus, tasks, onLevelChange, onTaskFilter, onClearSearch, onOpenTask }: {
  level: LogFilter; taskId: string; searchQuery: string; wsStatus: WsStatus; tasks: Task[];
  onLevelChange: (level: LogFilter) => void; onTaskFilter: (id: string) => void;
  onClearSearch: () => void; onOpenTask: (task: Task) => void;
}) {
  const { logItems, logCounts, initialLoading, loadError, refresh } = useLogs(taskId || undefined, level, limit);
  const [refreshing, setRefreshing] = useState(false);
  const [pagination, setPagination] = useState({ scope: "", page: 1 });
  const { showToast } = useToast();
  useEffect(() => {
    let fetching = false;
    async function load() {
      if (fetching) return;
      fetching = true;
      try { await refresh(); } catch { /* The hook exposes the read error and preserves existing records. */ }
      finally { fetching = false; }
    }
    void load();
    if (wsStatus === "connected") return;
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [refresh, wsStatus]);

  async function handleRefresh() {
    setRefreshing(true);
    try { await refresh(); } catch { /* Displayed inline with a retry action. */ }
    finally { setRefreshing(false); }
  }
  async function copyLog(item: LogItem) {
    try {
      await navigator.clipboard.writeText(JSON.stringify(item, null, 2));
      showToast("已复制日志与错误详情", "success");
    } catch { showToast("复制失败，请展开详情后手动复制", "error"); }
  }
  const query = searchQuery.trim().toLowerCase();
  const matching = useMemo(() => logItems.filter((item) => !query ||
    [item.message, item.manga_id, item.task_id, item.event, item.stage, stageLabel(item.stage ?? ""), JSON.stringify(item.details)]
      .some((value) => value?.toLowerCase().includes(query))), [logItems, query]);
  const scope = JSON.stringify([level, taskId, query]);
  const pageCount = Math.max(1, Math.ceil(matching.length / pageSize));
  const page = Math.min(pageCount, pagination.scope === scope ? pagination.page : 1);
  const visible = matching.slice((page - 1) * pageSize, page * pageSize);
  const tasksById = new Map(tasks.map((task) => [task.task_id, task]));
  const metrics = [
    { label: "已加载记录", count: logCounts.total, detail: `当前级别 · 最多 ${limit} 条`, Icon: FileText, tone: "neutral" },
    { label: "错误", count: logCounts.error, detail: "当前记录中的错误信息", Icon: CircleAlert, tone: logCounts.error ? "orange" : "neutral" },
    { label: "警告", count: logCounts.warning, detail: "当前记录中的异常提示", Icon: AlertTriangle, tone: "neutral" },
    { label: "涉及作品", count: new Set(logItems.map((item) => item.manga_id).filter(Boolean)).size, detail: taskId ? "已限定到单个任务" : "当前记录关联的作品", Icon: Filter, tone: "blue" },
  ];
  function changePage(next: number) { setPagination({ scope, page: next }); document.getElementById("logs-results-heading")?.scrollIntoView({ block: "start" }); }

  return <div className="logs-workbench" aria-busy={initialLoading}>
    <header className="overview-heading"><div><div className="overview-heading-topline"><h2>运行日志</h2><span className={`overview-connection ${wsStatus === "connected" ? "live" : ""}`}><span />{wsStatus === "connected" ? "实时同步" : wsStatus === "connecting" ? "正在连接" : "定时刷新"}</span></div><p>筛选错误与警告，查看原因和任务上下文。</p></div><div className="overview-heading-actions"><button className="button secondary" disabled={refreshing || initialLoading} onClick={() => void handleRefresh()}><RefreshCw size={15} className={refreshing ? "spin" : ""} />刷新日志</button></div></header>
    <section className="overview-metrics" aria-label="已加载日志统计">{metrics.map(({ label, count, detail, Icon, tone }) => <article className={`overview-metric logs-metric ${tone}`} key={label}><div className="overview-metric-top"><span>{label}</span><Icon size={17} /></div><strong>{initialLoading ? "—" : count.toLocaleString("zh-CN")}</strong><div className="overview-metric-bottom"><span>{detail}</span></div></article>)}</section>
    <section className="panel logs-panel" aria-label="日志查询">
      <div className="overview-panel-heading"><div><span className="overview-eyebrow">运行记录</span><h3 id="logs-results-heading">日志列表<span className="queue-result-count">{initialLoading ? "读取中…" : `${matching.length} 条${query ? "匹配" : "记录"}`}</span></h3></div><span className="logs-order">最新在前</span></div>
      <div className="overview-task-tabs logs-tabs" role="tablist" aria-label="日志级别" onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const index = levels.findIndex((item) => item.key === level);
        const next = event.key === "Home" ? 0 : event.key === "End" ? levels.length - 1 : (index + (event.key === "ArrowRight" ? 1 : levels.length - 1)) % levels.length;
        onLevelChange(levels[next].key); document.getElementById(`log-level-${levels[next].key}`)?.focus();
      }}>{levels.map(({ key, label }) => <button key={key} id={`log-level-${key}`} role="tab" aria-selected={level === key} tabIndex={level === key ? 0 : -1} aria-controls="logs-results" className={level === key ? "active" : ""} onClick={() => onLevelChange(key)}>{label}</button>)}</div>
      <div className="logs-scope"><span><Info size={13} />{level === "all" ? "全部级别" : levels.find((item) => item.key === level)?.label}的最近 {limit} 条，搜索与统计仅覆盖已加载记录。</span>{taskId && <button className="logs-task-chip" onClick={() => onTaskFilter("")} title="取消任务筛选"><span>任务 {taskId}</span><X size={13} /></button>}</div>
      {loadError && <div className="logs-read-error" role="alert"><CircleAlert size={18} /><div><strong>日志读取失败</strong><p>{loadError}{logItems.length > 0 ? "；下方保留上次读取的记录。" : ""}</p><button className="overview-text-link" disabled={refreshing} onClick={() => void handleRefresh()}>重新加载</button></div></div>}
      <div id="logs-results" role="tabpanel" aria-labelledby={`log-level-${level}`}>
        {initialLoading ? <div className="queue-loading"><SkeletonTable rows={5} cols={3} /></div> : !visible.length ? <div className="overview-empty overview-empty-large"><FileText size={30} /><strong>{loadError ? "暂时无法读取日志" : query ? "没有匹配的日志" : level === "problems" || level === "error" || level === "warning" ? "当前范围暂无问题记录" : "当前范围暂无日志"}</strong><p>{query ? "试试作品 ID、任务 ID、事件名称或错误关键词。" : "切换级别或刷新，查看其他运行记录。"}</p>{query && <button className="button secondary" onClick={onClearSearch}>清空搜索</button>}</div> : <div className="logs-entries">{visible.map((item) => {
          const task = item.task_id ? tasksById.get(item.task_id) : undefined;
          const Icon = item.level === "error" ? CircleAlert : item.level === "warning" ? AlertTriangle : FileText;
          return <article className={`logs-entry level-${item.level}`} key={item.id}>
            <span className="logs-entry-icon"><Icon size={18} /></span>
            <div className="logs-entry-body"><div className="logs-entry-meta"><LogLevelBadge level={item.level} /><time>{formatTime(item.created_at)}</time>{item.stage && <span>{stageLabel(item.stage)}</span>}{item.manga_id && <span>ID {item.manga_id}</span>}</div><p className="logs-message">{formatLogMessage(item)}</p><div className="logs-event"><span>{item.event}</span>{item.task_id && <span title={item.task_id}>任务 {item.task_id}</span>}</div>
              {Object.keys(item.details).length > 0 && <details className="logs-details"><summary>查看详细信息</summary><pre>{JSON.stringify(item.details, null, 2)}</pre></details>}
              <div className="logs-entry-actions">{task && <button className="overview-text-link" onClick={() => onOpenTask(task)}>查看任务<ArrowRight size={13} /></button>}{item.task_id && item.task_id !== taskId && <button className="overview-text-link" onClick={() => onTaskFilter(item.task_id!)}><Filter size={12} />只看此任务</button>}<button className="overview-text-link" aria-label={`复制日志 ${item.id}`} onClick={() => void copyLog(item)}><Copy size={12} />复制日志</button></div>
            </div>
          </article>;
        })}</div>}
      </div>
      {!initialLoading && <div className="logs-pagination"><span>{matching.length ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, matching.length)} / ${matching.length} 条` : "0 条记录"}</span><div><button className="icon-button" aria-label="上一页日志" disabled={page <= 1} onClick={() => changePage(page - 1)}><ChevronLeft size={16} /></button><span>{page} / {pageCount}</span><button className="icon-button" aria-label="下一页日志" disabled={page >= pageCount} onClick={() => changePage(page + 1)}><ChevronRight size={16} /></button></div></div>}
    </section>
  </div>;
}
