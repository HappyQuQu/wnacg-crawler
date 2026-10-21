import { StrictMode, useCallback, useEffect, useMemo, useState } from "react";

function useLocalStorage(key: string, initial: boolean): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem(key) === "true";
    } catch {
      return initial;
    }
  });
  const set = useCallback((v: boolean) => {
    setValue(v);
    try {
      localStorage.setItem(key, String(v));
    } catch {
      // ignore
    }
  }, [key]);
  return [value, set];
}
import { createRoot } from "react-dom/client";
import { Search } from "lucide-react";
import "./styles.css";

import type { ViewKey, Task, TaskProgressMessage, LibraryItem } from "./types";
import { clearCompletedTasksApi, deleteLibraryApi } from "./api";
import { Sidebar } from "./components/Sidebar";
import { ToastProvider, useToast } from "./components/Toast";
import { ErrorBoundary } from "./components/Common";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { AddTaskPanel } from "./components/AddTaskPanel";
import { BlockAlertBanner } from "./components/BlockAlertBanner";
import { DashboardPage } from "./pages/DashboardPage";
import { QueuePage } from "./pages/QueuePage";
import { LibraryPage } from "./pages/LibraryPage";
import { LogsPage } from "./pages/LogsPage";
import { useAppNavigation } from "./hooks/useAppNavigation";
import { SettingsPage } from "./pages/SettingsPage";
import { useTasks } from "./hooks/useTasks";
import { useLibrary } from "./hooks/useLibrary";
import { useLogs } from "./hooks/useLogs";
import { useConfig } from "./hooks/useConfig";
import { useTheme } from "./hooks/useTheme";
import { useWebSocket, useWsTaskProgress, useWsAutoRefresh } from "./hooks/useWebSocket";
import { useBlockAlerts } from "./hooks/useBlockAlerts";

const viewCopy: Record<ViewKey, string> = {
  dashboard: "概览",
  tasks: "下载任务",
  library: "资料库",
  settings: "设置",
  logs: "日志",
};

function App() {
  const { route, navigate } = useAppNavigation();
  const { view: activeView, queueTab, search: searchQuery } = route;
  const setSearchQuery = (search: string) => navigate({ search }, true);
  const [queueOpenDetail, setQueueOpenDetail] = useState(false);
  const [libraryOpenDetail, setLibraryOpenDetail] = useState(false);
  const [loading, setLoading] = useState(false);
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [noImageMode, setNoImageMode] = useLocalStorage("wnacg-no-image", false);
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    message: string;
    variant: "danger" | "default";
    onConfirm: () => void;
    confirmLabel?: string;
  }>({ open: false, title: "", message: "", variant: "default", onConfirm: () => {} });

  const { showToast } = useToast();
  const tasks = useTasks();
  const library = useLibrary();
  const logs = useLogs();
  const config = useConfig();
  useTheme(config.config?.theme);
  const wsStatus = useWebSocket();
  const blockAlerts = useBlockAlerts(showToast);

  const refreshAll = useCallback(async () => {
    await Promise.all([tasks.refresh(), library.refresh(), config.refresh(), logs.refresh()]);
  }, [tasks.refresh, library.refresh, config.refresh, logs.refresh]);

  useWsTaskProgress(useCallback((payload: TaskProgressMessage) => {
    tasks.updateFromWs(payload);
    if (["completed", "partial", "failed"].includes(payload.status)) {
      if (payload.status === "completed") {
        showToast(`${payload.manga_id} 下载完成`, "success");
      } else if (payload.status === "failed") {
        showToast(`${payload.manga_id} 下载失败`, "error");
      }
      void Promise.all([library.refresh(), logs.refresh()]).catch(() => { /* Automatic refresh retries on the next event. */ });
    }
  }, [tasks.updateFromWs, library.refresh, logs.refresh, showToast]));

  useWsAutoRefresh(wsStatus, () => { void refreshAll().catch(() => { /* Read errors are exposed by the page hooks; polling retries. */ }); });

  useEffect(() => {
    void refreshAll().catch((error: unknown) => showToast(error instanceof Error ? error.message : "数据读取失败，请重试", "error"));
  }, []);

  useEffect(() => {
    document.title = `${viewCopy[activeView]} · WNACG Downloader`;
    window.scrollTo(0, 0);
  }, [activeView]);

  const navCounts = useMemo<Record<ViewKey, string>>(
    () => ({
      dashboard: String(tasks.runningTasks.length),
      tasks: String(tasks.queueCounts.active),
      library: String(library.libraryCounts.all),
      logs: String(logs.logCounts.error + logs.logCounts.warning),
      settings: config.config?.extension_token_set ? "OK" : "SET",
    }),
    [tasks.runningTasks.length, tasks.queueCounts.active, library.libraryCounts.all, logs.logCounts.error, logs.logCounts.warning, config.config?.extension_token_set]
  );

  async function withLoading(fn: () => Promise<void>) {
    setLoading(true);
    try {
      await fn();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "操作失败，请重试", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleControlTask(task: Task, action: "pause" | "resume" | "cancel") {
    if (action === "cancel") {
      setConfirmState({
        open: true,
        title: "取消任务",
        message: `确定要取消任务 ${task.manga_id} 吗？取消后需要重新添加。`,
        variant: "danger",
        confirmLabel: "取消任务",
        onConfirm: () => {
          setConfirmState((s) => ({ ...s, open: false }));
          void withLoading(async () => {
            await tasks.controlTask(task, "cancel");
            showToast(`已取消任务 ${task.manga_id}`, "success");
            await refreshAll();
          });
        },
      });
      return;
    }
    await withLoading(async () => {
      const labelMap = { pause: "已暂停", resume: "已继续" };
      await tasks.controlTask(task, action);
      showToast(`${labelMap[action]}任务 ${task.manga_id}`, "success");
      await refreshAll();
    });
  }

  async function handleRetryTask(task: Task) {
    await withLoading(async () => {
      await tasks.retryTask(task);
      showToast(`已重试任务 ${task.manga_id}`, "success");
      await refreshAll();
    });
  }

  function handleClearCompleted(task?: Task) {
    setConfirmState({
      open: true,
      title: task ? "清除任务记录" : "清除已完成任务",
      message: task ? `清除作品 ${task.manga_id} 的已完成任务记录？资料库和本地文件会保留。` :
        `清除全部 ${tasks.queueCounts.completed} 条已完成任务记录？资料库和本地文件会保留。`,
      variant: "default",
      confirmLabel: "清除记录",
      onConfirm: () => {
        setConfirmState((s) => ({ ...s, open: false }));
        void withLoading(async () => {
          const result = await clearCompletedTasksApi(task?.task_id);
          await Promise.all([tasks.refresh(), library.refresh()]);
          showToast(`已清除 ${result.deleted} 条任务记录`, "success");
        });
      },
    });
  }

  async function handleDeleteLibrary(items: LibraryItem[], deleteFiles: boolean): Promise<string[]> {
    setLoading(true);
    try {
      const result = await deleteLibraryApi(items.map((item) => item.manga_id), deleteFiles);
      if (result.deleted.length) {
        if (library.selectedLibraryId && result.deleted.includes(library.selectedLibraryId)) library.closeDetail();
        await Promise.all([tasks.refresh(), library.refresh()]);
        showToast(`已删除 ${result.deleted.length} 项${deleteFiles ? "及其本地文件" : "资料记录，本地文件已保留"}`, "success");
      }
      if (result.failed.length) {
        showToast(result.failed.map((item) => `${item.manga_id}：${item.error}`).slice(0, 3).join("；"), "warning");
      }
      return result.deleted;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "删除失败，请重试", "error");
      return [];
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(item: typeof library.libraryItems[0]) {
    await withLoading(async () => {
      await library.verifyItem(item);
      showToast(`已校验 ${item.manga_id}`, "success");
      await library.refresh();
    });
  }

  async function handleZip(item: typeof library.libraryItems[0]) {
    await withLoading(async () => {
      const result = await library.zipItem(item);
      showToast(
        result.zip_exists ? `已打包 ${item.manga_id}` : `未打包：${result.status}`,
        result.zip_exists ? "success" : "warning"
      );
      await library.refresh();
    });
  }

  async function handleRetryFailed(item: typeof library.libraryItems[0]) {
    await withLoading(async () => {
      const result = await library.retryFailed(item);
      if (result.task) tasks.setSelectedTaskId(result.task.task_id);
      if (result.status === "no_problem_files") {
        showToast(`${item.manga_id} 没有需要重试的问题文件`, "info");
      } else if (result.status === "already_active") {
        showToast(`${item.manga_id} 已有活跃任务，未重复创建`, "warning");
      } else {
        showToast(`已创建问题文件重试任务：${result.problem_files} 个文件`, "success");
      }
      await Promise.all([tasks.refresh(), library.refresh()]);
    });
  }

  async function handleSaveConfig() {
    await withLoading(async () => {
      const data = await config.save();
      if (data) showToast(data.message, data.overridden_fields?.length ? "warning" : "success");
    });
  }

  async function handleGenerateToken() {
    setConfirmState({
      open: true,
      title: "生成扩展 Token",
      message: "生成新 Token 后，旧 Token 将失效。确定继续吗？",
      variant: "default",
      onConfirm: () => {
        setConfirmState((s) => ({ ...s, open: false }));
        void withLoading(async () => {
          const data = await config.generateToken();
          if (data?.overridden_fields?.includes("extension_token")) {
            showToast(data.message, "warning");
            return;
          }
          if (data?.extension_token) {
            try {
              await navigator.clipboard.writeText(data.extension_token);
              showToast("已生成扩展 Token 并复制到剪贴板", "success");
            } catch {
              showToast("已生成扩展 Token，请手动复制", "success");
            }
          } else {
            showToast("已生成扩展 Token", "success");
          }
        });
      },
    });
  }

  function openTask(task: Task) {
    setQueueOpenDetail(true);
    tasks.setSelectedTaskId(task.task_id);
    navigate({ view: "tasks", queueTab: "all", search: "" });
  }

  return (
    <div className="app-shell dashboard-shell">
      <Sidebar
        activeView={activeView}
        setActiveView={(view) => { setQueueOpenDetail(false); setLibraryOpenDetail(false); navigate({ view, search: "" }); }}
        wsStatus={wsStatus}
        navCounts={navCounts}
        runningCount={tasks.runningTasks.length}
        onAddTask={() => setAddPanelOpen(true)}
      />

      <main className="main">
        <header className="toolbar">
          <h1 className="toolbar-title">{viewCopy[activeView]}</h1>
          <div className="toolbar-actions">
            <label className="search">
              <Search size={15} />
              <span className="sr-only">搜索</span>
              <input placeholder={activeView === "settings" ? "搜索设置项" : activeView === "logs" ? "搜索作品 ID、任务 ID、错误信息" : "搜索 ID、标题、状态"} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </label>
          </div>
        </header>

        <BlockAlertBanner
          alerts={blockAlerts.alerts}
          onDismiss={blockAlerts.dismissAlert}
        />

        <section className="content">
          {activeView === "dashboard" && (
            <DashboardPage
              tasks={tasks.tasks}
              libraryItems={library.libraryItems}
              recentActivity={logs.recentActivity}
              initialLoading={tasks.initialLoading || library.initialLoading || logs.initialLoading}
              loading={loading}
              wsStatus={wsStatus}
              searchQuery={searchQuery}
              onAddTask={() => setAddPanelOpen(true)}
              onRefresh={() => withLoading(refreshAll)}
              onNavigateTasks={(filter = "all") => { setQueueOpenDetail(false); navigate({ view: "tasks", queueTab: filter, search: "" }); }}
              onNavigateLogs={() => navigate({ view: "logs", logLevel: "all", logTaskId: "", search: "" })}
              onNavigateLibrary={() => { setLibraryOpenDetail(false); navigate({ view: "library", search: "" }); }}
              onOpenTask={openTask}
              onOpenLibrary={(item) => { setLibraryOpenDetail(true); navigate({ view: "library", search: "" }); void withLoading(() => library.openDetail(item)); }}
              onRetryTask={handleRetryTask}
            />
          )}

          {activeView === "tasks" && (
            <QueuePage
              tasks={tasks.tasks}
              selectedTask={tasks.selectedTask}
              queueCounts={tasks.queueCounts}
              noImageMode={noImageMode}
              searchQuery={searchQuery}
              loading={loading}
              initialLoading={tasks.initialLoading}
              onTaskSelect={tasks.setSelectedTaskId}
              wsStatus={wsStatus}
              onAddTask={() => setAddPanelOpen(true)}
              onRefresh={() => withLoading(tasks.refresh)}
              onControl={handleControlTask}
              onRetry={handleRetryTask}
              onClearCompleted={handleClearCompleted}
              activeTab={queueTab}
              onTabChange={(queueTab) => navigate({ queueTab })}
              openSelectedDetail={queueOpenDetail}
            />
          )}

          {activeView === "library" && (
            <LibraryPage
              libraryItems={library.libraryItems}
              selectedLibraryId={library.selectedLibraryId}
              selectedLibraryItem={library.selectedLibraryItem}
              selectedLibraryFiles={library.selectedLibraryFiles}
              selectedProblemFileCount={library.selectedProblemFileCount}
              libraryCounts={library.libraryCounts}
              libraryDetailLoading={library.libraryDetailLoading}
              libraryDetailError={library.libraryDetailError}
              wsStatus={wsStatus}
              onAddTask={() => setAddPanelOpen(true)}
              onClearSearch={() => setSearchQuery("")}
              openSelectedDetail={libraryOpenDetail}
              showOnlyProblemFiles={library.showOnlyProblemFiles}
              noImageMode={noImageMode}
              searchQuery={searchQuery}
              loading={loading}
              initialLoading={library.initialLoading}
              sortBy={library.sortBy}
              sortOrder={library.sortOrder}
              viewMode={library.viewMode}
              onOpenDetail={(item) => withLoading(() => library.openDetail(item))}
              onCloseDetail={library.closeDetail}
              onVerify={handleVerify}
              onZip={handleZip}
              onRetryFailed={handleRetryFailed}
              onDelete={handleDeleteLibrary}
              onRefresh={() => withLoading(library.refresh)}
              onRefreshDetail={() => { const id = library.selectedLibraryId; if (id) void withLoading(() => library.loadDetail(id)); }}
              setShowOnlyProblemFiles={library.setShowOnlyProblemFiles}
              onSortChange={library.setSortBy}
              onToggleSortOrder={() => library.setSortOrder(library.sortOrder === "desc" ? "asc" : "desc")}
              onViewModeChange={library.setViewMode}
            />
          )}

          {activeView === "logs" && <LogsPage level={route.logLevel} taskId={route.logTaskId} searchQuery={searchQuery} wsStatus={wsStatus} tasks={tasks.tasks} onLevelChange={(logLevel) => navigate({ logLevel })} onTaskFilter={(logTaskId) => navigate({ logTaskId })} onClearSearch={() => setSearchQuery("")} onOpenTask={openTask} />}

          {activeView === "settings" && (
            <SettingsPage
              config={config.config}
              savedConfig={config.savedConfig}
              initialLoading={config.initialLoading}
              loadError={config.loadError}
              saveError={config.saveError}
              saveFeedback={config.saveFeedback}
              dirtyFields={config.dirtyFields}
              wsStatus={wsStatus}
              searchQuery={searchQuery}
              onClearSearch={() => setSearchQuery("")}
              loading={loading}
              noImageMode={noImageMode}
              onRefresh={() => withLoading(config.refresh)}
              onSave={handleSaveConfig}
              onDiscard={config.discard}
              onGenerateToken={handleGenerateToken}
              onToggleNoImage={setNoImageMode}
              updateConfig={config.updateConfig}
              updateProxy={config.updateProxy}
            />
          )}
        </section>
      </main>

      <AddTaskPanel
        open={addPanelOpen}
        onClose={() => setAddPanelOpen(false)}
        onCreated={refreshAll}
      />

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        variant={confirmState.variant}
        confirmLabel={confirmState.confirmLabel ?? "确认"}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState((s) => ({ ...s, open: false }))}
      />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>
);
