import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Activity, AlertTriangle, Archive, ArrowRight, BookOpen, CheckCircle2, Plus, RefreshCw } from "lucide-react";
import type { LibraryItem, LibraryFilter, LibrarySortKey, LibraryViewMode, LibraryDownloadResult, WsStatus } from "../types";
import { LibraryContent } from "../components/LibraryContent";
import { LibraryDetailPanel } from "../components/LibraryDetailPanel";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { prepareLibraryDownloadsApi } from "../api";
import { LibraryDownloads, startLibraryDownloads } from "../components/LibraryDownloads";
import { useToast } from "../components/Toast";
import { Skeleton } from "../components/Skeleton";
import { formatBytes } from "../utils";
import { isLibraryActive, libraryNeedsAttention } from "../libraryUtils";

export function LibraryPage({
  libraryItems,
  selectedLibraryId,
  selectedLibraryItem,
  selectedLibraryFiles,
  selectedProblemFileCount,
  libraryCounts,
  libraryDetailLoading,
  libraryDetailError,
  wsStatus,
  onAddTask,
  onClearSearch,
  openSelectedDetail,
  showOnlyProblemFiles,
  noImageMode,
  searchQuery,
  loading,
  initialLoading,
  sortBy,
  sortOrder,
  viewMode,
  onOpenDetail,
  onCloseDetail,
  onVerify,
  onZip,
  onRetryFailed,
  onDelete,
  onRefresh,
  onRefreshDetail,
  setShowOnlyProblemFiles,
  onSortChange,
  onToggleSortOrder,
  onViewModeChange,
}: {
  libraryItems: LibraryItem[];
  selectedLibraryId: string | null;
  selectedLibraryItem: LibraryItem | null;
  selectedLibraryFiles: LibraryItem["files"];
  selectedProblemFileCount: number;
  libraryCounts: Record<string, number>;
  libraryDetailLoading: boolean;
  libraryDetailError: string;
  wsStatus: WsStatus;
  onAddTask: () => void;
  onClearSearch: () => void;
  openSelectedDetail: boolean;
  showOnlyProblemFiles: boolean;
  noImageMode: boolean;
  searchQuery: string;
  loading: boolean;
  initialLoading: boolean;
  sortBy: LibrarySortKey;
  sortOrder: "asc" | "desc";
  viewMode: LibraryViewMode;
  onOpenDetail: (item: LibraryItem) => Promise<void>;
  onCloseDetail: () => void;
  onVerify: (item: LibraryItem) => Promise<void>;
  onZip: (item: LibraryItem) => Promise<void>;
  onRetryFailed: (item: LibraryItem) => Promise<void>;
  onDelete: (items: LibraryItem[], deleteFiles: boolean) => Promise<string[]>;
  onRefresh: () => Promise<void>;
  onRefreshDetail: () => void;
  setShowOnlyProblemFiles: (v: boolean) => void;
  onSortChange: (key: LibrarySortKey) => void;
  onToggleSortOrder: () => void;
  onViewModeChange: (mode: LibraryViewMode) => void;
}) {
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>("all");
  const [zipFilter, setZipFilter] = useState("all");
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width: 1180px)").matches);
  const [detailOpen, setDetailOpen] = useState(openSelectedDetail);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1180px)");
    const update = () => setCompact(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [deleteItems, setDeleteItems] = useState<LibraryItem[]>([]);
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadResult, setDownloadResult] = useState<LibraryDownloadResult | null>(null);
  const { showToast } = useToast();
  const busy = loading || downloadBusy;

  useEffect(() => { setCheckedIds(new Set()); }, [searchQuery, libraryFilter, zipFilter]);

  const filteredItems = useMemo(() => {
    const byFilter = libraryItems.filter((item) => {
      if (zipFilter === "zipped" && !item.zip_exists) return false;
      if (zipFilter === "unzipped" && item.zip_exists) return false;
      if (libraryFilter === "active") return isLibraryActive(item);
      if (libraryFilter === "attention") return libraryNeedsAttention(item);
      if (libraryFilter === "completed") return item.status === "completed";
      if (libraryFilter === "partial") return item.status === "partial" || item.missing_files > 0;
      if (libraryFilter === "failed") return item.status === "failed" || item.failed_files > 0;
      if (libraryFilter === "missing") return item.status === "missing" || item.missing_files > 0 || item.failed_files > 0;
      if (libraryFilter === "zipped") return item.zip_exists;
      if (libraryFilter === "unzipped") return !item.zip_exists;
      return true;
    });
    if (!normalizedSearch) return byFilter;
    return byFilter.filter((i) =>
      [i.manga_id, i.title, i.status, i.manga_status, i.last_error]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(normalizedSearch))
    );
  }, [libraryFilter, libraryItems, normalizedSearch, zipFilter]);

  const checkedItems = filteredItems.filter((item) => checkedIds.has(item.manga_id));

  function toggleItem(id: string) {
    setCheckedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function requestDelete(items: LibraryItem[]) {
    setDeleteFiles(false);
    setDeleteItems(items);
  }

  async function confirmDelete() {
    const deleted = await onDelete(deleteItems, deleteFiles);
    setCheckedIds((current) => new Set([...current].filter((id) => !deleted.includes(id))));
    if (deleted.length) setDownloadResult(null);
    setDeleteItems([]);
  }

  async function download(items: LibraryItem[]) {
    if (!items.length || busy) return;
    setDownloadBusy(true);
    setDownloadResult(null);
    try {
      const result = await prepareLibraryDownloadsApi(items.map((item) => item.manga_id));
      setDownloadResult(result);
      await startLibraryDownloads(result.ready);
      await onRefresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "准备下载失败，请重试", "error");
    } finally {
      setDownloadBusy(false);
    }
  }

  async function retryDownloads() {
    if (!downloadResult || busy) return;
    setDownloadBusy(true);
    try { await startLibraryDownloads(downloadResult.ready); }
    finally { setDownloadBusy(false); }
  }

  const attentionCount = libraryItems.filter(libraryNeedsAttention).length;
  const activeCount = libraryItems.filter(isLibraryActive).length;
  const validFiles = libraryItems.reduce((total, item) => total + item.valid_files, 0);
  const zipBytes = libraryItems.reduce((total, item) => total + (item.zip_exists ? item.zip_size : 0), 0);
  const metrics = [
    { key: "all", label: "本地作品", count: libraryCounts.all, detail: `${validFiles.toLocaleString("zh-CN")} 个有效图片文件`, Icon: BookOpen, tone: "blue" },
    { key: "completed", label: "完整作品", count: libraryCounts.completed, detail: "已完成下载与完整性检查", Icon: CheckCircle2, tone: "green" },
    { key: "attention", label: "需要关注", count: attentionCount, detail: "失败、缺失或尚未完整的作品", Icon: AlertTriangle, tone: attentionCount ? "orange" : "neutral" },
    { key: "zipped", label: "已打包", count: libraryCounts.zipped, detail: `本地 ZIP 共 ${formatBytes(zipBytes)}`, Icon: Archive, tone: "neutral" },
  ] as const;
  const tabs = [
    { key: "all", label: "全部", count: libraryItems.length },
    { key: "completed", label: "完整", count: libraryCounts.completed },
    { key: "attention", label: "需处理", count: attentionCount },
    { key: "active", label: "进行中", count: activeCount },
  ] as const;
  const visibleDetailId = filteredItems.some((item) => item.manga_id === selectedLibraryId) ? selectedLibraryId : null;
  const detailItem = selectedLibraryItem?.manga_id === visibleDetailId ? selectedLibraryItem : null;
  const hasDetail = !!visibleDetailId;
  function closeDetail() { setDetailOpen(false); onCloseDetail(); }
  function chooseFilter(filter: LibraryFilter) { setDetailOpen(false); setLibraryFilter(filter); }
  const inspector = <LibraryDetailPanel key={visibleDetailId} item={detailItem} files={detailItem ? selectedLibraryFiles : []} problemFileCount={detailItem ? selectedProblemFileCount : 0} showOnlyProblemFiles={showOnlyProblemFiles} noImageMode={noImageMode} loading={busy} detailLoading={libraryDetailLoading} detailError={libraryDetailError} onClose={closeDetail} onVerify={onVerify} onZip={onZip} onRetryFailed={onRetryFailed} onRefreshDetail={onRefreshDetail} setShowOnlyProblemFiles={setShowOnlyProblemFiles} onDownload={(item) => { if (compact) closeDetail(); void download([item]); }} onDelete={(item) => { if (compact) closeDetail(); requestDelete([item]); }} />;
  return (
    <div className="collection-workbench" aria-busy={initialLoading}>
      <header className="overview-heading"><div><div className="overview-heading-topline"><h2>资料库</h2><span className={`overview-connection ${wsStatus === "connected" ? "live" : ""}`}><span />{wsStatus === "connected" ? "实时同步" : wsStatus === "connecting" ? "正在连接" : "定时刷新"}</span></div><p>查看本地作品，检查文件完整度，批量下载或整理资料。</p></div><div className="overview-heading-actions"><button className="button secondary overview-refresh" aria-label="刷新资料库" title="刷新资料库" disabled={busy} onClick={() => void onRefresh()}><RefreshCw size={16} className={loading ? "spin" : ""} /></button><button className="button primary" onClick={onAddTask}><Plus size={16} />添加下载</button></div></header>
      <section className="overview-metrics" aria-label="资料库统计">{metrics.map(({ key, label, count, detail, Icon, tone }) => {
        const selected = key === "zipped" ? zipFilter === "zipped" : libraryFilter === key && zipFilter === "all";
        return <button key={key} className={`overview-metric ${tone} ${selected ? "collection-metric-selected" : ""}`} disabled={initialLoading} aria-label={`${label} ${initialLoading ? "加载中" : count}`} aria-pressed={selected} onClick={() => { chooseFilter(key === "zipped" ? "all" : key); setZipFilter(key === "zipped" ? "zipped" : "all"); }}><div className="overview-metric-top"><span>{label}</span><Icon size={17} /></div>{initialLoading ? <Skeleton height="34px" width="52px" borderRadius="5px" /> : <strong>{count.toLocaleString("zh-CN")}</strong>}<div className="overview-metric-bottom"><span>{detail}</span><ArrowRight size={14} /></div></button>;
      })}</section>
      {downloadResult && <LibraryDownloads result={downloadResult} busy={busy} sending={downloadBusy} onRetryAll={() => void retryDownloads()} onClose={() => setDownloadResult(null)} />}
      <div className={`collection-workspace ${hasDetail && !compact ? "has-detail" : ""}`}>
        <LibraryContent items={filteredItems} selectedId={visibleDetailId} viewMode={viewMode} sortBy={sortBy} sortOrder={sortOrder} noImageMode={noImageMode} initialLoading={initialLoading} loading={busy} searching={!!normalizedSearch} hasFilters={libraryFilter !== "all" || zipFilter !== "all"} onResetFilters={() => { chooseFilter("all"); setZipFilter("all"); onClearSearch(); }} onAddTask={onAddTask}
          selection={{ checkedIds, checkedCount: checkedItems.length, onToggleItem: toggleItem, onToggleAll: () => setCheckedIds(checkedItems.length === filteredItems.length ? new Set() : new Set(filteredItems.map((item) => item.manga_id))), onClear: () => setCheckedIds(new Set()), onDownload: (item) => void download(item ? [item] : checkedItems), onDelete: (item) => requestDelete(item ? [item] : checkedItems), downloadBusy }}
          onSelect={(item) => { setDetailOpen(true); void onOpenDetail(item); }} onSortChange={onSortChange} onToggleSortOrder={onToggleSortOrder} onViewModeChange={onViewModeChange}
          filters={<div className="collection-filters"><div className="overview-task-tabs collection-tabs" role="tablist" aria-label="资料库状态过滤" onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const index = Math.max(0, tabs.findIndex((tab) => tab.key === libraryFilter));
            const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
            chooseFilter(tabs[next].key); document.getElementById(`collection-tab-${tabs[next].key}`)?.focus();
          }}>{tabs.map((tab) => <button role="tab" id={`collection-tab-${tab.key}`} key={tab.key} aria-selected={libraryFilter === tab.key} aria-controls="library-results" tabIndex={libraryFilter === tab.key || (!tabs.some((candidate) => candidate.key === libraryFilter) && tab.key === "all") ? 0 : -1} className={libraryFilter === tab.key ? "active" : ""} onClick={() => chooseFilter(tab.key)}>{tab.key === "active" && <Activity size={12} />}{tab.label}<span>{initialLoading ? "—" : tab.count}</span></button>)}</div><div className="collection-extra-filters"><label><span className="sr-only">更多作品状态</span><select aria-label="更多作品状态" value={["partial", "failed", "missing"].includes(libraryFilter) ? libraryFilter : ""} onChange={(event) => chooseFilter(event.target.value as LibraryFilter)} disabled={busy}><option value="" disabled>更多状态</option><option value="partial">部分完成</option><option value="failed">失败作品</option><option value="missing">文件异常</option></select></label><label><span className="sr-only">打包状态</span><select aria-label="打包状态" value={zipFilter} onChange={(event) => setZipFilter(event.target.value)} disabled={busy}><option value="all">全部打包状态</option><option value="zipped">已打包</option><option value="unzipped">未打包</option></select></label></div></div>}
        />
        {hasDetail && !compact && inspector}
      </div>
      {hasDetail && compact && detailOpen && <LibraryDialog onClose={closeDetail}>{inspector}</LibraryDialog>}
      <ConfirmDialog open={deleteItems.length > 0} title={`删除 ${deleteItems.length} 项资料`} message="删除资料库记录及关联的已结束任务记录。默认保留本地文件；有活跃任务的作品会跳过。" variant="danger" confirmLabel={deleteFiles ? "删除记录和文件" : "仅删除记录"} loading={loading} onConfirm={() => void confirmDelete()} onCancel={() => setDeleteItems([])}>
        <label className="delete-files-option"><input type="checkbox" checked={deleteFiles} disabled={loading} onChange={(event) => setDeleteFiles(event.target.checked)} />同时删除本地图片、原图和 ZIP 文件（不可恢复）</label>
      </ConfirmDialog>
    </div>
  );
}

function LibraryDialog({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} className="queue-inspector-dialog collection-dialog" aria-label="资料库详情" onCancel={onClose} onClose={onClose}>{children}</dialog>;
}
