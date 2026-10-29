import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LibraryItem, LibrarySortKey, LibraryViewMode } from "../types";
import { fetchLibrary, fetchLibraryDetail, verifyLibraryApi, zipLibraryApi, retryFailedLibraryApi } from "../api";
import { isProblemFile } from "../utils";
import { useWsLibraryUpdate } from "./useWebSocket";

export function useLibrary() {
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const listVersion = useRef(0);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [selectedLibraryItem, setSelectedLibraryItem] = useState<LibraryItem | null>(null);
  const [libraryDetailLoading, setLibraryDetailLoading] = useState(false);
  const [libraryDetailError, setLibraryDetailError] = useState("");
  const detailVersion = useRef(0);
  const [showOnlyProblemFiles, setShowOnlyProblemFiles] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [sortBy, setSortBy] = useState<LibrarySortKey>("updated_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [viewMode, setViewMode] = useState<LibraryViewMode>(() => {
    try {
      return localStorage.getItem("wnacg-library-view") === "list" ? "list" : "card";
    } catch {
      return "card";
    }
  });

  const setViewModePersist = useCallback((v: LibraryViewMode) => {
    setViewMode(v);
    try { localStorage.setItem("wnacg-library-view", v); } catch { /* ignore */ }
  }, []);

  const refresh = useCallback(async () => {
    const version = ++listVersion.current;
    const data = await fetchLibrary({ sort_by: sortBy, sort_order: sortOrder });
    if (version === listVersion.current) {
      setLibraryItems(data.items);
      setInitialLoading(false);
    }
  }, [sortBy, sortOrder]);

  const loadDetail = useCallback(async (mangaId: string) => {
    const version = ++detailVersion.current;
    setLibraryDetailLoading(true);
    setLibraryDetailError("");
    try {
      const data = await fetchLibraryDetail(mangaId);
      if (version === detailVersion.current) setSelectedLibraryItem(data);
    } catch (error) {
      if (version === detailVersion.current) {
        setLibraryDetailError(error instanceof Error ? error.message : "请稍后重试");
      }
      throw error;
    } finally {
      if (version === detailVersion.current) setLibraryDetailLoading(false);
    }
  }, []);

  const openDetail = useCallback(async (item: LibraryItem) => {
    setSelectedLibraryId(item.manga_id);
    setSelectedLibraryItem(null);
    setShowOnlyProblemFiles(false);
    await loadDetail(item.manga_id);
  }, [loadDetail]);

  const closeDetail = useCallback(() => {
    detailVersion.current++;
    setLibraryDetailLoading(false);
    setLibraryDetailError("");
    setSelectedLibraryId(null);
    setSelectedLibraryItem(null);
  }, []);

  const verifyItem = useCallback(async (item: LibraryItem) => {
    const version = detailVersion.current;
    const result = await verifyLibraryApi(item.manga_id);
    if (version === detailVersion.current) setSelectedLibraryItem(result);
    return result;
  }, []);

  const zipItem = useCallback(async (item: LibraryItem) => {
    const version = detailVersion.current;
    const result = await zipLibraryApi(item.manga_id);
    if (version === detailVersion.current) setSelectedLibraryItem(result);
    return result;
  }, []);

  const retryFailed = useCallback(async (item: LibraryItem) => {
    const version = detailVersion.current;
    const result = await retryFailedLibraryApi(item.manga_id);
    if (version === detailVersion.current) setSelectedLibraryItem(result.library);
    return result;
  }, []);

  useWsLibraryUpdate((mangaIds) => {
    void refresh().catch(() => {});
    if (selectedLibraryId && mangaIds.includes(selectedLibraryId)) {
      void loadDetail(selectedLibraryId).catch(() => {});
    }
  });

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
    missing: libraryItems.filter((i) => i.status !== "archived" && (i.status === "missing" || i.missing_files > 0 || i.failed_files > 0)).length,
    zipped: libraryItems.filter((i) => i.zip_exists).length,
    unzipped: libraryItems.filter((i) => !i.zip_exists).length,
  }), [libraryItems]);

  useEffect(() => {
    if (!initialLoading && selectedLibraryId && !libraryItems.some((item) => item.manga_id === selectedLibraryId)) {
      closeDetail();
    }
  }, [libraryItems, selectedLibraryId, initialLoading, closeDetail]);

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
    libraryDetailError,
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
