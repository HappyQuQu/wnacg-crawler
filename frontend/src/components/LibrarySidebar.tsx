import { useMemo } from "react";
import {
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileWarning,
  Archive,
  PackageOpen,
  Tag,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import type { LibraryFilter } from "../types";

type CategoryItem = {
  key: LibraryFilter;
  label: string;
  icon: typeof BookOpen;
  group: "status" | "zip";
};

const categories: CategoryItem[] = [
  { key: "all", label: "全部", icon: BookOpen, group: "status" },
  { key: "completed", label: "完整", icon: CheckCircle2, group: "status" },
  { key: "partial", label: "缺失", icon: AlertTriangle, group: "status" },
  { key: "failed", label: "失败", icon: XCircle, group: "status" },
  { key: "missing", label: "文件异常", icon: FileWarning, group: "status" },
  { key: "zipped", label: "已打包", icon: Archive, group: "zip" },
  { key: "unzipped", label: "未打包", icon: PackageOpen, group: "zip" },
];

export function LibrarySidebar({
  activeFilter,
  counts,
  collapsed,
  onFilterChange,
  onToggleCollapse,
}: {
  activeFilter: LibraryFilter;
  counts: Record<string, number>;
  collapsed: boolean;
  onFilterChange: (f: LibraryFilter) => void;
  onToggleCollapse: () => void;
}) {
  const statusItems = useMemo(() => categories.filter((c) => c.group === "status"), []);
  const zipItems = useMemo(() => categories.filter((c) => c.group === "zip"), []);

  if (collapsed) {
    return (
      <aside className="library-sidebar collapsed">
        <button className="sidebar-toggle" onClick={onToggleCollapse} title="展开侧栏">
          <PanelLeftOpen size={16} />
        </button>
        {categories.map((cat) => {
          const Icon = cat.icon;
          return (
            <button
              key={cat.key}
              className={`sidebar-icon-btn ${activeFilter === cat.key ? "active" : ""}`}
              onClick={() => onFilterChange(cat.key)}
              title={cat.label}
            >
              <Icon size={16} />
            </button>
          );
        })}
      </aside>
    );
  }

  return (
    <aside className="library-sidebar">
      <div className="sidebar-header">
        <span className="eyebrow">资料库</span>
        <button className="sidebar-toggle" onClick={onToggleCollapse} title="折叠侧栏">
          <PanelLeftClose size={16} />
        </button>
      </div>

      <div className="sidebar-group">
        <span className="sidebar-group-label">快速筛选</span>
        {statusItems.map((cat) => {
          const Icon = cat.icon;
          return (
            <button
              key={cat.key}
              className={`sidebar-item ${activeFilter === cat.key ? "active" : ""}`}
              onClick={() => onFilterChange(cat.key)}
            >
              <Icon size={15} />
              <span>{cat.label}</span>
              <span className="sidebar-count">{counts[cat.key] ?? 0}</span>
            </button>
          );
        })}
      </div>

      <div className="sidebar-group">
        <span className="sidebar-group-label">打包状态</span>
        {zipItems.map((cat) => {
          const Icon = cat.icon;
          return (
            <button
              key={cat.key}
              className={`sidebar-item ${activeFilter === cat.key ? "active" : ""}`}
              onClick={() => onFilterChange(cat.key)}
            >
              <Icon size={15} />
              <span>{cat.label}</span>
              <span className="sidebar-count">{counts[cat.key] ?? 0}</span>
            </button>
          );
        })}
      </div>

      <div className="sidebar-group">
        <span className="sidebar-group-label">标签</span>
        <div className="sidebar-empty-hint">
          <Tag size={14} />
          <span>暂无标签</span>
        </div>
      </div>
    </aside>
  );
}
