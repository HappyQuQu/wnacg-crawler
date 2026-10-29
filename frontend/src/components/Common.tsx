import { Component, type ReactNode, type ErrorInfo } from "react";
import type { LayoutDashboard } from "lucide-react";

type IconComponent = typeof LayoutDashboard;

export function Metric({
  label,
  value,
  detail,
  Icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  Icon: IconComponent;
  tone: "indigo" | "blue" | "green" | "orange";
}) {
  return (
    <article className={`metric ${tone}`}>
      <div className="metric-icon">
        <Icon size={18} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
    </article>
  );
}

export function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="mini-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="info">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function ProgressBar({ value }: { value: number }) {
  const width = `${Math.min(Math.max(value, 0), 1) * 100}%`;
  return (
    <div className="progress-bar">
      <span style={{ width }} />
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const labelMap: Record<string, string> = {
    ready: "可加入",
    valid: "有效",
    running: "运行中",
    exists: "已存在",
    partial: "部分完成",
    failed: "失败",
    invalid: "无效",
    missing: "缺失",
    pending: "待确认",
    queued: "排队中",
    paused: "暂停",
    completed: "已完成",
    archived: "已清理",
    cancelled: "已取消",
  };
  const className =
    status === "partial"
      ? "warning"
      : ["failed", "invalid", "missing", "cancelled"].includes(status)
        ? "danger"
        : ["exists", "completed", "valid"].includes(status)
          ? "success"
          : "";
  return <span className={`status ${className}`}>{labelMap[status] ?? status}</span>;
}

export function LogLevelBadge({ level }: { level: string }) {
  const className = level === "error" ? "danger" : level === "warning" ? "warning" : "success";
  const labelMap: Record<string, string> = { info: "信息", warning: "警告", error: "错误" };
  return <span className={`status ${className}`}>{labelMap[level] ?? level}</span>;
}

type ErrorBoundaryProps = { children: ReactNode };
type ErrorBoundaryState = { hasError: boolean; error: Error | null };

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 48, textAlign: "center" }}>
          <h2 style={{ marginBottom: 8 }}>页面出错了</h2>
          <p style={{ color: "#888", marginBottom: 16 }}>{this.state.error?.message}</p>
          <button
            className="button primary"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
          >
            刷新页面
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
