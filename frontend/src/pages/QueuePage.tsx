import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  ExternalLink,
  LayoutGrid,
  List,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  XCircle,
} from "lucide-react";
import type { Task, LogItem, QueueFilter } from "../types";
import { stageLabel, formatTime, canPause, canResume, canCancel, canRetry, formatLogMessage, formatLogDetails, taskDisplayName, progressPercent, formatDuration } from "../utils";
import { Info, ProgressBar, StatusBadge, LogLevelBadge } from "../components/Common";
import { SkeletonTable } from "../components/Skeleton";
import { DetailSummary } from "../components/DetailSummary";
import { TaskRealtimeLogs } from "../components/TaskRealtimeLogs";

const tabs: { key: QueueFilter | "logs"; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "active", label: "进行中" },
  { key: "completed", label: "已完成" },
  { key: "failed", label: "失败" },
  { key: "logs", label: "日志" },
];

type ViewMode = "table" | "card";

function useViewMode(): [ViewMode, (v: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(() => {
    try {
      return (localStorage.getItem("wnacg-view-mode") as ViewMode) || "table";
    } catch {
      return "table";
    }
  });
  const set = (v: ViewMode) => {
    setMode(v);
    try { localStorage.setItem("wnacg-view-mode", v); } catch { /* ignore */ }
  };
  return [mode, set];
}

export function QueuePage({
  tasks,
  selectedTask,
  logItems,
  queueCounts,
  noImageMode,
  searchQuery,
  loading,
  initialLoading,
  onTaskSelect,
  onRefresh,
  onRefreshLogs,
  onControl,
  onRetry,
}: {
  tasks: Task[];
  selectedTask: Task | null;
  logItems: LogItem[];
  queueCounts: Record<string, number>;
  noImageMode: boolean;
  searchQuery: string;
  loading: boolean;
  initialLoading: boolean;
  onTaskSelect: (id: string) => void;
  onRefresh: () => Promise<void>;
  onRefreshLogs: () => Promise<void>;
  onControl: (task: Task, action: "pause" | "resume" | "cancel") => Promise<void>;
  onRetry: (task: Task) => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<QueueFilter | "logs">("all");
  const [viewMode, setViewMode] = useViewMode();
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filteredTasks = useMemo(() => {
    const byFilter = tasks.filter((task) => {
      if (activeTab === "active") return ["pending", "queued", "running", "paused"].includes(task.status);
      if (activeTab === "failed") return task.status === "failed";
      if (activeTab === "completed") return task.status === "completed";
      return true;
    });
    if (!normalizedSearch) return byFilter;
    return byFilter.filter((t) =>
      [t.manga_id, t.title, t.source, t.status, t.stage, t.task_id]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(normalizedSearch))
    );
  }, [normalizedSearch, activeTab, tasks]);

  const filteredLogs = useMemo(() => {
    if (!normalizedSearch) return logItems;
    return logItems.filter((i) =>
      [i.level, i.event, i.message, i.manga_id, i.task_id, i.stage, JSON.stringify(i.details)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(normalizedSearch))
    );
  }, [logItems, normalizedSearch]);

  const isLogsTab = activeTab === "logs";

  return (
    <div className={`queue-grid ${isLogsTab ? "queue-logs-view" : ""}`}>
      <section className="panel task-list-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">任务管理</span>
            <h2>{isLogsTab ? "运行日志" : "任务列表"}</h2>
          </div>
          <div className="header-actions">
            {!isLogsTab && (
              <div className="view-toggle">
                <button className={`view-toggle-btn ${viewMode === "table" ? "active" : ""}`} onClick={() => setViewMode("table")} title="列表视图"><List size={15} /></button>
                <button className={`view-toggle-btn ${viewMode === "card" ? "active" : ""}`} onClick={() => setViewMode("card")} title="卡片视图"><LayoutGrid size={15} /></button>
              </div>
            )}
            <button className="button secondary" onClick={() => void (isLogsTab ? onRefreshLogs() : onRefresh())} disabled={loading}>
              <RefreshCw size={15} />刷新
            </button>
          </div>
        </div>
        <div className="segment-group" role="tablist" aria-label="任务状态过滤">
          {tabs.map((tab) => (
            <button key={tab.key} className={`segment ${activeTab === tab.key ? "active" : ""}`} onClick={() => setActiveTab(tab.key)}>
              {tab.label}<span>{tab.key === "logs" ? logItems.length : queueCounts[tab.key] ?? 0}</span>
            </button>
          ))}
        </div>

        {!isLogsTab ? (
          initialLoading ? (
            <div style={{ padding: "14px 18px" }}><SkeletonTable rows={6} cols={5} /></div>
          ) : viewMode === "table" ? (
            <TableView tasks={filteredTasks} selectedTask={selectedTask} loading={loading} noImageMode={noImageMode} onTaskSelect={onTaskSelect} onControl={onControl} onRetry={onRetry} />
          ) : (
            <CardView tasks={filteredTasks} selectedTask={selectedTask} loading={loading} noImageMode={noImageMode} onTaskSelect={onTaskSelect} onControl={onControl} onRetry={onRetry} />
          )
        ) : (
          <div className="table-wrap">
            {initialLoading ? (
              <div style={{ padding: "14px 18px" }}><SkeletonTable rows={8} cols={6} /></div>
            ) : (
              <table className="logs-table">
                <thead><tr><th>时间</th><th>级别</th><th>ID</th><th>阶段</th><th>事件</th><th>信息</th></tr></thead>
                <tbody>
                  {filteredLogs.map((item) => (
                    <tr key={item.id}>
                      <td>{formatTime(item.created_at)}</td>
                      <td><LogLevelBadge level={item.level} /></td>
                      <td className="mono">{item.manga_id ?? "-"}</td>
                      <td>{item.stage ? stageLabel(item.stage) : "-"}</td>
                      <td className="mono">{item.event}</td>
                      <td className="log-message">
                        <strong>{formatLogMessage(item)}</strong>
                        {Object.keys(item.details).length > 0 && <span>{formatLogDetails(item.details)}</span>}
                      </td>
                    </tr>
                  ))}
                  {filteredLogs.length === 0 && <tr><td colSpan={6}>暂无日志</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>

      {!isLogsTab && <TaskDetailPanel task={selectedTask} loading={loading} noImageMode={noImageMode} onControl={onControl} onRetry={onRetry} />}
    </div>
  );
}

function TableView({
  tasks, selectedTask, loading, noImageMode, onTaskSelect, onControl, onRetry,
}: {
  tasks: Task[];
  selectedTask: Task | null;
  loading: boolean;
  noImageMode: boolean;
  onTaskSelect: (id: string) => void;
  onControl: (task: Task, action: "pause" | "resume" | "cancel") => Promise<void>;
  onRetry: (task: Task) => Promise<void>;
}) {
  return (
    <div className="table-wrap">
      <table className="task-table">
        <thead>
          <tr><th>任务</th><th>阶段</th><th>进度</th><th>图片</th><th>状态</th><th>更新时间</th><th>操作</th></tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.task_id} className={task.task_id === selectedTask?.task_id ? "selected-row" : ""} onClick={() => onTaskSelect(task.task_id)}>
              <td>
                <div className="row-title">
                  {task.cover_url ? <img className={`row-thumb ${noImageMode ? "no-image-blur" : ""}`} src={task.cover_url} alt="" /> : <div className="row-thumb-placeholder" />}
                  <div className="row-text">
                    <span className="row-name">{taskDisplayName(task)}</span>
                    <span className="mono row-id-small">{task.manga_id}</span>
                  </div>
                </div>
              </td>
              <td><span className="row-stage">{stageLabel(task.stage)}</span></td>
              <td className="progress-cell">
                <ProgressBar value={task.progress_total > 0 ? task.progress_current / task.progress_total : 0} />
                <span>{progressPercent(task.progress_current, task.progress_total)}%</span>
              </td>
              <td className="mono">{task.progress_total > 0 ? `${task.progress_current}/${task.progress_total}` : "-"}</td>
              <td><StatusBadge status={task.status} /></td>
              <td>{formatTime(task.updated_at)}</td>
              <td>
                <div className="row-actions">
                  <button className="icon-button" title="暂停" onClick={(e) => { e.stopPropagation(); void onControl(task, "pause"); }} disabled={!canPause(task) || loading}><Pause size={14} /></button>
                  <button className="icon-button" title="继续" onClick={(e) => { e.stopPropagation(); void onControl(task, "resume"); }} disabled={!canResume(task) || loading}><Play size={14} /></button>
                  <button className="icon-button" title="重试" onClick={(e) => { e.stopPropagation(); void onRetry(task); }} disabled={!canRetry(task) || loading}><RotateCcw size={14} /></button>
                  <button className="icon-button" title="打开原始链接" onClick={(e) => { e.stopPropagation(); window.open(`https://www.wnacg.com/photos-index-aid-${task.manga_id}.html`, "_blank"); }}><ExternalLink size={14} /></button>
                </div>
              </td>
            </tr>
          ))}
          {tasks.length === 0 && <tr><td colSpan={7}>当前分类暂无任务</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function CardView({
  tasks, selectedTask, loading, noImageMode, onTaskSelect, onControl, onRetry,
}: {
  tasks: Task[];
  selectedTask: Task | null;
  loading: boolean;
  noImageMode: boolean;
  onTaskSelect: (id: string) => void;
  onControl: (task: Task, action: "pause" | "resume" | "cancel") => Promise<void>;
  onRetry: (task: Task) => Promise<void>;
}) {
  if (tasks.length === 0) {
    return <p className="empty-copy" style={{ padding: "24px" }}>当前分类暂无任务</p>;
  }
  return (
    <div className="task-card-grid">
      {tasks.map((task) => {
        const pct = progressPercent(task.progress_current, task.progress_total);
        const isSelected = task.task_id === selectedTask?.task_id;
        return (
          <article key={task.task_id} className={`task-card ${isSelected ? "selected" : ""}`} role="button" tabIndex={0} onClick={() => onTaskSelect(task.task_id)}>
            <div className={`task-card-cover ${noImageMode ? "no-image-blur" : ""}`}>
              {task.cover_url ? <img src={task.cover_url} alt="" /> : <BookOpen size={24} />}
            </div>
            <div className="task-card-body">
              <div className="task-card-header">
                <span className="mono task-card-id">{task.manga_id}</span>
                <StatusBadge status={task.status} />
              </div>
              <h3 className="task-card-title">{taskDisplayName(task)}</h3>
              <div className="task-card-progress">
                <ProgressBar value={task.progress_total > 0 ? task.progress_current / task.progress_total : 0} />
                <span className="task-card-pct">{pct}%</span>
              </div>
              <div className="task-card-meta">
                <span>{stageLabel(task.stage)}</span>
                {task.progress_total > 0 && <span>{task.progress_current}/{task.progress_total} 张</span>}
                <span>{formatTime(task.updated_at)}</span>
              </div>
              {task.last_error && (
                <div className="task-card-error"><AlertTriangle size={12} /><span>{task.last_error}</span></div>
              )}
              <div className="task-card-actions">
                <button className="icon-button" title="暂停" onClick={(e) => { e.stopPropagation(); void onControl(task, "pause"); }} disabled={!canPause(task) || loading}><Pause size={14} /></button>
                <button className="icon-button" title="继续" onClick={(e) => { e.stopPropagation(); void onControl(task, "resume"); }} disabled={!canResume(task) || loading}><Play size={14} /></button>
                <button className="icon-button" title="重试" onClick={(e) => { e.stopPropagation(); void onRetry(task); }} disabled={!canRetry(task) || loading}><RotateCcw size={14} /></button>
                <button className="icon-button" title="打开原始链接" onClick={(e) => { e.stopPropagation(); window.open(`https://www.wnacg.com/photos-index-aid-${task.manga_id}.html`, "_blank"); }}><ExternalLink size={14} /></button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function TaskDetailPanel({
  task, loading, noImageMode, onControl, onRetry,
}: {
  task: Task | null;
  loading: boolean;
  noImageMode: boolean;
  onControl: (task: Task, action: "pause" | "resume" | "cancel") => Promise<void>;
  onRetry: (task: Task) => Promise<void>;
}) {
  const pct = task ? progressPercent(task.progress_current, task.progress_total) : 0;
  const isActive = task && ["running", "queued"].includes(task.status);

  return (
    <aside className="panel detail queue-detail" aria-label="任务详情">
      <div className="detail-panel-header">
        <h2>任务详情</h2>
      </div>

      <div className="detail-scroll-body">
        {task ? <DetailSummary title={taskDisplayName(task)} mangaId={task.manga_id} coverUrl={task.cover_url} status={task.status} noImageMode={noImageMode} /> : <p className="detail-files-empty">从左侧选择一个任务查看详情</p>}

        <div className="detail-progress-hero">
          <div className="detail-progress-bar-wrap">
            <ProgressBar value={task ? (task.progress_total > 0 ? task.progress_current / task.progress_total : 0) : 0} />
          </div>
          <div className="detail-progress-info">
            <span className="detail-progress-pct">{pct}%</span>
            <span className="detail-progress-count">
              {task && task.progress_total > 0 ? `${task.progress_current} / ${task.progress_total} 张图片` : "等待开始"}
            </span>
          </div>
        </div>

        {task && <TaskRealtimeLogs key={task.task_id} taskId={task.task_id} />}

        <div className="detail-grid">
          <Info label="阶段" value={task ? stageLabel(task.stage) : "-"} />
          <Info label="来源" value={task?.source ?? "-"} />
          <Info label="重试" value={task ? (task.retry_count > 0 ? `${task.retry_count} 次` : "无") : "-"} />
          <Info label="已用时" value={task ? formatDuration(task.created_at, task.updated_at) : "-"} />
          <Info label="创建时间" value={formatTime(task?.created_at)} />
          <Info label="更新时间" value={formatTime(task?.updated_at)} />
        </div>

        {task?.last_error && (
          <div className="notice danger"><AlertTriangle size={14} /><span>{task.last_error}</span></div>
        )}

      </div>

      <div className="detail-footer">
        <div className="task-actions">
          <button className="button secondary" disabled={!task || !canPause(task) || loading} onClick={() => task && void onControl(task, "pause")}><Pause size={15} />暂停</button>
          <button className="button secondary" disabled={!task || !canResume(task) || loading} onClick={() => task && void onControl(task, "resume")}><Play size={15} />继续</button>
          <button className="button secondary danger-button" disabled={!task || !canCancel(task) || loading} onClick={() => task && void onControl(task, "cancel")}><XCircle size={15} />取消</button>
          <button className="button primary" disabled={!task || !canRetry(task) || loading} onClick={() => task && void onRetry(task)}><RotateCcw size={15} />重试</button>
          {task && <button className="button secondary" onClick={() => window.open(`https://www.wnacg.com/photos-index-aid-${task.manga_id}.html`, "_blank")}><ExternalLink size={15} />原始链接</button>}
        </div>
        {isActive && <p className="detail-hint">任务进行中，可暂停或取消</p>}
      </div>
    </aside>
  );
}
