import {
  Archive,
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
import { Info, ProgressBar, StatusBadge } from "./Common";

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
    <aside className="library-detail-panel">
      <div className="detail-panel-header">
        <button className="icon-button" onClick={onClose} title="关闭">
          <X size={18} />
        </button>
      </div>

      <div className="detail-cover-wrap">
        <div className={`detail-cover ${noImageMode ? "no-image-blur" : ""}`}>
          {item.cover_url ? (
            <img src={item.cover_url} alt={item.title || item.manga_id} />
          ) : (
            <div className="detail-cover-placeholder" />
          )}
        </div>
      </div>

      <div className="detail-title-section">
        <h3>{libraryDisplayName(item)}</h3>
        <span className="mono">{item.manga_id}</span>
        <StatusBadge status={item.status} />
      </div>

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

      <div className="detail-path">
        <FolderOpen size={14} />
        <span>{item.download_dir}</span>
      </div>

      <div className="detail-files-section">
        <div className="detail-files-header">
          <span className="eyebrow">文件列表</span>
          <div className="detail-files-tools">
            <label className="filter-toggle">
              <input
                type="checkbox"
                checked={showOnlyProblemFiles}
                onChange={(e) => setShowOnlyProblemFiles(e.target.checked)}
              />
              <ListFilter size={14} /><span>只看问题</span>
            </label>
            <button className="button secondary compact" onClick={onRefreshDetail} disabled={detailLoading}>
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
        <div className="table-wrap file-table-wrap">
          <table className="file-table">
            <thead>
              <tr>
                <th>序号</th>
                <th>文件</th>
                <th>状态</th>
                <th>大小</th>
                <th>错误</th>
                <th>更新时间</th>
              </tr>
            </thead>
            <tbody>
              {files?.map((file) => (
                <tr key={`${item.manga_id}-${file.pic_index}`}>
                  <td className="mono">{file.pic_index}</td>
                  <td className="wrap-cell file-name-cell">
                    <div className="file-meta">
                      <strong><FileText size={13} />{file.file_name}</strong>
                      <span>{file.file_path}</span>
                    </div>
                  </td>
                  <td><StatusBadge status={file.status} /></td>
                  <td>{formatBytes(file.file_size)}</td>
                  <td className="wrap-cell error-cell">
                    {file.error_message || (file.exists ? "-" : "文件不存在")}
                  </td>
                  <td>{formatTime(file.updated_at)}</td>
                </tr>
              ))}
              {(!files || files.length === 0) && (
                <tr><td colSpan={6}>{showOnlyProblemFiles ? "当前没有问题文件" : "暂无文件明细"}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </aside>
  );
}
