import type { ReactNode } from "react";
import { Archive, ArrowDown, ArrowUp, BookOpen, ChevronRight, Download, LayoutGrid, List, Trash2, AlertTriangle } from "lucide-react";
import type { LibraryItem, LibrarySortKey, LibraryViewMode } from "../types";
import { formatBytes, formatTime, formatTimeShort, libraryDisplayName } from "../utils";
import { canDownloadLibrary, isLibraryActive, libraryNeedsAttention } from "../libraryUtils";
import { ProgressBar, StatusBadge } from "./Common";
import { LibraryCover } from "./LibraryCover";
import { SkeletonCard, SkeletonTable } from "./Skeleton";

type SelectionActions = {
  checkedIds: Set<string>;
  checkedCount: number;
  onToggleItem: (id: string) => void;
  onToggleAll: () => void;
  onClear: () => void;
  onDownload: (item?: LibraryItem) => void;
  onDelete: (item?: LibraryItem) => void;
  downloadBusy: boolean;
};
const sortOptions: { key: LibrarySortKey; label: string }[] = [
  { key: "updated_at", label: "更新时间" }, { key: "title", label: "标题" },
  { key: "completeness", label: "完整度" }, { key: "pic_count", label: "图片数" },
  { key: "zip_size", label: "ZIP 大小" },
];

export function LibraryContent({
  items, selectedId, viewMode, sortBy, sortOrder, noImageMode, initialLoading, loading,
  onSelect, onSortChange, onToggleSortOrder, onViewModeChange, selection,
  filters, searching, hasFilters, onResetFilters, onAddTask,
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
  selection: SelectionActions;
  filters: ReactNode;
  searching: boolean;
  hasFilters: boolean;
  onResetFilters: () => void;
  onAddTask: () => void;
}) {
  return <section className="panel collection-panel" aria-label="本地作品列表">
    <div className="overview-panel-heading">
      <div><span className="overview-eyebrow">本地收藏</span><h3 id="library-results-heading">作品列表<span className="queue-result-count">{initialLoading ? "读取中…" : `${items.length} 项${searching || hasFilters ? "匹配" : "作品"}`}</span></h3></div>
      <div className="queue-view-toggle" role="group" aria-label="资料库显示方式">
        <button title="列表视图" aria-label="列表视图" aria-pressed={viewMode === "list"} onClick={() => onViewModeChange("list")}><List size={15} /></button>
        <button title="卡片视图" aria-label="卡片视图" aria-pressed={viewMode === "card"} onClick={() => onViewModeChange("card")}><LayoutGrid size={15} /></button>
      </div>
    </div>
    {filters}
    <div className="collection-toolbar">
      <label className="collection-select-all"><input type="checkbox" aria-label="全选当前筛选结果" checked={items.length > 0 && selection.checkedCount === items.length} ref={(node) => { if (node) node.indeterminate = selection.checkedCount > 0 && selection.checkedCount < items.length; }} disabled={loading || initialLoading || !items.length} onChange={selection.onToggleAll} />全选<span>{selection.checkedCount ? `已选 ${selection.checkedCount} 项` : "选择作品进行批量操作"}</span></label>
      <div className="collection-sort"><label><span className="sr-only">资料库排序</span><select aria-label="资料库排序" value={sortBy} onChange={(event) => onSortChange(event.target.value as LibrarySortKey)} disabled={loading}>{sortOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label><button className="icon-button" title={sortOrder === "desc" ? "当前降序，切换为升序" : "当前升序，切换为降序"} aria-label={sortOrder === "desc" ? "切换为升序" : "切换为降序"} disabled={loading} onClick={onToggleSortOrder}>{sortOrder === "desc" ? <ArrowDown size={14} /> : <ArrowUp size={14} />}</button></div>
    </div>
    {selection.checkedCount > 0 && <div className="collection-batch-bar" aria-label="批量操作">
      <div><strong>已选 {selection.checkedCount} 项作品</strong><span>每项作品下载为单独文件</span></div>
      <div><button className="button primary" disabled={loading} onClick={() => selection.onDownload()}><Download size={14} />{selection.downloadBusy ? "准备下载中…" : "下载所选"}</button><button className="button secondary danger-button" disabled={loading} onClick={() => selection.onDelete()}><Trash2 size={14} />删除所选</button><button className="overview-text-link" disabled={loading} onClick={selection.onClear}>取消选择</button></div>
    </div>}
    <div id="library-results" role="tabpanel" aria-labelledby="library-results-heading">
      {initialLoading ? viewMode === "card" ? <div className="collection-entries as-cards">{Array.from({ length: 6 }, (_, index) => <SkeletonCard key={index} />)}</div> : <div className="queue-loading"><SkeletonTable rows={6} cols={4} /></div> : !items.length ? <div className="overview-empty overview-empty-large"><BookOpen size={30} /><strong>{searching ? "没有匹配的作品" : hasFilters ? "当前分类暂无作品" : "资料库还是空的"}</strong><p>{searching ? "试试其他标题、状态或作品 ID。" : hasFilters ? "调整筛选条件，查看其他本地作品。" : "添加下载后，作品与文件信息会显示在这里。"}</p><button className="button secondary" onClick={searching || hasFilters ? onResetFilters : onAddTask}>{searching || hasFilters ? "重置筛选" : "添加下载"}</button></div> : <div className={`collection-entries ${viewMode === "card" ? "as-cards" : "as-list"}`}>
        {items.map((item) => {
          const active = isLibraryActive(item);
          const percentage = Math.min(100, Math.max(0, Math.round(item.completeness * 100)));
          return <article key={item.manga_id} className={`collection-entry ${item.manga_id === selectedId ? "selected" : ""} ${selection.checkedIds.has(item.manga_id) ? "checked" : ""} ${item.status === "completed" ? "complete" : ""}`}>
            <label className="collection-select"><input type="checkbox" aria-label={`选择作品 ${item.manga_id}`} checked={selection.checkedIds.has(item.manga_id)} disabled={loading} onChange={() => selection.onToggleItem(item.manga_id)} /></label>
            <button className="collection-open" aria-label={`查看作品 ${item.manga_id}`} aria-pressed={item.manga_id === selectedId} onClick={() => onSelect(item)}>
              <LibraryCover url={item.cover_url} noImageMode={noImageMode} />
              <span className="collection-copy"><strong title={libraryDisplayName(item)}>{libraryDisplayName(item)}</strong><span>ID {item.manga_id}<time title={formatTime(item.updated_at)}>{formatTimeShort(item.updated_at) || "—"} 更新</time></span></span>
              <StatusBadge status={item.status} />
              <span className="collection-integrity"><span><span>文件完整度</span><strong>{item.total_files > 0 ? `${percentage}%` : "—"}</strong></span><ProgressBar value={item.completeness} /><small>{item.valid_files} / {item.total_files} 个有效文件</small></span>
              <span className={`collection-archive ${item.zip_exists ? "ready" : ""}`}><span><Archive size={13} />{item.zip_exists ? "已打包" : "未打包"}</span><small>{item.zip_exists ? formatBytes(item.zip_size) : active ? "等待下载完成" : libraryNeedsAttention(item) ? "补全后可打包" : "下载时自动准备"}</small></span>
              {!active && (item.last_error || item.failed_files > 0 || item.missing_files > 0) && <span className="collection-entry-warning"><AlertTriangle size={12} /><span>{item.last_error || `缺失 ${item.missing_files} 个 · 失败 ${item.failed_files} 个`}</span></span>}
              <ChevronRight size={14} className="collection-chevron" />
            </button>
            <div className="collection-entry-actions"><button className="button secondary" aria-label={`下载作品 ${item.manga_id}`} title={active ? "作品仍有未结束的任务" : !canDownloadLibrary(item) ? "图片尚未完整，请先补全" : "下载此作品的独立文件"} disabled={loading || !canDownloadLibrary(item)} onClick={() => selection.onDownload(item)}><Download size={14} /><span>下载文件</span></button><button className="icon-button danger-button" aria-label={`删除作品 ${item.manga_id}`} title={active ? "请先完成或取消任务" : "删除资料"} disabled={loading || active} onClick={() => selection.onDelete(item)}><Trash2 size={14} /></button></div>
          </article>;
        })}
      </div>}
    </div>
    {!initialLoading && items.length > 0 && <div className="collection-list-footer"><span>共 {items.length} 项作品</span><span>文件操作前会再次检查本地状态</span></div>}
  </section>;
}
