import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  RotateCcw,
  Zap,
} from "lucide-react";
import type { Task, LogItem } from "../types";
import { stageLabel, formatTime, canRetry, taskDisplayName } from "../utils";
import { ProgressBar, StatusBadge } from "../components/Common";
import { Skeleton } from "../components/Skeleton";

export function DashboardPage({
  tasks,
  runningTasks,
  recentActivity,
  initialLoading,
  onNavigateTasks,
  onRetryTask,
}: {
  tasks: Task[];
  runningTasks: Task[];
  recentActivity: LogItem[];
  initialLoading: boolean;
  onNavigateTasks: () => void;
  onRetryTask: (task: Task) => Promise<void>;
}) {
  const completed = tasks.filter((t) => t.status === "completed");
  const failed = tasks.filter((t) => t.status === "failed");
  const queued = tasks.filter((t) => t.status === "queued" || t.status === "pending");
  const recentCompleted = completed.slice(0, 5);
  const recentFailed = failed.slice(0, 5);

  return (
    <div className="dashboard-overview">
      {/* Metric cards */}
      <div className="overview-metrics">
        <div className="overview-metric running">
          <div className="overview-metric-icon"><Activity size={20} /></div>
          <div>
            <span>运行中</span>
            <strong>{runningTasks.length}</strong>
          </div>
        </div>
        <div className="overview-metric queued">
          <div className="overview-metric-icon"><Clock size={20} /></div>
          <div>
            <span>排队中</span>
            <strong>{queued.length}</strong>
          </div>
        </div>
        <div className="overview-metric completed">
          <div className="overview-metric-icon"><CheckCircle2 size={20} /></div>
          <div>
            <span>已完成</span>
            <strong>{completed.length}</strong>
          </div>
        </div>
        <div className="overview-metric failed">
          <div className="overview-metric-icon"><AlertTriangle size={20} /></div>
          <div>
            <span>失败</span>
            <strong>{failed.length}</strong>
          </div>
        </div>
      </div>

      {/* Running tasks */}
      <section className="panel overview-section">
        <div className="panel-header">
          <div>
            <span className="eyebrow">实时进度</span>
            <h2>运行中任务</h2>
          </div>
          {runningTasks.length > 0 && (
            <button className="button ghost" onClick={onNavigateTasks}>
              查看全部 <ArrowRight size={14} />
            </button>
          )}
        </div>
        {initialLoading ? (
          <div className="overview-skeleton">
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="overview-task-skeleton">
                <Skeleton height="14px" width="40%" borderRadius="4px" />
                <Skeleton height="6px" width="100%" borderRadius="999px" />
              </div>
            ))}
          </div>
        ) : runningTasks.length > 0 ? (
          <div className="overview-task-list">
            {runningTasks.map((task) => (
              <div className="overview-task" key={task.task_id}>
                <div className="overview-task-info">
                  <div className="overview-task-header">
                    <span className="mono">{task.manga_id}</span>
                    <strong>{taskDisplayName(task)}</strong>
                  </div>
                  <div className="overview-task-progress">
                    <ProgressBar value={task.progress_total > 0 ? task.progress_current / task.progress_total : 0} />
                    <span>{task.progress_current}/{task.progress_total}</span>
                  </div>
                </div>
                <StatusBadge status={task.status} />
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-copy">暂无运行中任务</p>
        )}
      </section>

      <div className="overview-split">
        {/* Recent completed */}
        <section className="panel overview-section">
          <div className="panel-header">
            <div>
              <span className="eyebrow">最近完成</span>
              <h2>已完成</h2>
            </div>
          </div>
          {initialLoading ? (
            <div className="overview-skeleton">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} height="40px" borderRadius="8px" />
              ))}
            </div>
          ) : recentCompleted.length > 0 ? (
            <div className="overview-list">
              {recentCompleted.map((task) => (
                <div className="overview-list-item" key={task.task_id}>
                  <CheckCircle2 size={16} className="icon-success" />
                  <div className="overview-list-info">
                    <strong className="mono">{task.manga_id}</strong>
                    <span>{taskDisplayName(task)}</span>
                  </div>
                  <span className="overview-list-time">{formatTime(task.updated_at)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-copy">暂无已完成任务</p>
          )}
        </section>

        {/* Recent failed */}
        <section className="panel overview-section">
          <div className="panel-header">
            <div>
              <span className="eyebrow">需要关注</span>
              <h2>失败任务</h2>
            </div>
          </div>
          {initialLoading ? (
            <div className="overview-skeleton">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} height="40px" borderRadius="8px" />
              ))}
            </div>
          ) : recentFailed.length > 0 ? (
            <div className="overview-list">
              {recentFailed.map((task) => (
                <div className="overview-list-item" key={task.task_id}>
                  <AlertTriangle size={16} className="icon-danger" />
                  <div className="overview-list-info">
                    <strong className="mono">{task.manga_id}</strong>
                    <span>{task.last_error || taskDisplayName(task)}</span>
                  </div>
                  {canRetry(task) && (
                    <button
                      className="icon-button"
                      title="重试"
                      onClick={() => void onRetryTask(task)}
                    >
                      <RotateCcw size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-copy">没有失败任务</p>
          )}
        </section>
      </div>

      {/* Recent activity */}
      <section className="panel overview-section">
        <div className="panel-header">
          <div>
            <span className="eyebrow">最近动态</span>
            <h2>活动记录</h2>
          </div>
          <button className="button ghost" onClick={onNavigateTasks}>
            查看全部 <ArrowRight size={14} />
          </button>
        </div>
        {initialLoading ? (
          <div className="overview-skeleton">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="activity-skeleton">
                <Skeleton width="28px" height="28px" borderRadius="999px" />
                <Skeleton height="14px" width="70%" borderRadius="4px" />
              </div>
            ))}
          </div>
        ) : recentActivity.length > 0 ? (
          <div className="activity-feed">
            {recentActivity.map((item) => (
              <div className="activity-item" key={item.id}>
                <div className={`activity-icon ${item.level === "error" ? "danger" : item.level === "warning" ? "warning" : "info"}`}>
                  {item.level === "error" || item.level === "warning" ? <AlertTriangle size={14} /> : <Zap size={14} />}
                </div>
                <div className="activity-body">
                  <strong>{item.message || item.event}</strong>
                  <span>
                    {item.manga_id ? `${item.manga_id} · ` : ""}
                    {item.stage ? stageLabel(item.stage) : ""}
                  </span>
                </div>
                <span className="activity-time">{formatTime(item.created_at)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-copy">暂无活动记录</p>
        )}
      </section>
    </div>
  );
}
