import { useMemo, useState } from "react";
import type { LibraryItem, LibraryFilter, LibrarySortKey, LibraryViewMode } from "../types";
import { LibrarySidebar } from "../components/LibrarySidebar";
import { LibraryContent } from "../components/LibraryContent";
import { LibraryDetailPanel } from "../components/LibraryDetailPanel";

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
  sortBy,
  sortOrder,
  viewMode,
  onOpenDetail,
  onCloseDetail,
  onVerify,
  onZip,
  onRetryFailed,
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
  onRefresh: () => Promise<void>;
  onRefreshDetail: () => void;
  setShowOnlyProblemFiles: (v: boolean) => void;
  onSortChange: (key: LibrarySortKey) => void;
  onToggleSortOrder: () => void;
  onViewModeChange: (mode: LibraryViewMode) => void;
}) {
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>("all");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filteredItems = useMemo(() => {
    const byFilter = libraryItems.filter((item) => {
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
  }, [libraryFilter, libraryItems, normalizedSearch]);

  return (
    <div className={`library-layout ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <LibrarySidebar
        activeFilter={libraryFilter}
        counts={libraryCounts}
        collapsed={sidebarCollapsed}
        onFilterChange={setLibraryFilter}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
      />
      <LibraryContent
        items={filteredItems}
        selectedId={selectedLibraryId}
        viewMode={viewMode}
        sortBy={sortBy}
        sortOrder={sortOrder}
        noImageMode={noImageMode}
        initialLoading={initialLoading}
        loading={loading}
        onSelect={(item) => void onOpenDetail(item)}
        onSortChange={onSortChange}
        onToggleSortOrder={onToggleSortOrder}
        onViewModeChange={onViewModeChange}
        onRefresh={onRefresh}
        onVerify={onVerify}
        onZip={onZip}
      />
      {selectedLibraryItem && (
        <LibraryDetailPanel
          item={selectedLibraryItem}
          files={selectedLibraryFiles}
          problemFileCount={selectedProblemFileCount}
          showOnlyProblemFiles={showOnlyProblemFiles}
          noImageMode={noImageMode}
          loading={loading}
          detailLoading={libraryDetailLoading}
          onClose={onCloseDetail}
          onVerify={onVerify}
          onZip={onZip}
          onRetryFailed={onRetryFailed}
          onRefreshDetail={onRefreshDetail}
          setShowOnlyProblemFiles={setShowOnlyProblemFiles}
        />
      )}
    </div>
  );
}
