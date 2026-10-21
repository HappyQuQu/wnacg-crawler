import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertTriangle, ArrowRight, CheckCircle2, ChevronDown,
  ChevronRight, ExternalLink, LayoutGrid, List, ListTodo, Pause,
  Play, Plus, RefreshCw, RotateCcw, Trash2, X, XCircle,
} from "lucide-react";
import type { Task, QueueFilter, WsStatus } from "../types";
import { stageLabel, formatTime, formatTimeShort, canPause, canResume, canCancel, canRetry, taskDisplayName, progressPercent } from "../utils";
import { Info, ProgressBar, StatusBadge } from "../components/Common";
import { Skeleton, SkeletonTable } from "../components/Skeleton";
import { CoverImage } from "../components/CoverImage";
import { TaskRealtimeLogs } from "../components/TaskRealtimeLogs";

const tabs: { key: QueueFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "active", label: "进行中" },
  { key: "completed", label: "已完成" },
  { key: "attention", label: "需处理" },
];
type ViewMode = "table" | "card";
type TaskActions = {
  loading: boolean;
  onControl: (task: Task, action: "pause" | "resume" | "cancel") => Promise<void>;
  onRetry: (task: Task) => Promise<void>;
};

function useViewMode(): [ViewMode, (v: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(() => {
    try { return localStorage.getItem("wnacg-view-mode") === "card" ? "card" : "table"; }
    catch { return "table"; }
  });
  return [mode, (value) => {
    setMode(value);
    try { localStorage.setItem("wnacg-view-mode", value); } catch { /* ignore */ }
  }];
}

function progressDescription(task: Task) {
  if (task.status === "completed") return "下载已完成";
  if (task.status === "pending") return "等待确认后开始";
  if (task.status === "queued") return "等待调度";
  if (task.status === "paused") return "任务已暂停";
  if (task.status === "cancelled") return "任务已取消";
  if (task.status === "failed") return "下载中断，请查看原因";
  if (task.status === "partial") return "文件尚未完整，可重试补全";
  return task.stage === "none" ? "正在准备" : `${stageLabel(task.stage)}中`;
}

function progressCount(task: Task) {
  const unit = task.stage === "fetching_pages" ? "个目录页" : task.stage === "resolving_images" ? "个图片页" : "张图片";
  return `${task.progress_current} / ${task.progress_total} ${unit}`;
}

export function QueuePage({
  tasks, selectedTask, queueCounts, noImageMode, searchQuery,
  loading, initialLoading, wsStatus, onTaskSelect, onRefresh,
  onControl, onRetry, onClearCompleted, activeTab, onTabChange, onAddTask, openSelectedDetail,
}: TaskActions & {
  tasks: Task[];
  selectedTask: Task | null;
  queueCounts: Record<string, number>;
  noImageMode: boolean;
  searchQuery: string;
  initialLoading: boolean;
  wsStatus: WsStatus;
  onTaskSelect: (id: string) => void;
  onRefresh: () => Promise<void>;
  onClearCompleted: (task?: Task) => void;
  activeTab: QueueFilter;
  onTabChange: (tab: QueueFilter) => void;
  onAddTask: () => void;
  openSelectedDetail: boolean;
}) {
  const [viewMode, setViewMode] = useViewMode();
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width: 1180px)").matches);
  const [inspectorOpen, setInspectorOpen] = useState(compact && openSelectedDetail);
  const normalizedSearch = searchQuery.trim().toLowerCase();
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1180px)");
    const update = () => { setCompact(query.matches); if (!query.matches) setInspectorOpen(false); };
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const filteredTasks = useMemo(() => tasks.filter((task) => {
    if (activeTab === "active" && !["pending", "queued", "running", "paused"].includes(task.status)) return false;
    if (activeTab === "failed" && task.status !== "failed") return false;
    if (activeTab === "partial" && task.status !== "partial") return false;
    if (activeTab === "attention" && !["failed", "partial"].includes(task.status)) return false;
    if (activeTab === "completed" && task.status !== "completed") return false;
    return !normalizedSearch || [task.manga_id, task.title, task.source, task.status, task.stage, task.task_id, progressDescription(task)]
      .some((value) => value.toLowerCase().includes(normalizedSearch));
  }), [normalizedSearch, activeTab, tasks]);
  const detailTask = filteredTasks.find((task) => task.task_id === selectedTask?.task_id) ?? filteredTasks[0] ?? null;
  const running = tasks.filter((task) => task.status === "running").length;
  const waiting = tasks.filter((task) => ["pending", "queued"].includes(task.status)).length;
  const paused = tasks.filter((task) => task.status === "paused").length;
  const metrics = [
    { key: "all", label: "全部任务", count: tasks.length, detail: "全部下载记录", Icon: ListTodo, tone: "neutral" },
    { key: "active", label: "进行中", count: queueCounts.active, detail: `${running} 运行 · ${waiting} 等待 · ${paused} 暂停`, Icon: Activity, tone: "blue" },
    { key: "completed", label: "已完成", count: queueCounts.completed, detail: "清除记录后仍保留本地作品", Icon: CheckCircle2, tone: "green" },
    { key: "attention", label: "需要关注", count: queueCounts.attention, detail: `${queueCounts.failed} 项失败 · ${queueCounts.partial} 项部分完成`, Icon: AlertTriangle, tone: queueCounts.attention ? "orange" : "neutral" },
  ] as const;
  function selectTask(id: string) {
    onTaskSelect(id);
    if (compact) setInspectorOpen(true);
  }
  function selectTab(tab: QueueFilter) {
    setInspectorOpen(false);
    onTabChange(tab);
  }
  const inspector = <TaskDetailPanel key={detailTask?.task_id ?? "empty"} task={detailTask} loading={loading} noImageMode={noImageMode} onControl={(task, action) => {
    // Confirmation dialogs live outside the native dialog's top layer.
    if (action === "cancel") setInspectorOpen(false);
    return onControl(task, action);
  }} onRetry={onRetry} onClearCompleted={(task) => { setInspectorOpen(false); onClearCompleted(task); }} onClose={compact ? () => setInspectorOpen(false) : undefined} />;

  return (
    <div className="queue-workbench" aria-busy={initialLoading}>
      <header className="overview-heading">
        <div>
          <div className="overview-heading-topline"><h2>下载任务</h2><span className={`overview-connection ${wsStatus === "connected" ? "live" : ""}`}><span />{wsStatus === "connected" ? "实时同步" : wsStatus === "connecting" ? "正在连接" : "定时刷新"}</span></div>
          <p>查看下载进度，继续未完成的任务，整理已完成记录。</p>
        </div>
        <div className="overview-heading-actions">
          <button className="button secondary overview-refresh" onClick={() => void onRefresh()} disabled={loading} aria-label="刷新任务" title="刷新任务"><RefreshCw size={16} className={loading ? "spin" : ""} /></button>
          <button className="button primary" onClick={onAddTask}><Plus size={16} />添加下载</button>
        </div>
      </header>
      <section className="overview-metrics" aria-label="任务统计">
        {metrics.map(({ key, label, count, detail, Icon, tone }) => <button key={key} className={`overview-metric ${tone} ${activeTab === key ? "queue-metric-selected" : ""}`} onClick={() => selectTab(key)} disabled={initialLoading} aria-label={`${label} ${initialLoading ? "加载中" : count}`} aria-pressed={activeTab === key}>
          <div className="overview-metric-top"><span>{label}</span><Icon size={17} /></div>
          {initialLoading ? <Skeleton height="34px" width="52px" borderRadius="5px" /> : <strong>{count.toLocaleString("zh-CN")}</strong>}
          <div className="overview-metric-bottom"><span>{detail}</span><ArrowRight size={14} /></div>
        </button>)}
      </section>
      <div className="queue-workspace">
        <section className="panel queue-list-panel" aria-label="下载列表">
          <div className="overview-panel-heading">
            <div><span className="overview-eyebrow">任务管理</span><h3>下载列表<span className="queue-result-count">{initialLoading ? "读取中…" : `${filteredTasks.length} 项${normalizedSearch ? "匹配" : "记录"}`}</span></h3></div>
            <div className="queue-list-tools">
              <button className="overview-text-link" onClick={() => onClearCompleted()} disabled={loading || !queueCounts.completed}><Trash2 size={14} />清除已完成</button>
              <div className="queue-view-toggle" role="group" aria-label="显示方式">
                <button aria-label="列表视图" title="列表视图" aria-pressed={viewMode === "table"} onClick={() => setViewMode("table")}><List size={15} /></button>
                <button aria-label="卡片视图" title="卡片视图" aria-pressed={viewMode === "card"} onClick={() => setViewMode("card")}><LayoutGrid size={15} /></button>
              </div>
            </div>
          </div>
          <div className="overview-task-tabs queue-tabs" role="tablist" aria-label="任务状态过滤" onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const index = Math.max(0, tabs.findIndex((tab) => tab.key === activeTab));
            const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
            selectTab(tabs[next].key);
            document.getElementById(`queue-tab-${tabs[next].key}`)?.focus();
          }}>
            {tabs.map((tab) => <button role="tab" id={`queue-tab-${tab.key}`} key={tab.key} tabIndex={activeTab === tab.key ? 0 : -1} aria-controls="queue-results" aria-selected={activeTab === tab.key} className={activeTab === tab.key ? "active" : ""} onClick={() => selectTab(tab.key)}>{tab.label}<span>{initialLoading ? "—" : queueCounts[tab.key] ?? 0}</span></button>)}
          </div>
          <div id="queue-results" role="tabpanel" aria-labelledby={`queue-tab-${activeTab}`}>
            {initialLoading ? <div className="queue-loading"><SkeletonTable rows={6} cols={3} /></div> : filteredTasks.length ? <div className={`queue-entries ${viewMode === "card" ? "queue-cards" : ""}`}>
              {filteredTasks.map((task) => <TaskEntry key={task.task_id} task={task} selected={task.task_id === detailTask?.task_id} noImageMode={noImageMode} loading={loading} onSelect={() => selectTask(task.task_id)} onControl={onControl} onRetry={onRetry} />)}
            </div> : <div className="overview-empty overview-empty-large"><ListTodo size={30} /><strong>{normalizedSearch ? "没有匹配的任务" : activeTab === "attention" ? "暂无待处理问题" : activeTab === "completed" ? "暂无已完成记录" : "当前分类暂无任务"}</strong><p>{normalizedSearch ? "试试其他标题、状态或作品 ID。" : activeTab === "completed" ? "下载完成的记录会显示在这里。" : activeTab === "attention" ? "失败和部分完成的任务会显示在这里。" : "添加作品 ID 或链接，开始新的下载。"}</p>{!normalizedSearch && <button className="button secondary" onClick={onAddTask}><Plus size={15} />添加下载</button>}</div>}
          </div>
          {!initialLoading && filteredTasks.length > 0 && <div className="queue-list-footnote"><span><span className="queue-live-dot" />{running} 项运行中 · {waiting} 项等待 · {paused} 项暂停</span><span>点击任务查看详情</span></div>}
        </section>
        {!compact && inspector}
      </div>
      {compact && inspectorOpen && <InspectorDialog onClose={() => setInspectorOpen(false)}>{inspector}</InspectorDialog>}
    </div>
  );
}

function TaskEntry({ task, selected, noImageMode, loading, onSelect, onControl, onRetry }: TaskActions & {
  task: Task; selected: boolean; noImageMode: boolean; onSelect: () => void;
}) {
  const hasProgress = task.progress_total > 0;
  return <article className={`queue-entry ${selected ? "selected" : ""} state-${task.status}`}>
    <button className="queue-entry-main" onClick={onSelect} aria-label={`查看任务 ${task.manga_id}`} aria-pressed={selected}>
      <TaskCover key={task.cover_url} url={task.cover_url} noImageMode={noImageMode} />
      <span className="queue-entry-copy"><strong title={taskDisplayName(task)}>{taskDisplayName(task)}</strong><span className="queue-entry-meta"><span>ID {task.manga_id}</span><span title={formatTime(task.updated_at)}>{formatTimeShort(task.updated_at) || "—"} 更新</span></span></span>
      <StatusBadge status={task.status} />
      <span className="queue-entry-progress">
        <span><span>{stageLabel(task.stage)}</span><strong>{hasProgress ? `${progressPercent(task.progress_current, task.progress_total)}%` : "—"}</strong></span>
        {hasProgress ? <ProgressBar value={task.progress_current / task.progress_total} /> : <span className="queue-progress-placeholder" />}
        <small>{hasProgress ? progressCount(task) : progressDescription(task)}</small>
      </span>
      {task.last_error && <span className="queue-entry-error" title={task.last_error}><AlertTriangle size={12} /><span>{task.last_error}</span></span>}
      <ChevronRight size={15} className="queue-entry-chevron" />
    </button>
    <div className="queue-entry-actions">
      {canPause(task) && <button className="icon-button" title={`暂停任务 ${task.manga_id}`} aria-label={`暂停任务 ${task.manga_id}`} disabled={loading} onClick={() => void onControl(task, "pause")}><Pause size={15} /></button>}
      {canResume(task) && <button className="icon-button" title={`${task.status === "pending" ? "开始" : "继续"}任务 ${task.manga_id}`} aria-label={`${task.status === "pending" ? "开始" : "继续"}任务 ${task.manga_id}`} disabled={loading} onClick={() => void onControl(task, "resume")}><Play size={15} /></button>}
      {canRetry(task) && task.status !== "completed" && <button className="icon-button" title={`重试任务 ${task.manga_id}`} aria-label={`重试任务 ${task.manga_id}`} disabled={loading} onClick={() => void onRetry(task)}><RotateCcw size={15} /></button>}
      {task.status === "completed" && <CheckCircle2 size={16} className="icon-success" />}
    </div>
  </article>;
}

function TaskCover({ url, noImageMode, preview = false }: { url: string; noImageMode: boolean; preview?: boolean }) {
  return <CoverImage url={url} noImageMode={noImageMode} className="queue-cover" preview={preview} />;
}

function InspectorDialog({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} className="queue-inspector-dialog" aria-label="任务详情" onCancel={onClose} onClose={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>{children}</dialog>;
}

function TaskDetailPanel({ task, loading, noImageMode, onControl, onRetry, onClearCompleted, onClose }: TaskActions & {
  task: Task | null; noImageMode: boolean; onClearCompleted: (task?: Task) => void; onClose?: () => void;
}) {
  const [logsOpen, setLogsOpen] = useState(!!task?.last_error);
  const [titleExpanded, setTitleExpanded] = useState(false);
  return <aside className="panel queue-inspector" aria-label="任务详情">
    <div className="overview-panel-heading"><div><span className="overview-eyebrow">当前选择</span><h3>任务详情</h3></div>{onClose ? <button className="icon-button" aria-label="关闭任务详情" onClick={onClose} autoFocus><X size={17} /></button> : <ListTodo size={17} className="queue-detail-mark" />}</div>
    {task ? <>
      <div className="queue-inspector-body">
        <div className="queue-detail-summary"><TaskCover key={task.cover_url} url={task.cover_url} noImageMode={noImageMode} preview /><div><StatusBadge status={task.status} /><h3 className={titleExpanded ? "expanded" : ""} title={taskDisplayName(task)}>{taskDisplayName(task)}</h3>{taskDisplayName(task).length > 80 && <button className="queue-title-toggle" aria-expanded={titleExpanded} onClick={() => setTitleExpanded(!titleExpanded)}>{titleExpanded ? "收起标题" : "展开完整标题"}</button>}<span>ID {task.manga_id}</span></div></div>
        <section className={`queue-detail-progress state-${task.status}`} aria-label="当前进度">
          <div><span>{progressDescription(task)}</span><strong>{task.progress_total > 0 ? `${progressPercent(task.progress_current, task.progress_total)}%` : "—"}</strong></div>
          {task.progress_total > 0 && <ProgressBar value={task.progress_current / task.progress_total} />}
          <p>{task.progress_total > 0 ? `当前阶段 · ${progressCount(task)}` : task.status === "running" ? "图片总数尚未确定，进度会在解析后显示。" : "进度随任务状态自动更新。"}</p>
        </section>
        {task.last_error && <div className="queue-detail-error" role="status"><AlertTriangle size={16} /><div><strong>需要处理</strong><p>{task.last_error}</p></div></div>}
        <div className="queue-detail-metadata"><Info label="当前阶段" value={stageLabel(task.stage)} /><Info label="任务来源" value={task.source || "—"} /><Info label="重试次数" value={`${task.retry_count} 次`} /><Info label="任务 ID" value={task.task_id} /><Info label="创建时间" value={formatTime(task.created_at)} /><Info label="最后更新" value={formatTime(task.updated_at)} /></div>
        <details className="queue-detail-logs" open={logsOpen} onToggle={(event) => setLogsOpen(event.currentTarget.open)}><summary>运行日志<ChevronDown size={15} /></summary>{logsOpen && <TaskRealtimeLogs key={task.task_id} taskId={task.task_id} />}</details>
      </div>
      <div className="queue-inspector-footer"><div className="queue-detail-actions">
        {canPause(task) && <button className="button primary" disabled={loading} onClick={() => void onControl(task, "pause")}><Pause size={15} />暂停任务</button>}
        {canResume(task) && <button className="button primary" disabled={loading} onClick={() => void onControl(task, "resume")}><Play size={15} />{task.status === "pending" ? "开始下载" : "继续下载"}</button>}
        {canRetry(task) && <button className={`button ${task.status === "completed" ? "secondary" : "primary"}`} disabled={loading} onClick={() => void onRetry(task)}><RotateCcw size={15} />{task.status === "completed" ? "重新下载" : "重试任务"}</button>}
        {canCancel(task) && <button className="button secondary danger-button" disabled={loading} onClick={() => void onControl(task, "cancel")}><XCircle size={15} />取消任务</button>}
        {task.status === "completed" && <button className="button secondary" disabled={loading} onClick={() => onClearCompleted(task)}><Trash2 size={15} />清除记录</button>}
      </div><a className="queue-original-link" href={`https://www.wnacg.com/photos-index-aid-${task.manga_id}.html`} target="_blank" rel="noreferrer">打开原始页面<ExternalLink size={13} /></a>{task.status === "completed" && <p>清除记录会保留资料库与本地文件。</p>}</div>
    </> : <div className="overview-empty overview-empty-large"><ListTodo size={28} /><strong>选择一个任务</strong><p>在列表中查看进度、任务信息和运行日志。</p></div>}
  </aside>;
}
