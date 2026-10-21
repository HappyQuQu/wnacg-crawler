import { useState } from "react";
import {
  Activity, AlertTriangle, ArrowDownToLine, ArrowRight, BookOpen, Check,
  CheckCircle2, ChevronRight, Clock3, FileSearch, FolderOpen, Image,
  ListTodo, Pause, Plus, RefreshCw, RotateCcw, ShieldCheck,
} from "lucide-react";
import type { LibraryItem, LogItem, QueueFilter, Task, WsStatus } from "../types";
import { formatLogMessage, formatTime, formatTimeShort, progressPercent, stageLabel, taskDisplayName } from "../utils";
import { ProgressBar, StatusBadge } from "../components/Common";
import { Skeleton } from "../components/Skeleton";

type ProgressTab = "running" | "waiting" | "paused";
const progressTabs = [{ key: "running", label: "运行中" }, { key: "waiting", label: "待开始" }, { key: "paused", label: "已暂停" }] as const;

const latestFirst = (a: { updated_at: string | null }, b: { updated_at: string | null }) =>
  (b.updated_at || "").localeCompare(a.updated_at || "");

export function DashboardPage({
  tasks, libraryItems, recentActivity, initialLoading, loading, wsStatus, searchQuery,
  onAddTask, onRefresh, onNavigateTasks, onNavigateLogs, onNavigateLibrary, onOpenTask, onOpenLibrary, onRetryTask,
}: {
  tasks: Task[];
  libraryItems: LibraryItem[];
  recentActivity: LogItem[];
  initialLoading: boolean;
  loading: boolean;
  wsStatus: WsStatus;
  searchQuery: string;
  onAddTask: () => void;
  onRefresh: () => Promise<void>;
  onNavigateTasks: (filter?: QueueFilter) => void;
  onNavigateLogs: () => void;
  onNavigateLibrary: () => void;
  onOpenTask: (task: Task) => void;
  onOpenLibrary: (item: LibraryItem) => void;
  onRetryTask: (task: Task) => Promise<void>;
}) {
  const [progressTab, setProgressTab] = useState<ProgressTab>("running");
  const running = tasks.filter((task) => task.status === "running");
  const waiting = tasks.filter((task) => ["pending", "queued"].includes(task.status));
  const paused = tasks.filter((task) => task.status === "paused");
  const attention = tasks.filter((task) => ["failed", "partial"].includes(task.status)).sort(latestFirst);
  const completeLibrary = libraryItems.filter((item) => item.status === "completed");
  const query = searchQuery.trim().toLowerCase();
  const matches = (...values: (string | null)[]) => !query || values.some((value) => value?.toLowerCase().includes(query));
  const groups = { running, waiting, paused };
  const matchingTasks = groups[progressTab].filter((task) => matches(task.title, task.manga_id, task.stage, task.status));
  const visibleTasks = [...matchingTasks].sort(latestFirst).slice(0, 5);
  const issues = attention.filter((task) => matches(task.title, task.manga_id, task.last_error)).slice(0, 3);
  const recentLibrary = [...completeLibrary].filter((item) => matches(item.title, item.manga_id)).sort(latestFirst).slice(0, 3);
  const activity = recentActivity.filter((item) => matches(item.message, item.manga_id, item.event)).slice(0, 3);
  const phaseGroups = [
    { label: "获取信息", Icon: FileSearch, stages: ["none", "fetching_info"] },
    { label: "解析页面", Icon: Image, stages: ["fetching_pages", "resolving_images"] },
    { label: "下载图片", Icon: ArrowDownToLine, stages: ["downloading", "retrying_failed_images"] },
    { label: "校验打包", Icon: ShieldCheck, stages: ["verifying", "zipping"] },
  ];
  const metrics = [
    { label: "运行中", count: running.length, detail: paused.length ? `另有 ${paused.length} 项已暂停` : "正在处理的下载任务", Icon: Activity, tone: "blue", action: () => onNavigateTasks("active") },
    { label: "等待开始", count: waiting.length, detail: `${tasks.filter((task) => task.status === "queued").length} 项排队 · ${tasks.filter((task) => task.status === "pending").length} 项待确认`, Icon: Clock3, tone: "neutral", action: () => onNavigateTasks("active") },
    { label: "需要关注", count: attention.length, detail: `${attention.filter((task) => task.status === "failed").length} 项失败 · ${attention.filter((task) => task.status === "partial").length} 项部分完成`, Icon: AlertTriangle, tone: attention.length ? "orange" : "neutral", action: () => onNavigateTasks("attention") },
    { label: "本地作品", count: libraryItems.length, detail: `${completeLibrary.length} 项完整 · ${libraryItems.filter((item) => item.zip_exists).length} 项已打包`, Icon: BookOpen, tone: "green", action: onNavigateLibrary },
  ];

  return (
    <div className="dashboard-overview" aria-busy={initialLoading}>
      <header className="overview-heading">
        <div>
          <div className="overview-heading-topline">
            <h2>下载工作台</h2>
            <span className={`overview-connection ${wsStatus === "connected" ? "live" : ""}`}><span />{wsStatus === "connected" ? "实时同步" : wsStatus === "connecting" ? "正在连接" : "定时刷新"}</span>
          </div>
          <p>{initialLoading ? "正在读取任务与资料库…" : running.length ? "查看当前进度，处理下载中遇到的问题。" : waiting.length ? "有任务等待开始，可前往任务列表管理。" : "添加新的下载，或继续整理你的本地资料。"}</p>
        </div>
        <div className="overview-heading-actions">
          <button className="button secondary overview-refresh" onClick={() => void onRefresh()} disabled={loading} aria-label="刷新概览" title="刷新概览"><RefreshCw size={16} className={loading ? "spin" : ""} /></button>
          <button className="button primary" onClick={onAddTask}><Plus size={16} />添加下载</button>
        </div>
      </header>

      <section className="overview-metrics" aria-label="下载与资料库统计">
        {metrics.map(({ label, count, detail, Icon, tone, action }) => (
          <button key={label} className={`overview-metric ${tone}`} onClick={action} disabled={initialLoading} aria-label={`${label} ${initialLoading ? "加载中" : count}`}>
            <div className="overview-metric-top"><span>{label}</span><Icon size={17} /></div>
            {initialLoading ? <Skeleton height="34px" width="52px" borderRadius="5px" /> : <strong>{count.toLocaleString("zh-CN")}</strong>}
            <div className="overview-metric-bottom"><span>{initialLoading ? "读取中…" : detail}</span><ArrowRight size={14} /></div>
          </button>
        ))}
      </section>

      <div className="overview-workspace">
        <section className="panel overview-progress-panel" aria-labelledby="overview-progress-heading">
          <div className="overview-panel-heading">
            <div><span className="overview-eyebrow">当前队列</span><h3 id="overview-progress-heading">任务进度</h3></div>
            <button className="overview-text-link" onClick={() => onNavigateTasks("active")}>管理任务<ArrowRight size={14} /></button>
          </div>
          <div className="overview-task-tabs" role="tablist" aria-label="概览任务状态" onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const index = progressTabs.findIndex((tab) => tab.key === progressTab);
            const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3;
            setProgressTab(progressTabs[next].key);
            document.getElementById(`overview-tab-${progressTabs[next].key}`)?.focus();
          }}>
            {progressTabs.map((tab) => (
              <button role="tab" type="button" key={tab.key} id={`overview-tab-${tab.key}`} tabIndex={progressTab === tab.key ? 0 : -1} aria-controls="overview-task-panel" aria-selected={progressTab === tab.key} className={progressTab === tab.key ? "active" : ""} onClick={() => setProgressTab(tab.key)}>{tab.label}<span>{initialLoading ? "—" : groups[tab.key].length}</span></button>
            ))}
          </div>
          {!initialLoading && running.length > 0 && progressTab === "running" && (
            <div className="overview-phases" aria-label="运行任务的阶段分布">
              {phaseGroups.map(({ label, Icon, stages }) => {
                const count = running.filter((task) => stages.includes(task.stage)).length;
                return <div className={count ? "occupied" : ""} key={label}><Icon size={15} /><span>{label}</span><strong>{count}</strong></div>;
              })}
            </div>
          )}
          <div id="overview-task-panel" role="tabpanel" aria-labelledby={`overview-tab-${progressTab}`} className="overview-progress-list">
            {initialLoading ? <LoadingRows count={4} /> : visibleTasks.length ? visibleTasks.map((task) => {
              const hasProgress = task.progress_total > 0;
              const percentage = progressPercent(task.progress_current, task.progress_total);
              return (
                <button className="overview-progress-item" key={task.task_id} onClick={() => onOpenTask(task)}>
                  <span className={`overview-task-symbol ${task.status === "paused" ? "paused" : ""}`}>{task.status === "paused" ? <Pause size={18} /> : hasProgress ? <ArrowDownToLine size={18} /> : <FileSearch size={18} />}</span>
                  <span className="overview-progress-body">
                    <span className="overview-progress-title"><strong title={taskDisplayName(task)}>{taskDisplayName(task)}</strong><span>{hasProgress ? `${percentage}%` : stageLabel(task.stage)}</span></span>
                    {hasProgress && <ProgressBar value={task.progress_current / task.progress_total} />}
                    <span className="overview-progress-meta"><span>ID {task.manga_id}</span><span>{hasProgress ? `${stageLabel(task.stage)} · ${task.progress_current} / ${task.progress_total}` : task.status === "pending" ? "等待确认后开始" : task.status === "queued" ? "等待调度" : task.status === "paused" ? "可在任务页继续" : "正在准备，请稍候"}</span></span>
                  </span>
                  <ChevronRight size={15} className="overview-row-chevron" />
                </button>
              );
            }) : (
              <div className="overview-empty overview-empty-large"><ListTodo size={30} /><strong>{query ? "没有匹配的任务" : progressTab === "paused" ? "没有暂停的任务" : progressTab === "waiting" ? "没有等待中的任务" : "当前没有运行中的任务"}</strong><p>{query ? "试试其他标题或作品 ID。" : progressTab === "running" ? "从原站扩展发送作品，或直接添加 ID 和链接。" : "任务状态变化后会自动更新到这里。"}</p>{!query && progressTab === "running" && <button className="button secondary" onClick={onAddTask}><Plus size={15} />添加下载</button>}</div>
            )}
          </div>
          {!initialLoading && matchingTasks.length > 5 && <button className="overview-panel-footer" onClick={() => onNavigateTasks("active")}>当前显示 5 项，查看全部 {matchingTasks.length} 项<ArrowRight size={14} /></button>}
        </section>

        <div className="overview-side-stack">
          <section className="panel overview-attention-panel" aria-labelledby="overview-attention-heading">
            <div className="overview-panel-heading"><div><span className="overview-eyebrow">需要处理</span><h3 id="overview-attention-heading">待处理问题{attention.length > 0 && <span className="overview-count-badge">{attention.length}</span>}</h3></div><button className="overview-text-link" onClick={() => onNavigateTasks("attention")} aria-label="查看全部待处理问题"><ArrowRight size={16} /></button></div>
            {initialLoading ? <LoadingRows count={2} /> : issues.length ? <div className="overview-issue-list">{issues.map((task) => <div className="overview-issue" key={task.task_id}>
              <button className="overview-issue-detail" onClick={() => onOpenTask(task)}><span className="overview-issue-title"><strong>{taskDisplayName(task)}</strong><StatusBadge status={task.status} /></span><span className="overview-issue-error" title={task.last_error || ""}>{task.last_error || (task.status === "partial" ? "文件或归档尚未完整，请检查任务详情。" : "下载未完成，请查看详情后重试。")}</span><span className="overview-small-id">ID {task.manga_id}</span></button>
              <button className="icon-button" disabled={loading} title={`重试任务 ${task.manga_id}`} aria-label={`重试任务 ${task.manga_id}`} onClick={() => void onRetryTask(task)}><RotateCcw size={15} /></button>
            </div>)}</div> : <div className="overview-healthy"><span><Check size={19} /></span><div><strong>{query && attention.length ? "没有匹配的问题" : "暂无待处理问题"}</strong><p>失败和部分完成的任务会显示在这里。</p></div></div>}
          </section>

          <section className="panel overview-library-panel" aria-labelledby="overview-library-heading">
            <div className="overview-panel-heading"><div><span className="overview-eyebrow">本地收藏</span><h3 id="overview-library-heading">最近完成</h3></div><span className="overview-library-mark"><BookOpen size={18} /></span></div>
            {initialLoading ? <LoadingRows count={3} /> : recentLibrary.length ? <div className="overview-library-list">{recentLibrary.map((item) => <button className="overview-library-item" key={item.manga_id} onClick={() => onOpenLibrary(item)}><span className="overview-book-icon"><BookOpen size={17} /></span><span><strong title={item.title}>{item.title || `作品 ${item.manga_id}`}</strong><small>ID {item.manga_id} · {item.valid_files} 张图片</small></span><CheckCircle2 size={15} className="icon-success" /></button>)}</div> : <div className="overview-empty overview-empty-small"><FolderOpen size={24} /><p>{query ? "没有匹配的本地作品" : "完整下载的作品会保存在资料库中。"}</p></div>}
            <button className="overview-library-footer" onClick={onNavigateLibrary}><span>打开资料库<span>{initialLoading ? "读取中…" : `${libraryItems.length} 个本地作品`}</span></span><ArrowRight size={16} /></button>
          </section>
        </div>
      </div>

      <section className="panel overview-activity-panel" aria-labelledby="overview-activity-heading">
        <div className="overview-panel-heading"><div><h3 id="overview-activity-heading">最近动态</h3><p>最近 3 条记录 · 完整历史可前往日志查看</p></div><button className="overview-text-link" onClick={onNavigateLogs}>全部日志<ArrowRight size={14} /></button></div>
        {initialLoading ? <LoadingRows count={2} /> : activity.length ? <div className="overview-activity-list">{activity.map((item) => <div className="overview-activity-item" key={item.id}><span className={`overview-event-mark ${item.level === "error" ? "danger" : item.level === "warning" ? "warning" : ""}`}>{item.level === "error" || item.level === "warning" ? <AlertTriangle size={15} /> : item.event === "task_completed" ? <CheckCircle2 size={15} /> : <Activity size={15} />}</span><div><strong title={formatLogMessage(item)}>{formatLogMessage(item)}</strong><span>{[item.manga_id ? `ID ${item.manga_id}` : "系统记录", item.stage ? stageLabel(item.stage) : ""].filter(Boolean).join(" · ")}</span></div><time dateTime={item.created_at ?? undefined} title={formatTime(item.created_at)}>{formatTimeShort(item.created_at) || "—"}</time></div>)}</div> : <div className="overview-activity-empty">{query ? "没有匹配的动态记录" : "暂无活动记录，任务开始后会显示在这里。"}</div>}
      </section>
    </div>
  );
}

function LoadingRows({ count }: { count: number }) {
  return <div className="overview-skeleton">{Array.from({ length: count }, (_, index) => <div className="overview-loading-row" key={index}><Skeleton width="36px" height="36px" borderRadius="10px" /><div><Skeleton width="74%" height="12px" borderRadius="4px" /><Skeleton width="45%" height="10px" borderRadius="4px" /></div></div>)}</div>;
}
