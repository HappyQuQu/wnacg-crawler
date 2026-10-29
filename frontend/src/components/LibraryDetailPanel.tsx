import { useState } from "react";
import { Archive, AlertTriangle, ExternalLink, FileText, FolderOpen, ListFilter, RefreshCw, RotateCcw, ShieldCheck, X, Download, Trash2, ChevronDown, HardDrive } from "lucide-react";
import type { LibraryItem } from "../types";
import { formatBytes, formatTime, libraryDisplayName } from "../utils";
import { canDownloadLibrary, isLibraryActive } from "../libraryUtils";
import { Info, ProgressBar, StatusBadge } from "./Common";
import { LibraryCover } from "./LibraryCover";
import { Skeleton } from "./Skeleton";

export function LibraryDetailPanel({
  item, files, problemFileCount, showOnlyProblemFiles, noImageMode, loading,
  detailLoading, detailError, onClose, onVerify, onZip, onRetryFailed,
  onRefreshDetail, setShowOnlyProblemFiles, onDownload, onDelete, onSetTaken, onCleanup, onRedownload,
}: {
  item: LibraryItem | null;
  files: LibraryItem["files"];
  problemFileCount: number;
  showOnlyProblemFiles: boolean;
  noImageMode: boolean;
  loading: boolean;
  detailLoading: boolean;
  detailError: string;
  onClose: () => void;
  onVerify: (item: LibraryItem) => Promise<void>;
  onZip: (item: LibraryItem) => Promise<void>;
  onRetryFailed: (item: LibraryItem) => Promise<void>;
  onRefreshDetail: () => void;
  setShowOnlyProblemFiles: (v: boolean) => void;
  onDownload: (item: LibraryItem) => void;
  onDelete: (item: LibraryItem) => void;
  onSetTaken: (item: LibraryItem, taken: boolean) => void;
  onCleanup: (item: LibraryItem) => void;
  onRedownload: (item: LibraryItem) => void;
}) {
  const [titleExpanded, setTitleExpanded] = useState(false);
  const active = !!item && isLibraryActive(item);
  const busy = loading || detailLoading || !!detailError;
  const archived = item?.status === "archived";
  return <aside className="panel queue-inspector collection-inspector" aria-label="资料库详情" aria-busy={detailLoading}>
    <div className="overview-panel-heading"><div><span className="overview-eyebrow">服务器资料库</span><h3>资料库详情</h3></div><button className="icon-button" onClick={onClose} title="关闭详情" aria-label="关闭详情"><X size={17} /></button></div>
    <div className="queue-inspector-body">
      {detailError && <div className="collection-detail-error" role="alert"><AlertTriangle size={17} /><div><strong>无法读取作品详情</strong><p>{detailError}</p><button className="button secondary" onClick={onRefreshDetail} disabled={detailLoading}><RefreshCw size={14} />重新加载</button></div></div>}
      {!item ? detailLoading ? <div className="collection-detail-skeleton"><Skeleton width="100%" height="72px" /><Skeleton width="100%" height="90px" /><Skeleton width="100%" height="140px" /></div> : !detailError && <p className="detail-files-empty">选择作品以查看文件信息。</p> : <>
        <div className="collection-detail-summary"><LibraryCover url={item.cover_url} noImageMode={noImageMode} preview /><div><StatusBadge status={item.status} /><h3 className={titleExpanded ? "expanded" : ""} title={libraryDisplayName(item)}>{libraryDisplayName(item)}</h3>{libraryDisplayName(item).length > 80 && <button className="queue-title-toggle" aria-expanded={titleExpanded} onClick={() => setTitleExpanded(!titleExpanded)}>{titleExpanded ? "收起标题" : "展开完整标题"}</button>}<span>ID {item.manga_id}</span></div></div>
        <section className={`collection-completeness ${item.status === "completed" ? "complete" : ""}`} aria-label={archived ? "下载历史" : "文件完整度"}><div><span>{archived ? "保留的图片记录" : "文件完整度"}</span><strong>{archived ? `${item.total_files} 张` : item.total_files ? `${Math.min(100, Math.max(0, Math.round(item.completeness * 100)))}%` : "—"}</strong></div>{!archived && <ProgressBar value={item.completeness} />}<p>{archived ? "图片和 ZIP 已从服务器删除，仍可查看下载记录" : `${item.valid_files} / ${item.total_files} 个有效文件`}</p></section>
        {archived ? <div className="collection-active-note"><HardDrive size={15} /><span>已清理，下载记录和电脑保存标记已保留。需要文件时可以重新下载。服务器文件删除时间：{formatTime(item.files_removed_at)}</span></div> : active ? <div className="collection-active-note"><RefreshCw size={15} /><span>当前仍有未结束的下载任务，文件操作暂不可用。</span></div> : item.last_error && <div className="queue-detail-error"><AlertTriangle size={16} /><div><strong>需要处理</strong><p>{item.last_error}</p></div></div>}
        <div className="collection-detail-metadata"><Info label={archived ? "历史图片" : "缺失文件"} value={`${archived ? item.total_files : item.missing_files} 个`} /><Info label={archived ? "服务器文件" : "失败文件"} value={archived ? "已删除" : `${item.failed_files} 个`} /><Info label="ZIP 状态" value={item.zip_exists ? "已打包" : "未打包"} /><Info label="ZIP 大小" value={item.zip_exists ? formatBytes(item.zip_size) : "—"} /></div>
        <section className="collection-receipt-panel" aria-label="下载到电脑的记录"><h4>{item.taken_at ? "已下载" : "未下载"}</h4><p>{item.taken_at ? `下载记录 · ${formatTime(item.taken_at)}` : "下载完成后自动记录；以前下载过的可手动补记。"}</p><button className="button secondary" disabled={busy} onClick={() => onSetTaken(item, !item.taken_at)}>{item.taken_at ? <RotateCcw size={14} /> : <Download size={14} />}{item.taken_at ? "标为未下载" : "标为已下载"}</button><button className="button secondary" disabled={busy || active || archived} onClick={() => onCleanup(item)}><HardDrive size={14} />清理文件</button></section>
        <section className="collection-maintenance" aria-label="文件维护"><h4>文件维护</h4><div><button className="button secondary" disabled={busy || active || archived} onClick={() => void onVerify(item)}><ShieldCheck size={14} />重新校验</button>{!archived && problemFileCount > 0 && <button className="button secondary" disabled={busy || active} onClick={() => void onRetryFailed(item)}><RotateCcw size={14} />重试问题文件</button>}<button className="button secondary" disabled={busy || active || archived || item.total_files === 0} onClick={() => void onZip(item)}><Archive size={14} />{item.zip_exists ? "重新打包" : "生成 ZIP"}</button></div></section>
        <details className="collection-path"><summary><FolderOpen size={14} /><span>服务器文件位置与时间</span><ChevronDown size={14} /></summary><dl><dt>图片目录</dt><dd>{item.download_dir || "尚未生成目录"}</dd><dt>ZIP 路径</dt><dd>{item.zip_path || "尚未生成 ZIP"}</dd><dt>最近更新</dt><dd>{formatTime(item.updated_at)}</dd></dl></details>
        <section className="collection-files" aria-label="文件列表" aria-busy={detailLoading}>
          <div className="collection-files-header"><h4>文件明细<span>{detailLoading ? "读取中…" : `${files?.length ?? 0} / ${item.files?.length ?? 0}`}</span></h4><button className="icon-button" onClick={onRefreshDetail} disabled={detailLoading || loading} title="刷新文件列表" aria-label="刷新文件列表"><RefreshCw size={14} className={detailLoading ? "spin" : ""} /></button></div>
          <label className="collection-problem-filter"><input type="checkbox" checked={showOnlyProblemFiles} disabled={detailLoading} onChange={(event) => setShowOnlyProblemFiles(event.target.checked)} /><ListFilter size={13} />只看问题文件<span>{problemFileCount}</span></label>
          {detailLoading ? <div className="collection-detail-skeleton"><Skeleton width="100%" height="56px" /><Skeleton width="100%" height="56px" /></div> : <ul className="detail-file-list">{files?.map((file) => {
            const error = archived ? "" : file.error_message || (!file.exists ? "文件不存在" : "");
            return <li className="detail-file-item" key={`${item.manga_id}-${file.pic_index}`}><div className="detail-file-topline"><span className="detail-file-index mono">{file.pic_index}</span><strong className="detail-file-name"><FileText size={14} /><span>{file.file_name || `图片 ${file.pic_index}`}</span></strong><StatusBadge status={archived ? "archived" : file.status} /></div><div className="detail-file-meta"><span>{formatBytes(file.file_size)}</span><span>{formatTime(file.updated_at)}</span></div>{error && <p className="detail-file-error"><AlertTriangle size={13} /><span>{error}</span></p>}<details className="detail-file-path"><summary>查看文件路径</summary><span>{file.file_path || "尚未生成文件路径"}</span></details></li>;
          })}</ul>}
          {!detailLoading && !files?.length && <p className="detail-files-empty" role="status">{detailError ? "暂时无法获取文件明细" : showOnlyProblemFiles ? "当前没有问题文件" : "暂无文件明细"}</p>}
        </section>
      </>}
    </div>
    {item && <div className="queue-inspector-footer"><div className="queue-detail-actions"><button className="button primary" onClick={() => archived ? onRedownload(item) : onDownload(item)} disabled={busy || (!archived && !canDownloadLibrary(item))} title={archived ? "从原站重新下载" : !canDownloadLibrary(item) ? "请先完成任务并补全有效文件" : "把这部作品的 ZIP 下载到电脑"}><Download size={15} />{archived ? "重新下载" : "下载到电脑"}</button><button className="button secondary danger-button" onClick={() => onDelete(item)} disabled={busy || active}><Trash2 size={15} />删除资料</button></div><a className="queue-original-link" href={`https://www.wnacg.com/photos-index-aid-${item.manga_id}.html`} target="_blank" rel="noreferrer">打开原始页面<ExternalLink size={13} /></a></div>}
  </aside>;
}
