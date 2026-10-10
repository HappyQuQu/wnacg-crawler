import {
  Archive,
  AlertTriangle,
  ExternalLink,
  FileText,
  FolderOpen,
  ListFilter,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import type { LibraryItem } from "../types";
import { formatBytes, formatTime, libraryDisplayName } from "../utils";
import { Info, StatusBadge } from "./Common";
import { DetailSummary } from "./DetailSummary";

export function LibraryDetailPanel({
  item,
  files,
  problemFileCount,
  showOnlyProblemFiles,
  noImageMode,
  loading,
  detailLoading,
  onClose,
  onVerify,
  onZip,
  onRetryFailed,
  onRefreshDetail,
  setShowOnlyProblemFiles,
}: {
  item: LibraryItem | null;
  files: LibraryItem["files"];
  problemFileCount: number;
  showOnlyProblemFiles: boolean;
  noImageMode: boolean;
  loading: boolean;
  detailLoading: boolean;
  onClose: () => void;
  onVerify: (item: LibraryItem) => Promise<void>;
  onZip: (item: LibraryItem) => Promise<void>;
  onRetryFailed: (item: LibraryItem) => Promise<void>;
  onRefreshDetail: () => void;
  setShowOnlyProblemFiles: (v: boolean) => void;
}) {
  if (!item) return null;

  return (
    <aside className="library-detail-panel" aria-label="资料库详情">
      <div className="detail-panel-header">
        <h2>资料库详情</h2>
        <button className="icon-button" onClick={onClose} title="关闭详情" aria-label="关闭详情">
          <X size={18} />
        </button>
      </div>

      <DetailSummary title={libraryDisplayName(item)} mangaId={item.manga_id} coverUrl={item.cover_url} status={item.status} noImageMode={noImageMode} />

      <div className="detail-grid">
        <Info label="完整度" value={`${Math.round(item.completeness * 100)}%`} />
        <Info label="图片" value={item.pic_count > 0 ? `${item.pic_count} 张` : `${item.total_files} 文件`} />
        <Info label="大小" value={item.zip_exists ? formatBytes(item.zip_size) : "-"} />
        <Info label="缺失" value={String(item.missing_files)} />
        <Info label="失败" value={String(item.failed_files)} />
        <Info label="问题文件" value={String(problemFileCount)} />
      </div>

      <div className="detail-actions">
        <button className="button secondary" onClick={() => void onVerify(item)} disabled={loading}>
          <ShieldCheck size={15} />校验
        </button>
        <button className="button secondary" onClick={() => void onRetryFailed(item)} disabled={loading || problemFileCount === 0}>
          <RotateCcw size={15} />重试问题
        </button>
        <button className="button primary" onClick={() => void onZip(item)} disabled={loading || item.total_files === 0}>
          <Archive size={15} />打包
        </button>
        <button
          className="button secondary"
          onClick={() => window.open(`https://www.wnacg.com/photos-index-aid-${item.manga_id}.html`, "_blank")}
        >
          <ExternalLink size={15} />原始链接
        </button>
      </div>

      <details className="detail-path">
        <summary><FolderOpen size={14} /><span>保存目录</span></summary>
        <span>{item.download_dir || "尚未生成目录"}</span>
      </details>

      {item.last_error && <div className="notice danger"><AlertTriangle size={14} /><span>{item.last_error}</span></div>}

      <section className="detail-files-section" aria-label="文件列表" aria-busy={detailLoading}>
        <div className="detail-files-header">
          <span className="detail-files-heading">文件列表 <span className="mono">{files?.length ?? 0}</span></span>
          <div className="detail-files-tools">
            <label className="filter-toggle">
              <input
                type="checkbox"
                checked={showOnlyProblemFiles}
                onChange={(e) => setShowOnlyProblemFiles(e.target.checked)}
              />
              <ListFilter size={14} /><span>只看问题</span>
            </label>
            <button className="icon-button" onClick={onRefreshDetail} disabled={detailLoading} title="刷新文件列表" aria-label="刷新文件列表">
              <RefreshCw size={14} className={detailLoading ? "spin" : ""} />
            </button>
          </div>
        </div>
        <ul className="detail-file-list">
          {files?.map((file) => {
            const error = file.error_message || (!file.exists ? "文件不存在" : "");
            return (
              <li className="detail-file-item" key={`${item.manga_id}-${file.pic_index}`}>
                <div className="detail-file-topline">
                  <span className="detail-file-index mono">{file.pic_index}</span>
                  <strong className="detail-file-name"><FileText size={14} /><span>{file.file_name || `图片 ${file.pic_index}`}</span></strong>
                  <StatusBadge status={file.status} />
                </div>
                <div className="detail-file-meta">
                  <span>{formatBytes(file.file_size)}</span>
                  <span>更新于 {formatTime(file.updated_at)}</span>
                </div>
                {error && <p className="detail-file-error"><AlertTriangle size={13} /><span>{error}</span></p>}
                <details className="detail-file-path">
                  <summary>查看文件路径</summary>
                  <span>{file.file_path || "尚未生成文件路径"}</span>
                </details>
              </li>
            );
          })}
        </ul>
        {(!files || files.length === 0) && (
          <p className="detail-files-empty" role="status">{detailLoading ? "正在加载文件明细…" : showOnlyProblemFiles ? "当前没有问题文件" : "暂无文件明细"}</p>
        )}
      </section>
    </aside>
  );
}
