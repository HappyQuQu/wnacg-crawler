import { useMemo, useState } from "react";
import {
  Archive,
  BookOpen,
  Eye,
  FileText,
  FolderOpen,
  HardDrive,
  ListFilter,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import type { LibraryItem, LibraryFilter } from "../types";
import { formatBytes, formatTime, libraryDisplayName } from "../utils";
import { Info, ProgressBar, StatusBadge } from "../components/Common";
import { SkeletonCard } from "../components/Skeleton";

const libraryFilters: { key: LibraryFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "completed", label: "完整" },
  { key: "partial", label: "缺失" },
  { key: "failed", label: "失败" },
  { key: "missing", label: "文件异常" },
];

export function LibraryPage({
  libraryItems,
  selectedLibraryId,
  selectedLibraryItem,
  selectedLibraryFiles,
  selectedProblemFileCount,
  libraryCounts,
  libraryDetailLoading,
  showOnlyProblemFiles,
  noImageMode,
  searchQuery,
  loading,
  initialLoading,
  onOpenDetail,
  onVerify,
  onZip,
  onRetryFailed,
  onRefresh,
  onRefreshDetail,
  setShowOnlyProblemFiles,
}: {
  libraryItems: LibraryItem[];
  selectedLibraryId: string | null;
  selectedLibraryItem: LibraryItem | null;
  selectedLibraryFiles: LibraryItem["files"];
  selectedProblemFileCount: number;
  libraryCounts: Record<string, number>;
  libraryDetailLoading: boolean;
  showOnlyProblemFiles: boolean;
  noImageMode: boolean;
  searchQuery: string;
  loading: boolean;
  initialLoading: boolean;
  onOpenDetail: (item: LibraryItem) => Promise<void>;
  onVerify: (item: LibraryItem) => Promise<void>;
  onZip: (item: LibraryItem) => Promise<void>;
  onRetryFailed: (item: LibraryItem) => Promise<void>;
  onRefresh: () => Promise<void>;
  onRefreshDetail: () => void;
  setShowOnlyProblemFiles: (v: boolean) => void;
}) {
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>("all");
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const files = selectedLibraryFiles ?? [];

  const filteredItems = useMemo(() => {
    const byFilter = libraryItems.filter((item) => {
      if (libraryFilter === "completed") return item.status === "completed";
      if (libraryFilter === "partial") return item.status === "partial" || item.missing_files > 0;
      if (libraryFilter === "failed") return item.status === "failed" || item.failed_files > 0;
      if (libraryFilter === "missing") return item.status === "missing" || item.missing_files > 0 || item.failed_files > 0;
      return true;
    });
    if (!normalizedSearch) return byFilter;
    return byFilter.filter((i) =>
      [i.manga_id, i.title, i.status, i.manga_status, i.last_error]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(normalizedSearch))
    );
  }, [libraryFilter, libraryItems, normalizedSearch]);

  return (
    <div className="library-layout">
      <section className="panel library-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">本地归档</span>
            <h2>资料库</h2>
          </div>
          <button className="button secondary" onClick={() => void onRefresh()} disabled={loading}>
            <BookOpen size={15} />刷新
          </button>
        </div>
        <div className="segment-group" role="tablist" aria-label="资料库状态过滤">
          {libraryFilters.map((f) => (
            <button key={f.key} className={`segment ${libraryFilter === f.key ? "active" : ""}`} onClick={() => setLibraryFilter(f.key)}>
              {f.label}<span>{libraryCounts[f.key]}</span>
            </button>
          ))}
        </div>
        <div className="library-grid">
          {initialLoading ? (
            Array.from({ length: 4 }, (_, i) => <SkeletonCard key={i} />)
          ) : filteredItems.map((item) => (
            <article
              key={item.manga_id}
              className={`library-card ${item.manga_id === selectedLibraryId ? "selected" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => void onOpenDetail(item)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); void onOpenDetail(item); } }}
            >
              <div className={`library-cover ${noImageMode ? "no-image-blur" : ""}`}><BookOpen size={24} /></div>
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
                  <button className="icon-button" title="查看文件" onClick={(e) => { e.stopPropagation(); void onOpenDetail(item); }} disabled={libraryDetailLoading}><Eye size={14} /></button>
                  <button className="icon-button" title="重新校验" onClick={(e) => { e.stopPropagation(); void onVerify(item); }} disabled={loading}><ShieldCheck size={14} /></button>
                  <button className="icon-button" title="重新打包" onClick={(e) => { e.stopPropagation(); void onZip(item); }} disabled={loading || item.total_files === 0}><Archive size={14} /></button>
                </div>
              </div>
            </article>
          ))}
          {filteredItems.length === 0 && !initialLoading && (
            <div className="empty-state">
              <HardDrive size={28} />
              <strong>当前分类暂无资料</strong>
              <p>完成下载或校验后，条目会出现在这里。</p>
            </div>
          )}
        </div>
      </section>

      {selectedLibraryItem && (
        <section className="panel library-detail-panel">
          <div className="library-detail-header">
            <div>
              <span className="caption">文件明细</span>
              <h3>{selectedLibraryItem.title || selectedLibraryItem.manga_id}</h3>
              <p>{selectedLibraryItem.manga_id} · {selectedLibraryItem.valid_files}/{selectedLibraryItem.total_files} 有效</p>
            </div>
            <div className="header-actions">
              <label className="filter-toggle">
                <input type="checkbox" checked={showOnlyProblemFiles} onChange={(e) => setShowOnlyProblemFiles(e.target.checked)} />
                <ListFilter size={14} /><span>只看问题</span>
              </label>
              <button className="button secondary" onClick={onRefreshDetail} disabled={libraryDetailLoading}><RefreshCw size={15} />刷新</button>
              <button className="button secondary" onClick={() => void onVerify(selectedLibraryItem)} disabled={loading}><ShieldCheck size={15} />校验</button>
              <button className="button secondary" onClick={() => void onRetryFailed(selectedLibraryItem)} disabled={loading || selectedProblemFileCount === 0}><RotateCcw size={15} />重试问题</button>
              <button className="button primary" onClick={() => void onZip(selectedLibraryItem)} disabled={loading || selectedLibraryItem.total_files === 0}><Archive size={15} />打包</button>
            </div>
          </div>
          <div className="detail-grid library-summary-grid">
            <Info label="完整度" value={`${Math.round(selectedLibraryItem.completeness * 100)}%`} />
            <Info label="缺失" value={String(selectedLibraryItem.missing_files)} />
            <Info label="失败/损坏" value={String(selectedLibraryItem.failed_files)} />
            <Info label="问题文件" value={String(selectedProblemFileCount)} />
          </div>
          <div className="path-row"><FolderOpen size={15} /><span>{selectedLibraryItem.download_dir}</span></div>
          <div className="table-wrap file-table-wrap">
            <table className="file-table">
              <thead><tr><th>序号</th><th>文件</th><th>状态</th><th>大小</th><th>错误</th><th>更新时间</th></tr></thead>
              <tbody>
                {files.map((file) => (
                  <tr key={`${selectedLibraryItem.manga_id}-${file.pic_index}`}>
                    <td className="mono">{file.pic_index}</td>
                    <td className="wrap-cell file-name-cell"><div className="file-meta"><strong><FileText size={13} />{file.file_name}</strong><span>{file.file_path}</span></div></td>
                    <td><StatusBadge status={file.status} /></td>
                    <td>{formatBytes(file.file_size)}</td>
                    <td className="wrap-cell error-cell">{file.error_message || (file.exists ? "-" : "文件不存在")}</td>
                    <td>{formatTime(file.updated_at)}</td>
                  </tr>
                ))}
                {files.length === 0 && <tr><td colSpan={6}>{showOnlyProblemFiles ? "当前没有问题文件" : "暂无文件明细"}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
