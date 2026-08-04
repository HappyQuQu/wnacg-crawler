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

import type { ViewKey, Task, TaskProgressMessage } from "./types";
import { Sidebar } from "./components/Sidebar";
import { ToastProvider, useToast } from "./components/Toast";
import { ErrorBoundary } from "./components/Common";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { AddTaskPanel } from "./components/AddTaskPanel";
import { BlockAlertBanner } from "./components/BlockAlertBanner";
import { DashboardPage } from "./pages/DashboardPage";
import { QueuePage } from "./pages/QueuePage";
import { LibraryPage } from "./pages/LibraryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { useTasks } from "./hooks/useTasks";
import { useLibrary } from "./hooks/useLibrary";
import { useLogs } from "./hooks/useLogs";
import { useConfig } from "./hooks/useConfig";
import { useWebSocket, useWsTaskProgress, useWsAutoRefresh } from "./hooks/useWebSocket";
import { useBlockAlerts } from "./hooks/useBlockAlerts";

const viewCopy: Record<ViewKey, string> = {
  dashboard: "概览",
  tasks: "下载任务",
  library: "资料库",
  settings: "设置",
};

function App() {
  const [activeView, setActiveView] = useState<ViewKey>("dashboard");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [noImageMode, setNoImageMode] = useLocalStorage("wnacg-no-image", false);
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    message: string;
    variant: "danger" | "default";
    onConfirm: () => void;
  }>({ open: false, title: "", message: "", variant: "default", onConfirm: () => {} });

  const { showToast } = useToast();
  const tasks = useTasks();
  const library = useLibrary();
  const logs = useLogs();
  const config = useConfig();
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
      void Promise.all([library.refresh(), logs.refresh()]);
    }
  }, [tasks.updateFromWs, library.refresh, logs.refresh, showToast]));

  useWsAutoRefresh(wsStatus, refreshAll);

  useEffect(() => {
    void refreshAll();
  }, []);

  const navCounts = useMemo<Record<ViewKey, string>>(
    () => ({
      dashboard: String(tasks.runningTasks.length),
      tasks: String(tasks.queueCounts.active),
      library: String(library.libraryCounts.all),
      settings: config.config?.extension_token_set ? "OK" : "SET",
    }),
    [tasks.runningTasks.length, tasks.queueCounts.active, library.libraryCounts.all, config.config?.extension_token_set]
  );

  async function withLoading(fn: () => Promise<void>) {
    setLoading(true);
    try {
      await fn();
    } catch {
      showToast("操作失败，请重试", "error");
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
      if (data) showToast(data.message, "success");
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

  return (
    <div className="app-shell">
      <Sidebar
        activeView={activeView}
        setActiveView={setActiveView}
        wsStatus={wsStatus}
        navCounts={navCounts}
        queueActive={tasks.queueCounts.active}
        onAddTask={() => setAddPanelOpen(true)}
      />

      <main className="main">
        <header className="toolbar">
          <h1 className="toolbar-title">{viewCopy[activeView]}</h1>
          <div className="toolbar-actions">
            <label className="search">
              <Search size={15} />
              <span className="sr-only">搜索</span>
              <input placeholder="搜索 ID、标题、状态" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
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
              runningTasks={tasks.runningTasks}
              recentActivity={logs.recentActivity}
              initialLoading={tasks.initialLoading}
              onNavigateTasks={() => setActiveView("tasks")}
              onRetryTask={handleRetryTask}
            />
          )}

          {activeView === "tasks" && (
            <QueuePage
              tasks={tasks.tasks}
              selectedTask={tasks.selectedTask}
              logItems={logs.logItems}
              queueCounts={tasks.queueCounts}
              noImageMode={noImageMode}
              searchQuery={searchQuery}
              loading={loading}
              initialLoading={tasks.initialLoading}
              onTaskSelect={tasks.setSelectedTaskId}
              onRefresh={tasks.refresh}
              onRefreshLogs={logs.refresh}
              onControl={handleControlTask}
              onRetry={handleRetryTask}
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
              showOnlyProblemFiles={library.showOnlyProblemFiles}
              noImageMode={noImageMode}
              searchQuery={searchQuery}
              loading={loading}
              initialLoading={library.initialLoading}
              sortBy={library.sortBy}
              sortOrder={library.sortOrder}
              viewMode={library.viewMode}
              onOpenDetail={library.openDetail}
              onCloseDetail={library.closeDetail}
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

          {activeView === "settings" && (
            <SettingsPage
              config={config.config}
              loading={loading}
              noImageMode={noImageMode}
              onRefresh={config.refresh}
              onSave={handleSaveConfig}
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
        confirmLabel={confirmState.variant === "danger" ? "取消任务" : "确认"}
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
