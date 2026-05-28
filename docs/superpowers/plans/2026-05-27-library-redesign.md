# 资料库页面重新设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the library page from a two-column download status viewer into a three-panel manga library management system with category sidebar, card/list views, sorting, and slide-out detail panel.

**Architecture:** Frontend-only refactor of LibraryPage into three components (LibrarySidebar, LibraryContent, LibraryDetailPanel) with a small backend extension to support sorting and zip-status filtering. All sorting/filtering happens in Python memory since the list is already materialized.

**Tech Stack:** React 18 + TypeScript + Vite (frontend), FastAPI + SQLAlchemy (backend), Lucide icons, CSS custom properties (Apple-style design system)

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `backend/app/api/library.py` | Add sort_by, sort_order, zip_status query params |
| Modify | `backend/app/services/library_service.py` | Add sorting + zip_status filtering logic |
| Modify | `frontend/src/types.ts` | Extend LibraryFilter, add LibrarySortKey type |
| Modify | `frontend/src/api.ts` | Add sort/filter params to fetchLibrary |
| Modify | `frontend/src/hooks/useLibrary.ts` | Add sort state, view mode, category state |
| Create | `frontend/src/components/LibrarySidebar.tsx` | Left category sidebar |
| Create | `frontend/src/components/LibraryContent.tsx` | Middle content area (card/list + toolbar) |
| Create | `frontend/src/components/LibraryDetailPanel.tsx` | Right slide-out detail panel |
| Rewrite | `frontend/src/pages/LibraryPage.tsx` | Three-column layout wiring |
| Modify | `frontend/src/styles.css` | New library layout styles |
| Modify | `frontend/src/main.tsx` | Adjust LibraryPage props |

---

## Task 1: Backend — Add sort/filter params to library API

**Files:**
- Modify: `backend/app/api/library.py:10-12`
- Modify: `backend/app/services/library_service.py:24-39`

- [ ] **Step 1: Update library_service.list() to accept new params**

In `backend/app/services/library_service.py`, change the `list` method signature and add sorting/filtering logic after the items loop:

```python
async def list(
    self,
    q: str | None = None,
    status: str | None = None,
    sort_by: str = "updated_at",
    sort_order: str = "desc",
    zip_status: str | None = None,
) -> dict:
    async with SessionLocal() as session:
        manga_repo = MangaRepository(session)
        file_repo = FileRepository(session)
        task_repo = TaskRepository(session)
        infos = await manga_repo.list_infos(q=q)
        items = []
        for info in infos:
            pic_pages = await manga_repo.list_pic_pages(info.id)
            files = await file_repo.list_for_manga(info.id)
            task = await task_repo.latest_for_manga(info.id)
            item = self._summary(info, pic_pages, files, task)
            if status and item["status"] != status:
                continue
            if zip_status == "zipped" and not item["zip_exists"]:
                continue
            if zip_status == "unzipped" and item["zip_exists"]:
                continue
            items.append(item)
        items = self._sort_items(items, sort_by, sort_order)
        return {"items": items, "total": len(items)}
```

- [ ] **Step 2: Add _sort_items helper method**

Add this method to the `LibraryService` class, right after the `list` method:

```python
_SORT_KEYS = {
    "updated_at": lambda i: i.get("updated_at") or "",
    "title": lambda i: (i.get("title") or "").lower(),
    "completeness": lambda i: i.get("completeness", 0),
    "pic_count": lambda i: i.get("pic_count", 0),
    "zip_size": lambda i: i.get("zip_size", 0),
}

def _sort_items(self, items: list[dict], sort_by: str, sort_order: str) -> list[dict]:
    key_fn = self._SORT_KEYS.get(sort_by, self._SORT_KEYS["updated_at"])
    reverse = sort_order == "desc"
    return sorted(items, key=key_fn, reverse=reverse)
```

- [ ] **Step 3: Update the API endpoint to accept new query params**

In `backend/app/api/library.py`, update the `list_library` endpoint:

```python
@router.get("", response_model=ApiResponse)
async def list_library(
    q: str | None = None,
    status: str | None = None,
    sort_by: str = "updated_at",
    sort_order: str = "desc",
    zip_status: str | None = None,
):
    return ApiResponse(data=await library_service.list(
        q=q, status=status, sort_by=sort_by, sort_order=sort_order, zip_status=zip_status,
    ))
```

- [ ] **Step 4: Verify backend still works**

Run: `cd /Users/qu/Documents/GitHub/wnacg-crawler && .venv/bin/python -c "from backend.app.services.library_service import library_service; print('import ok')"`

Expected: `import ok`

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/library.py backend/app/services/library_service.py
git commit -m "feat(library): add sort_by, sort_order, zip_status params to library API"
```

---

## Task 2: Frontend — Extend types and API

**Files:**
- Modify: `frontend/src/types.ts:120`
- Modify: `frontend/src/api.ts:32-34`

- [ ] **Step 1: Extend types in types.ts**

Replace the `LibraryFilter` type at line 120 with:

```typescript
export type LibraryFilter = "all" | "completed" | "partial" | "failed" | "missing" | "zipped" | "unzipped";
export type LibrarySortKey = "updated_at" | "title" | "completeness" | "pic_count" | "zip_size";
export type LibraryViewMode = "card" | "list";
```

- [ ] **Step 2: Update fetchLibrary in api.ts**

Replace the `fetchLibrary` function:

```typescript
export async function fetchLibrary(params?: {
  sort_by?: string;
  sort_order?: string;
  zip_status?: string;
}): Promise<LibraryList> {
  const searchParams = new URLSearchParams();
  if (params?.sort_by) searchParams.set("sort_by", params.sort_by);
  if (params?.sort_order) searchParams.set("sort_order", params.sort_order);
  if (params?.zip_status) searchParams.set("zip_status", params.zip_status);
  const qs = searchParams.toString();
  return api<LibraryList>(`/api/library${qs ? `?${qs}` : ""}`);
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/qu/Documents/GitHub/wnacg-crawler && npm run typecheck:extension 2>&1 | head -5 || npx tsc --noEmit -p frontend/tsconfig.json 2>&1 | head -10`

Expected: No errors (or only pre-existing errors unrelated to our changes)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types.ts frontend/src/api.ts
git commit -m "feat(library): extend types and API for sorting/filtering"
```

---

## Task 3: Frontend — Update useLibrary hook

**Files:**
- Modify: `frontend/src/hooks/useLibrary.ts`

- [ ] **Step 1: Add new state and update refresh to pass sort params**

Replace the entire `useLibrary.ts` content:

```typescript
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
    verifyItem,
    zipItem,
    retryFailed,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/qu/Documents/GitHub/wnacg-crawler && npx tsc --noEmit -p frontend/tsconfig.json 2>&1 | head -10`

Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useLibrary.ts
git commit -m "feat(library): add sort state, view mode, zip counts to useLibrary"
```

---

## Task 4: Frontend — Create LibrarySidebar component

**Files:**
- Create: `frontend/src/components/LibrarySidebar.tsx`

- [ ] **Step 1: Create LibrarySidebar.tsx**

```tsx
import { useMemo } from "react";
import {
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileWarning,
  Archive,
  PackageOpen,
  Tag,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import type { LibraryFilter } from "../types";

type CategoryItem = {
  key: LibraryFilter;
  label: string;
  icon: typeof BookOpen;
  group: "status" | "zip";
};

const categories: CategoryItem[] = [
  { key: "all", label: "全部", icon: BookOpen, group: "status" },
  { key: "completed", label: "完整", icon: CheckCircle2, group: "status" },
  { key: "partial", label: "缺失", icon: AlertTriangle, group: "status" },
  { key: "failed", label: "失败", icon: XCircle, group: "status" },
  { key: "missing", label: "文件异常", icon: FileWarning, group: "status" },
  { key: "zipped", label: "已打包", icon: Archive, group: "zip" },
  { key: "unzipped", label: "未打包", icon: PackageOpen, group: "zip" },
];

export function LibrarySidebar({
  activeFilter,
  counts,
  collapsed,
  onFilterChange,
  onToggleCollapse,
}: {
  activeFilter: LibraryFilter;
  counts: Record<string, number>;
  collapsed: boolean;
  onFilterChange: (f: LibraryFilter) => void;
  onToggleCollapse: () => void;
}) {
  const statusItems = useMemo(() => categories.filter((c) => c.group === "status"), []);
  const zipItems = useMemo(() => categories.filter((c) => c.group === "zip"), []);

  if (collapsed) {
    return (
      <aside className="library-sidebar collapsed">
        <button className="sidebar-toggle" onClick={onToggleCollapse} title="展开侧栏">
          <PanelLeftOpen size={16} />
        </button>
        {categories.map((cat) => {
          const Icon = cat.icon;
          return (
            <button
              key={cat.key}
              className={`sidebar-icon-btn ${activeFilter === cat.key ? "active" : ""}`}
              onClick={() => onFilterChange(cat.key)}
              title={cat.label}
            >
              <Icon size={16} />
            </button>
          );
        })}
      </aside>
    );
  }

  return (
    <aside className="library-sidebar">
      <div className="sidebar-header">
        <span className="eyebrow">资料库</span>
        <button className="sidebar-toggle" onClick={onToggleCollapse} title="折叠侧栏">
          <PanelLeftClose size={16} />
        </button>
      </div>

      <div className="sidebar-group">
        <span className="sidebar-group-label">快速筛选</span>
        {statusItems.map((cat) => {
          const Icon = cat.icon;
          return (
            <button
              key={cat.key}
              className={`sidebar-item ${activeFilter === cat.key ? "active" : ""}`}
              onClick={() => onFilterChange(cat.key)}
            >
              <Icon size={15} />
              <span>{cat.label}</span>
              <span className="sidebar-count">{counts[cat.key] ?? 0}</span>
            </button>
          );
        })}
      </div>

      <div className="sidebar-group">
        <span className="sidebar-group-label">打包状态</span>
        {zipItems.map((cat) => {
          const Icon = cat.icon;
          return (
            <button
              key={cat.key}
              className={`sidebar-item ${activeFilter === cat.key ? "active" : ""}`}
              onClick={() => onFilterChange(cat.key)}
            >
              <Icon size={15} />
              <span>{cat.label}</span>
              <span className="sidebar-count">{counts[cat.key] ?? 0}</span>
            </button>
          );
        })}
      </div>

      <div className="sidebar-group">
        <span className="sidebar-group-label">标签</span>
        <div className="sidebar-empty-hint">
          <Tag size={14} />
          <span>暂无标签</span>
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/qu/Documents/GitHub/wnacg-crawler && npx tsc --noEmit -p frontend/tsconfig.json 2>&1 | head -10`

Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/LibrarySidebar.tsx
git commit -m "feat(library): add LibrarySidebar component with category navigation"
```

---

## Task 5: Frontend — Create LibraryContent component

**Files:**
- Create: `frontend/src/components/LibraryContent.tsx`

- [ ] **Step 1: Create LibraryContent.tsx**

```tsx
import { useMemo } from "react";
import {
  ArrowUpDown,
  BookOpen,
  Eye,
  HardDrive,
  LayoutGrid,
  List,
  RefreshCw,
  ShieldCheck,
  Archive,
} from "lucide-react";
import type { LibraryItem, LibrarySortKey, LibraryViewMode } from "../types";
import { formatBytes, libraryDisplayName } from "../utils";
import { ProgressBar, StatusBadge } from "./Common";
import { SkeletonCard, SkeletonTable } from "./Skeleton";

const sortOptions: { key: LibrarySortKey; label: string }[] = [
  { key: "updated_at", label: "更新时间" },
  { key: "title", label: "标题" },
  { key: "completeness", label: "完成度" },
  { key: "pic_count", label: "图片数" },
  { key: "zip_size", label: "文件大小" },
];

export function LibraryContent({
  items,
  selectedId,
  viewMode,
  sortBy,
  sortOrder,
  noImageMode,
  initialLoading,
  loading,
  onSelect,
  onSortChange,
  onToggleSortOrder,
  onViewModeChange,
  onRefresh,
  onVerify,
  onZip,
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
  onRefresh: () => Promise<void>;
  onVerify: (item: LibraryItem) => Promise<void>;
  onZip: (item: LibraryItem) => Promise<void>;
}) {
  return (
    <section className="library-content">
      <div className="library-toolbar">
        <div className="toolbar-left">
          <div className="sort-control">
            <ArrowUpDown size={14} />
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as LibrarySortKey)}
              className="sort-select"
            >
              {sortOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
            <button
              className={`sort-order-btn ${sortOrder === "asc" ? "asc" : ""}`}
              onClick={onToggleSortOrder}
              title={sortOrder === "desc" ? "降序" : "升序"}
            >
              {sortOrder === "desc" ? "↓" : "↑"}
            </button>
          </div>
        </div>
        <div className="toolbar-right">
          <div className="view-toggle">
            <button
              className={`view-toggle-btn ${viewMode === "list" ? "active" : ""}`}
              onClick={() => onViewModeChange("list")}
              title="列表视图"
            >
              <List size={15} />
            </button>
            <button
              className={`view-toggle-btn ${viewMode === "card" ? "active" : ""}`}
              onClick={() => onViewModeChange("card")}
              title="卡片视图"
            >
              <LayoutGrid size={15} />
            </button>
          </div>
          <button className="button secondary" onClick={() => void onRefresh()} disabled={loading}>
            <RefreshCw size={15} />刷新
          </button>
        </div>
      </div>

      {initialLoading ? (
        viewMode === "card" ? (
          <div className="library-card-grid">
            {Array.from({ length: 8 }, (_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <div style={{ padding: "14px 18px" }}><SkeletonTable rows={6} cols={6} /></div>
        )
      ) : items.length === 0 ? (
        <div className="empty-state">
          <HardDrive size={28} />
          <strong>当前分类暂无资料</strong>
          <p>完成下载或校验后，条目会出现在这里。</p>
        </div>
      ) : viewMode === "card" ? (
        <CardGrid
          items={items}
          selectedId={selectedId}
          noImageMode={noImageMode}
          loading={loading}
          onSelect={onSelect}
          onVerify={onVerify}
          onZip={onZip}
        />
      ) : (
        <ListView
          items={items}
          selectedId={selectedId}
          noImageMode={noImageMode}
          loading={loading}
          onSelect={onSelect}
          onVerify={onVerify}
          onZip={onZip}
        />
      )}
    </section>
  );
}

function CardGrid({
  items,
  selectedId,
  noImageMode,
  loading,
  onSelect,
  onVerify,
  onZip,
}: {
  items: LibraryItem[];
  selectedId: string | null;
  noImageMode: boolean;
  loading: boolean;
  onSelect: (item: LibraryItem) => void;
  onVerify: (item: LibraryItem) => Promise<void>;
  onZip: (item: LibraryItem) => Promise<void>;
}) {
  return (
    <div className="library-card-grid">
      {items.map((item) => (
        <article
          key={item.manga_id}
          className={`library-card ${item.manga_id === selectedId ? "selected" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => onSelect(item)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(item); } }}
        >
          <div className={`library-card-cover ${noImageMode ? "no-image-blur" : ""}`}>
            {item.cover_url ? <img src={item.cover_url} alt="" /> : <BookOpen size={24} />}
          </div>
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
              <button className="icon-button" title="查看文件" onClick={(e) => { e.stopPropagation(); onSelect(item); }}><Eye size={14} /></button>
              <button className="icon-button" title="重新校验" onClick={(e) => { e.stopPropagation(); void onVerify(item); }} disabled={loading}><ShieldCheck size={14} /></button>
              <button className="icon-button" title="重新打包" onClick={(e) => { e.stopPropagation(); void onZip(item); }} disabled={loading || item.total_files === 0}><Archive size={14} /></button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function ListView({
  items,
  selectedId,
  noImageMode,
  loading,
  onSelect,
  onVerify,
  onZip,
}: {
  items: LibraryItem[];
  selectedId: string | null;
  noImageMode: boolean;
  loading: boolean;
  onSelect: (item: LibraryItem) => void;
  onVerify: (item: LibraryItem) => Promise<void>;
  onZip: (item: LibraryItem) => Promise<void>;
}) {
  return (
    <div className="table-wrap">
      <table className="library-table">
        <thead>
          <tr>
            <th>封面</th>
            <th>标题</th>
            <th>状态</th>
            <th>完成度</th>
            <th>图片</th>
            <th>大小</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.manga_id}
              className={item.manga_id === selectedId ? "selected-row" : ""}
              onClick={() => onSelect(item)}
            >
              <td>
                <div className={`row-thumb ${noImageMode ? "no-image-blur" : ""}`}>
                  {item.cover_url ? <img src={item.cover_url} alt="" /> : <BookOpen size={16} />}
                </div>
              </td>
              <td>
                <div className="row-text">
                  <span className="row-name">{libraryDisplayName(item)}</span>
                  <span className="mono row-id-small">{item.manga_id}</span>
                </div>
              </td>
              <td><StatusBadge status={item.status} /></td>
              <td>
                <div className="progress-cell">
                  <ProgressBar value={item.completeness} />
                  <span>{Math.round(item.completeness * 100)}%</span>
                </div>
              </td>
              <td className="mono">{item.pic_count > 0 ? `${item.pic_count}` : `${item.total_files}`}</td>
              <td>{item.zip_exists ? formatBytes(item.zip_size) : "-"}</td>
              <td>
                <div className="row-actions">
                  <button className="icon-button" title="查看" onClick={(e) => { e.stopPropagation(); onSelect(item); }}><Eye size={14} /></button>
                  <button className="icon-button" title="校验" onClick={(e) => { e.stopPropagation(); void onVerify(item); }} disabled={loading}><ShieldCheck size={14} /></button>
                  <button className="icon-button" title="打包" onClick={(e) => { e.stopPropagation(); void onZip(item); }} disabled={loading || item.total_files === 0}><Archive size={14} /></button>
                </div>
              </td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={7}>当前分类暂无资料</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/qu/Documents/GitHub/wnacg-crawler && npx tsc --noEmit -p frontend/tsconfig.json 2>&1 | head -10`

Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/LibraryContent.tsx
git commit -m "feat(library): add LibraryContent with card/list views and toolbar"
```

---

## Task 6: Frontend — Create LibraryDetailPanel component

**Files:**
- Create: `frontend/src/components/LibraryDetailPanel.tsx`

- [ ] **Step 1: Create LibraryDetailPanel.tsx**

```tsx
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/qu/Documents/GitHub/wnacg-crawler && npx tsc --noEmit -p frontend/tsconfig.json 2>&1 | head -10`

Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/LibraryDetailPanel.tsx
git commit -m "feat(library): add LibraryDetailPanel with cover, metadata, actions, file list"
```

---

## Task 7: Frontend — Rewrite LibraryPage to three-column layout

**Files:**
- Rewrite: `frontend/src/pages/LibraryPage.tsx`

- [ ] **Step 1: Rewrite LibraryPage.tsx**

Replace the entire file:

```tsx
import { useMemo, useState } from "react";
import type { LibraryItem, LibraryFilter, LibrarySortKey, LibraryViewMode } from "../types";
import { LibrarySidebar } from "../components/LibrarySidebar";
import { LibraryContent } from "../components/LibraryContent";
import { LibraryDetailPanel } from "../components/LibraryDetailPanel";
import { isProblemFile } from "../utils";

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
          onClose={() => void onOpenDetail(selectedLibraryItem)}
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
```

Note: The `onClose` handler above is a placeholder — it should close the detail panel. We'll fix this in Task 8 when wiring up main.tsx.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/qu/Documents/GitHub/wnacg-crawler && npx tsc --noEmit -p frontend/tsconfig.json 2>&1 | head -10`

Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/LibraryPage.tsx
git commit -m "feat(library): rewrite LibraryPage as three-column layout orchestrator"
```

---

## Task 8: Frontend — Wire up main.tsx with new props

**Files:**
- Modify: `frontend/src/main.tsx:255-277`

- [ ] **Step 1: Update LibraryPage usage in main.tsx**

Replace the `{activeView === "library" && ...}` block (lines 255-277) with:

```tsx
{activeView === "library" && (
  <LibraryPage
    libraryItems={library.libraryItems}
    selectedLibraryId={library.selectedLibraryId}
    selectedLibraryItem={library.selectedLibraryItem}
    selectedLibraryFiles={library.selectedLibraryFiles}
    selectedProblemFileCount={library.selectedProblemFileCount}
    libraryCounts={library.libraryCounts}
    libraryDetailLoading={library.libraryDetailLoading}
    showOnlyProblemFiles={library.showOnlyProblemFiles}
    noImageMode={noImageMode}
    searchQuery={searchQuery}
    loading={loading}
    initialLoading={library.initialLoading}
    sortBy={library.sortBy}
    sortOrder={library.sortOrder}
    viewMode={library.viewMode}
    onOpenDetail={library.openDetail}
    onVerify={handleVerify}
    onZip={handleZip}
    onRetryFailed={handleRetryFailed}
    onRefresh={library.refresh}
    onRefreshDetail={() => { if (library.selectedLibraryId) void library.loadDetail(library.selectedLibraryId); }}
    setShowOnlyProblemFiles={library.setShowOnlyProblemFiles}
    onSortChange={library.setSortBy}
    onToggleSortOrder={() => library.setSortOrder(library.sortOrder === "desc" ? "asc" : "desc")}
    onViewModeChange={library.setViewMode}
  />
)}
```

- [ ] **Step 2: Add closeDetail to useLibrary hook**

In `frontend/src/hooks/useLibrary.ts`, add a `closeDetail` function and export it. Add after the `openDetail` callback:

```typescript
const closeDetail = useCallback(() => {
  setSelectedLibraryId(null);
  setSelectedLibraryItem(null);
}, []);
```

And add `closeDetail` to the return object.

- [ ] **Step 3: Update LibraryPage to use closeDetail**

In `frontend/src/pages/LibraryPage.tsx`, add `onCloseDetail` prop and use it in the detail panel's `onClose`:

Add to props: `onCloseDetail: () => void;`
Replace `onClose={() => void onOpenDetail(selectedLibraryItem)}` with `onClose={onCloseDetail}`

- [ ] **Step 4: Update main.tsx to pass onCloseDetail**

Add to the LibraryPage usage: `onCloseDetail={library.closeDetail}`

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd /Users/qu/Documents/GitHub/wnacg-crawler && npx tsc --noEmit -p frontend/tsconfig.json 2>&1 | head -10`

Expected: No new errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/main.tsx frontend/src/hooks/useLibrary.ts frontend/src/pages/LibraryPage.tsx
git commit -m "feat(library): wire up new LibraryPage props in main.tsx"
```

---

## Task 9: Frontend — Add CSS styles for three-column layout

**Files:**
- Modify: `frontend/src/styles.css` (library section, lines ~1322-1509)

- [ ] **Step 1: Replace library layout styles**

Find and replace the library-related CSS section (from `.library-layout` to the end of `.library-detail-panel` styles). Replace with:

```css
/* ===== Library Three-Column Layout ===== */

.library-layout {
  display: grid;
  grid-template-columns: 220px 1fr 0;
  gap: 0;
  height: 100%;
  overflow: hidden;
}

.library-layout:has(.library-detail-panel) {
  grid-template-columns: 220px 1fr 380px;
}

.library-layout.sidebar-collapsed {
  grid-template-columns: 48px 1fr 0;
}

.library-layout.sidebar-collapsed:has(.library-detail-panel) {
  grid-template-columns: 48px 1fr 380px;
}

/* ===== Library Sidebar ===== */

.library-sidebar {
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border);
  background: var(--surface-1);
  overflow-y: auto;
  padding: 12px 0;
}

.library-sidebar.collapsed {
  align-items: center;
  padding: 12px 0;
  gap: 4px;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px 10px;
}

.sidebar-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  border: none;
  transition: background 0.15s, color 0.15s;
}

.sidebar-toggle:hover {
  background: var(--surface-2);
  color: var(--text);
}

.sidebar-group {
  padding: 6px 0;
}

.sidebar-group-label {
  display: block;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  padding: 4px 14px 6px;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 14px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  text-align: left;
}

.sidebar-item:hover {
  background: var(--surface-2);
  color: var(--text);
}

.sidebar-item.active {
  background: var(--accent-bg);
  color: var(--accent);
  font-weight: 500;
}

.sidebar-count {
  margin-left: auto;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  background: var(--surface-2);
  padding: 1px 6px;
  border-radius: 10px;
  min-width: 20px;
  text-align: center;
}

.sidebar-item.active .sidebar-count {
  background: var(--accent);
  color: var(--accent-fg);
}

.sidebar-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  border: none;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.sidebar-icon-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}

.sidebar-icon-btn.active {
  background: var(--accent-bg);
  color: var(--accent);
}

.sidebar-empty-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  font-size: 12px;
  color: var(--text-muted);
}

/* ===== Library Content Area ===== */

.library-content {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.library-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  gap: 12px;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sort-control {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-muted);
}

.sort-select {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--surface-1);
  color: var(--text);
  cursor: pointer;
}

.sort-order-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: var(--surface-1);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  transition: background 0.12s;
}

.sort-order-btn:hover {
  background: var(--surface-2);
}

.library-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
  padding: 14px 16px;
  overflow-y: auto;
  flex: 1;
}

/* ===== Library Card (redesigned) ===== */

.library-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--surface-1);
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.library-card:hover {
  border-color: var(--border-hover);
  box-shadow: var(--shadow-sm);
}

.library-card.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.library-card-cover {
  aspect-ratio: 3 / 4;
  overflow: hidden;
  background: var(--surface-2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.library-card-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.library-card-cover.no-image-blur img {
  filter: blur(12px) saturate(0);
}

.library-card-body {
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.library-card-title {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.library-card-title h3 {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  flex: 1;
  min-width: 0;
}

.library-card-id {
  font-size: 11px;
  color: var(--text-muted);
}

.library-progress-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
}

.library-progress-row strong {
  font-size: 11px;
  white-space: nowrap;
}

.library-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}

.library-meta span {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--surface-2);
}

.meta-warning {
  color: var(--warning) !important;
  background: var(--warning-bg) !important;
}

.meta-danger {
  color: var(--danger) !important;
  background: var(--danger-bg) !important;
}

/* ===== Library List View ===== */

.library-table {
  width: 100%;
  border-collapse: collapse;
}

.library-table th,
.library-table td {
  padding: 8px 12px;
  text-align: left;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}

.library-table th {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  position: sticky;
  top: 0;
  background: var(--surface-1);
  z-index: 1;
}

.library-table tr {
  cursor: pointer;
  transition: background 0.1s;
}

.library-table tbody tr:hover {
  background: var(--surface-2);
}

.library-table .selected-row {
  background: var(--accent-bg);
}

.library-table .row-thumb {
  width: 36px;
  height: 48px;
  border-radius: 4px;
  overflow: hidden;
  background: var(--surface-2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.library-table .row-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.library-table .row-thumb.no-image-blur img {
  filter: blur(12px) saturate(0);
}

.library-table .progress-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

.library-table .progress-cell .progress-bar {
  width: 60px;
}

/* ===== Library Detail Panel ===== */

.library-detail-panel {
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border);
  background: var(--surface-1);
  overflow-y: auto;
  animation: slideInRight 0.25s ease-out;
}

@keyframes slideInRight {
  from { transform: translateX(20px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

.detail-panel-header {
  display: flex;
  justify-content: flex-end;
  padding: 10px 14px 0;
}

.detail-cover-wrap {
  padding: 8px 20px 12px;
  display: flex;
  justify-content: center;
}

.detail-cover {
  width: 80%;
  max-width: 260px;
  aspect-ratio: 3 / 4;
  border-radius: 8px;
  overflow: hidden;
  background: var(--surface-2);
  box-shadow: var(--shadow-md);
}

.detail-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.detail-cover.no-image-blur img {
  filter: blur(12px) saturate(0);
}

.detail-cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.detail-title-section {
  padding: 0 20px 12px;
  text-align: center;
}

.detail-title-section h3 {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
  margin-bottom: 4px;
}

.detail-title-section .mono {
  font-size: 12px;
  color: var(--text-muted);
  display: block;
  margin-bottom: 6px;
}

.detail-title-section .status {
  display: inline-block;
}

.library-detail-panel .detail-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: 0 20px 14px;
}

.detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 20px 14px;
}

.detail-actions .button {
  font-size: 12px;
  padding: 6px 10px;
}

.detail-path {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  font-size: 11px;
  color: var(--text-muted);
  border-top: 1px solid var(--border);
  word-break: break-all;
}

.detail-files-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-top: 1px solid var(--border);
}

.detail-files-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px 6px;
}

.detail-files-tools {
  display: flex;
  align-items: center;
  gap: 6px;
}

.detail-files-section .file-table-wrap {
  flex: 1;
  overflow-y: auto;
}

.detail-files-section .file-table {
  font-size: 11px;
}

/* ===== Responsive ===== */

@media (max-width: 1200px) {
  .library-layout {
    grid-template-columns: 48px 1fr 0;
  }
  .library-layout:has(.library-detail-panel) {
    grid-template-columns: 48px 1fr 340px;
  }
  .library-sidebar:not(.collapsed) {
    position: absolute;
    z-index: 10;
    width: 220px;
    height: 100%;
    box-shadow: var(--shadow-lg);
  }
}

@media (max-width: 860px) {
  .library-layout {
    grid-template-columns: 1fr;
  }
  .library-layout:has(.library-detail-panel) {
    grid-template-columns: 1fr;
  }
  .library-sidebar {
    display: none;
  }
  .library-detail-panel {
    position: fixed;
    inset: 0;
    z-index: 100;
    width: 100%;
  }
  .library-card-grid {
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  }
}
```

- [ ] **Step 2: Verify the app builds**

Run: `cd /Users/qu/Documents/GitHub/wnacg-crawler && npm run build:frontend 2>&1 | tail -10`

Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles.css
git commit -m "feat(library): add three-column layout CSS with responsive breakpoints"
```

---

## Task 10: Final — Verify everything works end-to-end

- [ ] **Step 1: Run TypeScript type check**

Run: `cd /Users/qu/Documents/GitHub/wnacg-crawler && npx tsc --noEmit -p frontend/tsconfig.json 2>&1`

Expected: No errors

- [ ] **Step 2: Run ESLint**

Run: `cd /Users/qu/Documents/GitHub/wnacg-crawler && npm run lint -w frontend 2>&1 | tail -10`

Expected: No new errors

- [ ] **Step 3: Run backend lint**

Run: `cd /Users/qu/Documents/GitHub/wnacg-crawler && .venv/bin/ruff check backend/app/api/library.py backend/app/services/library_service.py`

Expected: No errors

- [ ] **Step 4: Run full validation**

Run: `cd /Users/qu/Documents/GitHub/wnacg-crawler && npm run validate 2>&1 | tail -20`

Expected: All checks pass

- [ ] **Step 5: Start dev server and visually verify**

Run: `cd /Users/qu/Documents/GitHub/wnacg-crawler && npm run dev:frontend`

Open `http://localhost:5173` and navigate to the library page. Verify:
1. Three-column layout renders correctly
2. Left sidebar shows categories with counts
3. Card view displays items in grid
4. List view displays items in table
5. Clicking a card opens the detail panel on the right
6. Sorting works (change sort dropdown)
7. Sidebar filtering works (click categories)
8. Responsive behavior at different widths

- [ ] **Step 6: Final commit with all remaining changes**

```bash
git add -A
git commit -m "feat(library): complete library page redesign with three-column layout"
```
