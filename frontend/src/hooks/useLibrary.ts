import { useCallback, useEffect, useMemo, useState } from "react";
import type { LibraryItem, LibrarySortKey, LibraryViewMode } from "../types";
import { fetchLibrary, fetchLibraryDetail, verifyLibraryApi, zipLibraryApi, retryFailedLibraryApi } from "../api";
import { isProblemFile } from "../utils";

export function useLibrary() {
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [selectedLibraryItem, setSelectedLibraryItem] = useState<LibraryItem | null>(null);
  const [libraryDetailLoading, setLibraryDetailLoading] = useState(false);
  const [showOnlyProblemFiles, setShowOnlyProblemFiles] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [sortBy, setSortBy] = useState<LibrarySortKey>("updated_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [viewMode, setViewMode] = useState<LibraryViewMode>(() => {
    try {
      return (localStorage.getItem("wnacg-library-view") as LibraryViewMode) || "card";
    } catch {
      return "card";
    }
  });

  const setViewModePersist = useCallback((v: LibraryViewMode) => {
    setViewMode(v);
    try { localStorage.setItem("wnacg-library-view", v); } catch { /* ignore */ }
  }, []);

  const refresh = useCallback(async () => {
    const data = await fetchLibrary({ sort_by: sortBy, sort_order: sortOrder });
    setLibraryItems(data.items);
    setInitialLoading(false);
  }, [sortBy, sortOrder]);

  const loadDetail = useCallback(async (mangaId: string) => {
    setLibraryDetailLoading(true);
    try {
      const data = await fetchLibraryDetail(mangaId);
      setSelectedLibraryItem(data);
    } finally {
      setLibraryDetailLoading(false);
    }
  }, []);

  const openDetail = useCallback(async (item: LibraryItem) => {
    setSelectedLibraryId(item.manga_id);
    await loadDetail(item.manga_id);
  }, [loadDetail]);

  const closeDetail = useCallback(() => {
    setSelectedLibraryId(null);
    setSelectedLibraryItem(null);
  }, []);

  const verifyItem = useCallback(async (item: LibraryItem) => {
    const result = await verifyLibraryApi(item.manga_id);
    setSelectedLibraryId(item.manga_id);
    setSelectedLibraryItem(result);
    return result;
  }, []);

  const zipItem = useCallback(async (item: LibraryItem) => {
    const result = await zipLibraryApi(item.manga_id);
    setSelectedLibraryId(item.manga_id);
    setSelectedLibraryItem(result);
    return result;
  }, []);

  const retryFailed = useCallback(async (item: LibraryItem) => {
    const result = await retryFailedLibraryApi(item.manga_id);
    setSelectedLibraryId(item.manga_id);
    setSelectedLibraryItem(result.library);
    return result;
  }, []);

  const selectedLibraryFiles = useMemo(() => {
    const files = selectedLibraryItem?.files ?? [];
    return showOnlyProblemFiles ? files.filter(isProblemFile) : files;
  }, [selectedLibraryItem, showOnlyProblemFiles]);

  const selectedProblemFileCount = useMemo(
    () => (selectedLibraryItem?.files ?? []).filter(isProblemFile).length,
    [selectedLibraryItem]
  );

  const libraryCounts = useMemo(() => ({
    all: libraryItems.length,
    completed: libraryItems.filter((i) => i.status === "completed").length,
    partial: libraryItems.filter((i) => i.status === "partial").length,
    failed: libraryItems.filter((i) => i.status === "failed").length,
    missing: libraryItems.filter((i) => i.status === "missing" || i.missing_files > 0 || i.failed_files > 0).length,
    zipped: libraryItems.filter((i) => i.zip_exists).length,
    unzipped: libraryItems.filter((i) => !i.zip_exists).length,
  }), [libraryItems]);

  useEffect(() => {
    if (libraryItems.length === 0) {
      setSelectedLibraryId(null);
      setSelectedLibraryItem(null);
      return;
    }
    if (!selectedLibraryId || !libraryItems.some((i) => i.manga_id === selectedLibraryId)) {
      setSelectedLibraryId(libraryItems[0].manga_id);
    }
  }, [libraryItems, selectedLibraryId]);

  useEffect(() => {
    if (selectedLibraryId) void loadDetail(selectedLibraryId);
  }, [selectedLibraryId, loadDetail]);

  // Re-fetch when sort changes
  useEffect(() => {
    void refresh();
  }, [sortBy, sortOrder, refresh]);

  return {
    libraryItems,
    selectedLibraryId,
    selectedLibraryItem,
    selectedLibraryFiles,
    selectedProblemFileCount,
    libraryDetailLoading,
    showOnlyProblemFiles,
    setShowOnlyProblemFiles,
    libraryCounts,
    initialLoading,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    viewMode,
    setViewMode: setViewModePersist,
    refresh,
    loadDetail,
    openDetail,
    closeDetail,
    verifyItem,
    zipItem,
    retryFailed,
  };
}
