import {
  ArrowUpDown,
  BookOpen,
  Eye,
  HardDrive,
  LayoutGrid,
  List,
  RefreshCw,
  ShieldCheck,
  Archive,
} from "lucide-react";
import type { LibraryItem, LibrarySortKey, LibraryViewMode } from "../types";
import { formatBytes, libraryDisplayName } from "../utils";
import { ProgressBar, StatusBadge } from "./Common";
import { SkeletonCard, SkeletonTable } from "./Skeleton";

const sortOptions: { key: LibrarySortKey; label: string }[] = [
  { key: "updated_at", label: "更新时间" },
  { key: "title", label: "标题" },
  { key: "completeness", label: "完成度" },
  { key: "pic_count", label: "图片数" },
  { key: "zip_size", label: "文件大小" },
];

export function LibraryContent({
  items,
  selectedId,
  viewMode,
  sortBy,
  sortOrder,
  noImageMode,
  initialLoading,
  loading,
  onSelect,
  onSortChange,
  onToggleSortOrder,
  onViewModeChange,
  onRefresh,
  onVerify,
  onZip,
}: {
  items: LibraryItem[];
  selectedId: string | null;
  viewMode: LibraryViewMode;
  sortBy: LibrarySortKey;
  sortOrder: "asc" | "desc";
  noImageMode: boolean;
  initialLoading: boolean;
  loading: boolean;
  onSelect: (item: LibraryItem) => void;
  onSortChange: (key: LibrarySortKey) => void;
  onToggleSortOrder: () => void;
  onViewModeChange: (mode: LibraryViewMode) => void;
  onRefresh: () => Promise<void>;
  onVerify: (item: LibraryItem) => Promise<void>;
  onZip: (item: LibraryItem) => Promise<void>;
}) {
  return (
    <section className="library-content">
      <div className="library-toolbar">
        <div className="toolbar-left">
          <div className="sort-control">
            <ArrowUpDown size={14} />
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as LibrarySortKey)}
              className="sort-select"
            >
              {sortOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
            <button
              className={`sort-order-btn ${sortOrder === "asc" ? "asc" : ""}`}
              onClick={onToggleSortOrder}
              title={sortOrder === "desc" ? "降序" : "升序"}
            >
              {sortOrder === "desc" ? "↓" : "↑"}
            </button>
          </div>
        </div>
        <div className="toolbar-right">
          <div className="view-toggle">
            <button
              className={`view-toggle-btn ${viewMode === "list" ? "active" : ""}`}
              onClick={() => onViewModeChange("list")}
              title="列表视图"
            >
              <List size={15} />
            </button>
            <button
              className={`view-toggle-btn ${viewMode === "card" ? "active" : ""}`}
              onClick={() => onViewModeChange("card")}
              title="卡片视图"
            >
              <LayoutGrid size={15} />
            </button>
          </div>
          <button className="button secondary" onClick={() => void onRefresh()} disabled={loading}>
            <RefreshCw size={15} />刷新
          </button>
        </div>
      </div>

      {initialLoading ? (
        viewMode === "card" ? (
          <div className="library-card-grid">
            {Array.from({ length: 8 }, (_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <div style={{ padding: "14px 18px" }}><SkeletonTable rows={6} cols={6} /></div>
        )
      ) : items.length === 0 ? (
        <div className="empty-state">
          <HardDrive size={28} />
          <strong>当前分类暂无资料</strong>
          <p>完成下载或校验后，条目会出现在这里。</p>
        </div>
      ) : viewMode === "card" ? (
        <CardGrid
          items={items}
          selectedId={selectedId}
          noImageMode={noImageMode}
          loading={loading}
          onSelect={onSelect}
          onVerify={onVerify}
          onZip={onZip}
        />
      ) : (
        <ListView
          items={items}
          selectedId={selectedId}
          noImageMode={noImageMode}
          loading={loading}
          onSelect={onSelect}
          onVerify={onVerify}
          onZip={onZip}
        />
      )}
    </section>
  );
}

function CardGrid({
  items,
  selectedId,
  noImageMode,
  loading,
  onSelect,
  onVerify,
  onZip,
}: {
  items: LibraryItem[];
  selectedId: string | null;
  noImageMode: boolean;
  loading: boolean;
  onSelect: (item: LibraryItem) => void;
  onVerify: (item: LibraryItem) => Promise<void>;
  onZip: (item: LibraryItem) => Promise<void>;
}) {
  return (
    <div className="library-card-grid">
      {items.map((item) => (
        <article
          key={item.manga_id}
          className={`library-card ${item.manga_id === selectedId ? "selected" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => onSelect(item)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(item); } }}
        >
          <div className={`library-card-cover ${noImageMode ? "no-image-blur" : ""}`}>
            {item.cover_url ? <img src={item.cover_url} alt="" /> : <BookOpen size={24} />}
          </div>
          <div className="library-card-body">
            <div className="library-card-title">
              <h3>{libraryDisplayName(item)}</h3>
              <StatusBadge status={item.status} />
            </div>
            <span className="mono library-card-id">{item.manga_id}</span>
            <div className="library-progress-row">
              <ProgressBar value={item.completeness} />
              <strong>{Math.round(item.completeness * 100)}%</strong>
            </div>
            <div className="library-meta">
              <span>{item.pic_count > 0 ? `${item.pic_count} 图` : `${item.total_files} 文件`}</span>
              <span>{item.valid_files}/{item.total_files} 有效</span>
              {item.zip_exists && <span>{formatBytes(item.zip_size)}</span>}
              {item.missing_files > 0 && <span className="meta-warning">缺 {item.missing_files}</span>}
              {item.failed_files > 0 && <span className="meta-danger">失败 {item.failed_files}</span>}
            </div>
            <div className="row-actions">
              <button className="icon-button" title="查看文件" onClick={(e) => { e.stopPropagation(); onSelect(item); }}><Eye size={14} /></button>
              <button className="icon-button" title="重新校验" onClick={(e) => { e.stopPropagation(); void onVerify(item); }} disabled={loading}><ShieldCheck size={14} /></button>
              <button className="icon-button" title="重新打包" onClick={(e) => { e.stopPropagation(); void onZip(item); }} disabled={loading || item.total_files === 0}><Archive size={14} /></button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function ListView({
  items,
  selectedId,
  noImageMode,
  loading,
  onSelect,
  onVerify,
  onZip,
}: {
  items: LibraryItem[];
  selectedId: string | null;
  noImageMode: boolean;
  loading: boolean;
  onSelect: (item: LibraryItem) => void;
  onVerify: (item: LibraryItem) => Promise<void>;
  onZip: (item: LibraryItem) => Promise<void>;
}) {
  return (
    <div className="table-wrap">
      <table className="library-table">
        <thead>
          <tr>
            <th>封面</th>
            <th>标题</th>
            <th>状态</th>
            <th>完成度</th>
            <th>图片</th>
            <th>大小</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.manga_id}
              className={item.manga_id === selectedId ? "selected-row" : ""}
              onClick={() => onSelect(item)}
            >
              <td>
                <div className={`row-thumb ${noImageMode ? "no-image-blur" : ""}`}>
                  {item.cover_url ? <img src={item.cover_url} alt="" /> : <BookOpen size={16} />}
                </div>
              </td>
              <td>
                <div className="row-text">
                  <span className="row-name">{libraryDisplayName(item)}</span>
                  <span className="mono row-id-small">{item.manga_id}</span>
                </div>
              </td>
              <td><StatusBadge status={item.status} /></td>
              <td>
                <div className="progress-cell">
                  <ProgressBar value={item.completeness} />
                  <span>{Math.round(item.completeness * 100)}%</span>
                </div>
              </td>
              <td className="mono">{item.pic_count > 0 ? `${item.pic_count}` : `${item.total_files}`}</td>
              <td>{item.zip_exists ? formatBytes(item.zip_size) : "-"}</td>
              <td>
                <div className="row-actions">
                  <button className="icon-button" title="查看" onClick={(e) => { e.stopPropagation(); onSelect(item); }}><Eye size={14} /></button>
                  <button className="icon-button" title="校验" onClick={(e) => { e.stopPropagation(); void onVerify(item); }} disabled={loading}><ShieldCheck size={14} /></button>
                  <button className="icon-button" title="打包" onClick={(e) => { e.stopPropagation(); void onZip(item); }} disabled={loading || item.total_files === 0}><Archive size={14} /></button>
                </div>
              </td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={7}>当前分类暂无资料</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
