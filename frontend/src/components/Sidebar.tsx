import {
  BookOpen,
  ClipboardList,
  Download,
  LayoutDashboard,
  Plus,
  Settings,
} from "lucide-react";
import type { ViewKey, WsStatus } from "../types";

const navItems: { key: ViewKey; label: string; Icon: typeof LayoutDashboard }[] = [
  { key: "dashboard", label: "概览", Icon: LayoutDashboard },
  { key: "tasks", label: "下载任务", Icon: ClipboardList },
  { key: "library", label: "资料库", Icon: BookOpen },
  { key: "settings", label: "设置", Icon: Settings },
];

export function Sidebar({
  activeView,
  setActiveView,
  wsStatus,
  navCounts,
  queueActive,
  onAddTask,
}: {
  activeView: ViewKey;
  setActiveView: (view: ViewKey) => void;
  wsStatus: WsStatus;
  navCounts: Record<ViewKey, string>;
  queueActive: number;
  onAddTask: () => void;
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <Download size={20} />
        </div>
        <div>
          <strong>WNACG Downloader</strong>
          <span>本地采集工作台</span>
        </div>
      </div>

      <nav className="nav" aria-label="主导航">
        {navItems.map(({ key, label, Icon }) => (
          <button
            key={key}
            className={`nav-item ${activeView === key ? "active" : ""}`}
            onClick={() => setActiveView(key)}
          >
            <Icon size={18} />
            <span>{label}</span>
            <span className="pill-count">{navCounts[key]}</span>
          </button>
        ))}
      </nav>

      <button className="button primary sidebar-add-btn" onClick={onAddTask}>
        <Plus size={15} />添加任务
      </button>

      <section className="sidebar-status">
        <div className="sidebar-status-row">
          <span className={`status-dot ${wsStatus === "connected" ? "connected" : "disconnected"}`} />
          <span className="sidebar-status-text">
            {wsStatus === "connected" ? "实时同步" : "轮询中"}
          </span>
        </div>
        {queueActive > 0 && (
          <span className="sidebar-status-count">{queueActive} 个任务运行中</span>
        )}
      </section>
    </aside>
  );
}
