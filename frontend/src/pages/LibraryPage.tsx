import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Activity, AlertTriangle, ArrowRight, BookOpen, CheckCircle2, HardDrive, Plus, RefreshCw } from "lucide-react";
import type { LibraryItem, LibraryFilter, LibrarySortKey, LibraryViewMode, LibraryDownloadResult, LibraryDownloadProgress, WsStatus } from "../types";
import { LibraryContent } from "../components/LibraryContent";
import { LibraryDetailPanel } from "../components/LibraryDetailPanel";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { batchCreateTasks, cleanupLibraryFilesApi, prepareLibraryDownloadsApi, setLibraryTakenApi } from "../api";
import { LibraryDownloads, startLibraryDownloads } from "../components/LibraryDownloads";
import { useToast } from "../components/Toast";
import { Skeleton } from "../components/Skeleton";
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
  const [downloadProgress, setDownloadProgress] = useState<LibraryDownloadProgress | null>(null);
  const [operationBusy, setOperationBusy] = useState(false);
  const [cleanupItems, setCleanupItems] = useState<LibraryItem[]>([]);
  const [redownloadItem, setRedownloadItem] = useState<LibraryItem | null>(null);
  const { showToast } = useToast();
  const busy = loading || downloadBusy || operationBusy;

  useEffect(() => { setCheckedIds(new Set()); }, [searchQuery, libraryFilter, zipFilter]);

  const filteredItems = useMemo(() => {
    const byFilter = libraryItems.filter((item) => {
      if (zipFilter === "zipped" && !item.zip_exists) return false;
      if (zipFilter === "unzipped" && item.zip_exists) return false;
      if (libraryFilter === "active") return isLibraryActive(item);
      if (libraryFilter === "taken") return !!item.taken_at;
      if (libraryFilter === "not_taken") return !item.taken_at;
      if (libraryFilter === "archived") return item.status === "archived";
      if (libraryFilter === "attention") return libraryNeedsAttention(item);
      if (libraryFilter === "completed") return item.status === "completed";
      if (libraryFilter === "partial") return item.status !== "archived" && (item.status === "partial" || item.missing_files > 0);
      if (libraryFilter === "failed") return item.status !== "archived" && (item.status === "failed" || item.failed_files > 0);
      if (libraryFilter === "missing") return item.status !== "archived" && (item.status === "missing" || item.missing_files > 0 || item.failed_files > 0);
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
    const result: LibraryDownloadResult = { ready: [], failed: [] };
    setDownloadResult(result);
    try {
      for (const [index, item] of items.entries()) {
        setDownloadProgress({ current: index + 1, total: items.length, title: item.title || item.manga_id });
        try {
          const prepared = await prepareLibraryDownloadsApi([item.manga_id]);
          await startLibraryDownloads(prepared.ready);
          result.ready.push(...prepared.ready);
          result.failed.push(...prepared.failed);
        } catch (error) {
          result.failed.push({ manga_id: item.manga_id, error: error instanceof Error ? error.message : "准备下载失败，请重试" });
        }
        setDownloadResult({ ready: [...result.ready], failed: [...result.failed] });
      }
      await onRefresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "准备下载失败，请重试", "error");
    } finally {
      setDownloadProgress(null);
      setDownloadBusy(false);
    }
  }

  async function retryDownloads() {
    if (!downloadResult || busy) return;
    setDownloadBusy(true);
    try { await startLibraryDownloads(downloadResult.ready); }
    finally { setDownloadBusy(false); }
  }

  async function setTaken(ids: string[], taken: boolean) {
    if (!ids.length || busy) return;
    setOperationBusy(true);
    try {
      const result = await setLibraryTakenApi(ids, taken);
      await onRefresh();
      onRefreshDetail();
      setCheckedIds(new Set());
      showToast(`${result.updated.length} 项已标记为${taken ? "已下载" : "未下载"}${result.failed.length ? `，${result.failed.length} 项未更新` : ""}`, result.failed.length ? "warning" : "success");
    } catch (error) { showToast(error instanceof Error ? error.message : "更新电脑保存标记失败", "error"); }
    finally { setOperationBusy(false); }
  }

  async function cleanupFiles() {
    if (!cleanupItems.length || busy) return;
    setOperationBusy(true);
    try {
      const result = await cleanupLibraryFilesApi(cleanupItems.map((item) => item.manga_id));
      await onRefresh();
      onRefreshDetail();
      setCleanupItems([]);
      setCheckedIds(new Set());
      showToast(`已删除 ${result.cleaned.length} 部作品的服务器文件，下载记录已保留${result.failed.length ? `；${result.failed.map((item) => `ID ${item.manga_id}：${item.error}`).join("；")}` : ""}`, result.failed.length ? "warning" : "success", result.failed.length ? 8000 : 3500);
    } catch (error) { showToast(error instanceof Error ? error.message : "删除服务器文件失败", "error"); }
    finally { setOperationBusy(false); }
  }

  async function redownload() {
    if (!redownloadItem || busy) return;
    setOperationBusy(true);
    try {
      await batchCreateTasks([{ manga_id: redownloadItem.manga_id }]);
      await onRefresh();
      onRefreshDetail();
      setRedownloadItem(null);
      showToast("已加入重新下载队列，原有电脑保存标记已保留", "success");
    } catch (error) { showToast(error instanceof Error ? error.message : "创建下载任务失败", "error"); }
    finally { setOperationBusy(false); }
  }

  const attentionCount = libraryItems.filter(libraryNeedsAttention).length;
  const activeCount = libraryItems.filter(isLibraryActive).length;
  const validFiles = libraryItems.reduce((total, item) => total + item.valid_files, 0);
  const takenIds = new Set(libraryItems.filter((item) => item.taken_at).map((item) => item.manga_id));
  const notTakenCount = libraryItems.length - takenIds.size;
  const metrics = [
    { key: "all", label: "资料库作品", count: libraryCounts.all, detail: `${validFiles.toLocaleString("zh-CN")} 个有效图片文件`, Icon: BookOpen, tone: "blue" },
    { key: "completed", label: "服务器已有", count: libraryCounts.completed, detail: "图片已完整下载到服务器", Icon: CheckCircle2, tone: "green" },
    { key: "attention", label: "需要关注", count: attentionCount, detail: "失败、缺失或尚未完整的作品", Icon: AlertTriangle, tone: attentionCount ? "orange" : "neutral" },
    { key: "not_taken", label: "未下载", count: notTakenCount, detail: `已下载 ${takenIds.size} 部 · 指下载到电脑`, Icon: HardDrive, tone: "blue" },
  ] as const;
  const tabs = [
    { key: "all", label: "全部", count: libraryItems.length },
    { key: "not_taken", label: "未下载", count: notTakenCount },
    { key: "taken", label: "已下载", count: takenIds.size },
    { key: "completed", label: "完整", count: libraryCounts.completed },
    { key: "attention", label: "需处理", count: attentionCount },
    { key: "active", label: "进行中", count: activeCount },
  ] as const;
  const visibleDetailId = filteredItems.some((item) => item.manga_id === selectedLibraryId) ? selectedLibraryId : null;
  const detailItem = selectedLibraryItem?.manga_id === visibleDetailId ? selectedLibraryItem : null;
  const hasDetail = !!visibleDetailId;
  function closeDetail() { setDetailOpen(false); onCloseDetail(); }
  function chooseFilter(filter: LibraryFilter) { setDetailOpen(false); setLibraryFilter(filter); }
  const inspector = <LibraryDetailPanel key={visibleDetailId} item={detailItem} files={detailItem ? selectedLibraryFiles : []} problemFileCount={detailItem ? selectedProblemFileCount : 0} showOnlyProblemFiles={showOnlyProblemFiles} noImageMode={noImageMode} loading={busy} detailLoading={libraryDetailLoading} detailError={libraryDetailError} onClose={closeDetail} onVerify={onVerify} onZip={onZip} onRetryFailed={onRetryFailed} onRefreshDetail={onRefreshDetail} setShowOnlyProblemFiles={setShowOnlyProblemFiles} onDownload={(item) => { if (compact) closeDetail(); void download([item]); }} onDelete={(item) => { if (compact) closeDetail(); requestDelete([item]); }} onSetTaken={(item, taken) => void setTaken([item.manga_id], taken)} onCleanup={(item) => setCleanupItems([item])} onRedownload={setRedownloadItem} />;
  return (
    <div className="collection-workbench" aria-busy={initialLoading}>
      <header className="overview-heading"><div><div className="overview-heading-topline"><h2>资料库</h2><span className={`overview-connection ${wsStatus === "connected" ? "live" : ""}`}><span />{wsStatus === "connected" ? "实时同步" : wsStatus === "connecting" ? "正在连接" : "定时刷新"}</span></div><p>查看服务器上的作品和下载记录，将文件保存到电脑。</p></div><div className="overview-heading-actions"><button className="button secondary overview-refresh" aria-label="刷新资料库" title="刷新资料库" disabled={busy} onClick={() => void onRefresh()}><RefreshCw size={16} className={loading ? "spin" : ""} /></button><button className="button primary" onClick={onAddTask}><Plus size={16} />添加下载</button></div></header>
      <section className="overview-metrics" aria-label="资料库统计">{metrics.map(({ key, label, count, detail, Icon, tone }) => {
        const selected = libraryFilter === key && zipFilter === "all";
        return <button key={key} className={`overview-metric ${tone} ${selected ? "collection-metric-selected" : ""}`} disabled={initialLoading} aria-label={`${label} ${initialLoading ? "加载中" : count}`} aria-pressed={selected} onClick={() => { chooseFilter(key); setZipFilter("all"); }}><div className="overview-metric-top"><span>{label}</span><Icon size={17} /></div>{initialLoading ? <Skeleton height="34px" width="52px" borderRadius="5px" /> : <strong>{count.toLocaleString("zh-CN")}</strong>}<div className="overview-metric-bottom"><span>{detail}</span><ArrowRight size={14} /></div></button>;
      })}</section>
      <p className="collection-history-hint">下载完成后自动记录；清理文件会保留下载历史。</p>
      {downloadResult && <LibraryDownloads result={downloadResult} progress={downloadProgress} busy={busy} sending={downloadBusy} onRetryAll={() => void retryDownloads()} onClose={() => setDownloadResult(null)} />}
      <div className={`collection-workspace ${hasDetail && !compact ? "has-detail" : ""}`}>
        <LibraryContent items={filteredItems} selectedId={visibleDetailId} viewMode={viewMode} sortBy={sortBy} sortOrder={sortOrder} noImageMode={noImageMode} initialLoading={initialLoading} loading={busy} searching={!!normalizedSearch} hasFilters={libraryFilter !== "all" || zipFilter !== "all"} onResetFilters={() => { chooseFilter("all"); setZipFilter("all"); onClearSearch(); }} onAddTask={onAddTask}
          selection={{ checkedIds, checkedCount: checkedItems.length, onToggleItem: toggleItem, onToggleAll: () => setCheckedIds(checkedItems.length === filteredItems.length ? new Set() : new Set(filteredItems.map((item) => item.manga_id))), onClear: () => setCheckedIds(new Set()), onDownload: (item) => void download(item ? [item] : checkedItems), onDelete: (item) => requestDelete(item ? [item] : checkedItems), onSetTaken: (taken, item) => void setTaken((item ? [item] : checkedItems).map((entry) => entry.manga_id), taken), onCleanup: (item) => setCleanupItems(item ? [item] : checkedItems), downloadBusy }}
          onSelect={(item) => { setDetailOpen(true); void onOpenDetail(item); }} onSortChange={onSortChange} onToggleSortOrder={onToggleSortOrder} onViewModeChange={onViewModeChange}
          filters={<div className="collection-filters"><div className="overview-task-tabs collection-tabs" role="tablist" aria-label="资料库状态过滤" onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const index = Math.max(0, tabs.findIndex((tab) => tab.key === libraryFilter));
            const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
            chooseFilter(tabs[next].key); document.getElementById(`collection-tab-${tabs[next].key}`)?.focus();
          }}>{tabs.map((tab) => <button role="tab" id={`collection-tab-${tab.key}`} key={tab.key} aria-selected={libraryFilter === tab.key} aria-controls="library-results" tabIndex={libraryFilter === tab.key || (!tabs.some((candidate) => candidate.key === libraryFilter) && tab.key === "all") ? 0 : -1} className={libraryFilter === tab.key ? "active" : ""} onClick={() => chooseFilter(tab.key)}>{tab.key === "active" && <Activity size={12} />}{tab.label}<span>{initialLoading ? "—" : tab.count}</span></button>)}</div><div className="collection-extra-filters"><label><span className="sr-only">更多作品状态</span><select aria-label="更多作品状态" value={["partial", "failed", "missing", "archived"].includes(libraryFilter) ? libraryFilter : ""} onChange={(event) => chooseFilter(event.target.value as LibraryFilter)} disabled={busy}><option value="" disabled>更多状态</option><option value="partial">部分完成</option><option value="failed">失败作品</option><option value="missing">文件异常</option><option value="archived">已清理</option></select></label><label><span className="sr-only">打包状态</span><select aria-label="打包状态" value={zipFilter} onChange={(event) => setZipFilter(event.target.value)} disabled={busy}><option value="all">全部打包状态</option><option value="zipped">已打包</option><option value="unzipped">未打包</option></select></label></div></div>}
        />
        {hasDetail && !compact && inspector}
      </div>
      {hasDetail && compact && detailOpen && <LibraryDialog onClose={closeDetail}>{inspector}</LibraryDialog>}
      <ConfirmDialog open={deleteItems.length > 0} title={`删除 ${deleteItems.length} 项资料`} message="删除资料库记录及关联的已结束任务记录。默认保留本地文件；有活跃任务的作品会跳过。" variant="danger" confirmLabel={deleteFiles ? "删除记录和文件" : "仅删除记录"} loading={loading} onConfirm={() => void confirmDelete()} onCancel={() => setDeleteItems([])}>
        <label className="delete-files-option"><input type="checkbox" checked={deleteFiles} disabled={loading} onChange={(event) => setDeleteFiles(event.target.checked)} />同时删除本地图片、原图和 ZIP 文件（不可恢复）</label>
      </ConfirmDialog>
      <ConfirmDialog open={cleanupItems.length > 0} title={`删除 ${cleanupItems.length} 部作品的服务器文件`} message={`删除服务器上的图片、原图和 ZIP，释放服务器空间。资料库仍会保留作品名称、下载记录和电脑保存标记。文件删除后不能恢复，需要时可从原站重新下载。${cleanupItems.some((item) => !item.taken_at) ? "部分作品尚未标记“已下载”，请先确认电脑上的文件已下载完整。" : "请确认电脑上的文件已保存完整。"}仍有活跃任务的作品会跳过。`} variant="danger" confirmLabel="删除文件，保留记录" loading={operationBusy} onConfirm={() => void cleanupFiles()} onCancel={() => setCleanupItems([])} />
      <ConfirmDialog open={!!redownloadItem} title="重新下载" message="将访问原站并把图片和 ZIP 写入服务器下载目录，保留原有资料和电脑保存标记。" confirmLabel="重新下载" loading={operationBusy} onConfirm={() => void redownload()} onCancel={() => setRedownloadItem(null)} />
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
