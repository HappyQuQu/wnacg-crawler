import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Database,
  Download,
  Eye,
  FileText,
  FolderOpen,
  Gauge,
  HardDrive,
  Inbox,
  LayoutDashboard,
  ListFilter,
  ListChecks,
  Network,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Wifi,
  WifiOff,
  XCircle
} from "lucide-react";
import "./styles.css";

type ApiResponse<T> = {
  ok: boolean;
  data: T;
  error: unknown;
};

type ParsedItem = {
  raw: string;
  manga_id: string | null;
  url?: string;
  valid: boolean;
  status: string;
  title: string;
  page_count: number;
  pic_count: number;
  source: string;
  task_id?: string | null;
};

type ParseResult = {
  items: ParsedItem[];
  summary: {
    total: number;
    valid: number;
    duplicate: number;
    invalid: number;
  };
};

type Task = {
  id: string;
  task_id: string;
  manga_id: string;
  title: string;
  source: string;
  status: string;
  stage: string;
  progress_current: number;
  progress_total: number;
  retry_count: number;
  last_error: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type TaskList = {
  items: Task[];
  total: number;
};

type LibraryFile = {
  pic_index: number;
  pic_num: string;
  pic_url: string;
  page_url: string;
  file_path: string;
  file_name: string;
  file_size: number;
  exists: boolean;
  status: string;
  error_message: string;
  updated_at: string | null;
};

type LibraryItem = {
  manga_id: string;
  title: string;
  status: string;
  manga_status: string;
  task_id: string | null;
  task_status: string | null;
  page_count: number;
  pic_count: number;
  total_files: number;
  valid_files: number;
  failed_files: number;
  missing_files: number;
  completeness: number;
  download_dir: string;
  download_dir_exists: boolean;
  zip_path: string;
  zip_exists: boolean;
  zip_size: number;
  last_error: string | null;
  updated_at: string | null;
  files?: LibraryFile[];
};

type LibraryList = {
  items: LibraryItem[];
  total: number;
};

type LibraryRetryFailedResult = {
  status: string;
  problem_files: number;
  task: Task | null;
  library: LibraryItem;
};

type TaskProgressMessage = {
  type: "task_progress";
  task_id: string;
  manga_id: string;
  status: string;
  stage: string;
  current: number;
  total: number;
  message: string | null;
};

type WsStatus = "connecting" | "connected" | "fallback";
type ViewKey = "dashboard" | "queue" | "library" | "logs" | "settings";
type QueueFilter = "all" | "active" | "failed" | "partial" | "completed";
type LibraryFilter = "all" | "completed" | "partial" | "failed" | "missing";
type IconComponent = typeof LayoutDashboard;

type LogItem = {
  id: number;
  level: string;
  event: string;
  message: string;
  manga_id: string | null;
  task_id: string | null;
  stage: string | null;
  details: Record<string, unknown>;
  created_at: string | null;
};

type LogList = {
  items: LogItem[];
  total: number;
};

type AppConfig = {
  download_path: string;
  is_zip: boolean;
  max_thread: number;
  request_delay_ms: number;
  timeout_seconds: number;
  extension_token: string;
  extension_token_set: boolean;
  config_path: string;
  proxy: {
    is_proxy: boolean;
    address: string;
    port: number;
    username: string;
    password: string;
  };
};

const defaultInput = "";

const navSections: { label: string; items: { key: ViewKey; label: string; Icon: IconComponent }[] }[] = [
  {
    label: "任务流程",
    items: [
      { key: "dashboard", label: "控制台", Icon: LayoutDashboard },
      { key: "queue", label: "下载队列", Icon: ClipboardList },
      { key: "library", label: "本地资料库", Icon: BookOpen }
    ]
  },
  {
    label: "系统",
    items: [
      { key: "logs", label: "运行日志", Icon: FileText },
      { key: "settings", label: "设置", Icon: Settings }
    ]
  }
];

const viewCopy: Record<ViewKey, { title: string; subtitle: string }> = {
  dashboard: { title: "控制台", subtitle: "从输入预检到下载归档，一屏完成核心流程" },
  queue: { title: "下载队列", subtitle: "按状态聚合任务，快速处理暂停、继续、重试和取消" },
  library: { title: "本地资料库", subtitle: "按完整度管理本地内容，检查文件、补全缺失并打包 ZIP" },
  logs: { title: "运行日志", subtitle: "定位失败原因、阶段变化和修复记录" },
  settings: { title: "设置", subtitle: "配置下载目录、并发、代理和浏览器扩展配对" }
};

const queueFilters: { key: QueueFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "active", label: "进行中" },
  { key: "failed", label: "失败" },
  { key: "partial", label: "部分完成" },
  { key: "completed", label: "已完成" }
];

const libraryFilters: { key: LibraryFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "completed", label: "完整" },
  { key: "partial", label: "缺失" },
  { key: "failed", label: "失败" },
  { key: "missing", label: "文件异常" }
];

const pipelineSteps = ["输入解析", "任务预检", "加入队列", "下载执行", "完整校验", "资料库归档"];

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });
  const body = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !body.ok) {
    throw new Error(`API request failed: ${path}`);
  }
  return body.data;
}

function App() {
  const [activeView, setActiveView] = useState<ViewKey>("dashboard");
  const [searchQuery, setSearchQuery] = useState("");
  const [taskInput, setTaskInput] = useState(defaultInput);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [logItems, setLogItems] = useState<LogItem[]>([]);
  const [taskFilter, setTaskFilter] = useState<QueueFilter>("all");
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>("all");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [selectedLibraryItem, setSelectedLibraryItem] = useState<LibraryItem | null>(null);
  const [libraryDetailLoading, setLibraryDetailLoading] = useState(false);
  const [showOnlyProblemFiles, setShowOnlyProblemFiles] = useState(false);
  const [message, setMessage] = useState("后台已连接");
  const [loading, setLoading] = useState(false);
  const [wsStatus, setWsStatus] = useState<WsStatus>("connecting");
  const [config, setConfig] = useState<AppConfig | null>(null);

  const selectedTask = useMemo(() => {
    return tasks.find((task) => task.task_id === selectedTaskId) ?? tasks[0] ?? null;
  }, [selectedTaskId, tasks]);

  const metrics = useMemo(() => {
    const parsedItems = parseResult?.items ?? [];
    const actionable = parsedItems.filter(
      (item) => item.valid && ["ready", "partial"].includes(item.status)
    ).length;
    const active = tasks.filter((task) =>
      ["pending", "queued", "running", "paused"].includes(task.status)
    ).length;
    const failed = tasks.filter((task) => task.status === "failed").length;
    const completedLibrary = libraryItems.filter((item) => item.status === "completed").length;
    return {
      actionable,
      active,
      completedLibrary,
      libraryTotal: libraryItems.length,
      failed
    };
  }, [libraryItems, parseResult, tasks]);

  const selectedLibraryFiles = useMemo(() => {
    const files = selectedLibraryItem?.files ?? [];
    return showOnlyProblemFiles ? files.filter(isProblemFile) : files;
  }, [selectedLibraryItem, showOnlyProblemFiles]);

  const selectedProblemFileCount = useMemo(() => {
    return (selectedLibraryItem?.files ?? []).filter(isProblemFile).length;
  }, [selectedLibraryItem]);

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const queueCounts = useMemo(() => {
    return {
      all: tasks.length,
      active: tasks.filter((task) =>
        ["pending", "queued", "running", "paused"].includes(task.status)
      ).length,
      failed: tasks.filter((task) => task.status === "failed").length,
      partial: tasks.filter((task) => task.status === "partial").length,
      completed: tasks.filter((task) => task.status === "completed").length
    };
  }, [tasks]);

  const libraryCounts = useMemo(() => {
    return {
      all: libraryItems.length,
      completed: libraryItems.filter((item) => item.status === "completed").length,
      partial: libraryItems.filter((item) => item.status === "partial").length,
      failed: libraryItems.filter((item) => item.status === "failed").length,
      missing: libraryItems.filter(
        (item) => item.status === "missing" || item.missing_files > 0 || item.failed_files > 0
      ).length
    };
  }, [libraryItems]);

  const logCounts = useMemo(() => {
    return {
      error: logItems.filter((item) => item.level === "error").length,
      warning: logItems.filter((item) => item.level === "warning").length,
      total: logItems.length
    };
  }, [logItems]);

  const navCounts = useMemo<Record<ViewKey, string>>(
    () => ({
      dashboard: String(metrics.actionable),
      queue: String(queueCounts.active),
      library: String(libraryCounts.all),
      logs: String(logCounts.error || logCounts.warning || logCounts.total),
      settings: config?.extension_token_set ? "OK" : "SET"
    }),
    [config?.extension_token_set, libraryCounts.all, logCounts, metrics.actionable, queueCounts.active]
  );

  const parsedRows = useMemo(() => {
    const rows = parseResult?.items ?? [];
    return normalizedSearch
      ? rows.filter((item) =>
          [item.manga_id, item.raw, item.title, item.status, item.source]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(normalizedSearch))
        )
      : rows;
  }, [normalizedSearch, parseResult]);

  const filteredTasks = useMemo(() => {
    const byFilter = tasks.filter((task) => {
      if (taskFilter === "active") {
        return ["pending", "queued", "running", "paused"].includes(task.status);
      }
      if (taskFilter === "failed") {
        return task.status === "failed";
      }
      if (taskFilter === "partial") {
        return task.status === "partial";
      }
      if (taskFilter === "completed") {
        return task.status === "completed";
      }
      return true;
    });
    return normalizedSearch
      ? byFilter.filter((task) =>
          [task.manga_id, task.title, task.source, task.status, task.stage, task.task_id]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(normalizedSearch))
        )
      : byFilter;
  }, [normalizedSearch, taskFilter, tasks]);

  const filteredLibraryItems = useMemo(() => {
    const byFilter = libraryItems.filter((item) => {
      if (libraryFilter === "completed") {
        return item.status === "completed";
      }
      if (libraryFilter === "partial") {
        return item.status === "partial" || item.missing_files > 0;
      }
      if (libraryFilter === "failed") {
        return item.status === "failed" || item.failed_files > 0;
      }
      if (libraryFilter === "missing") {
        return item.status === "missing" || item.missing_files > 0 || item.failed_files > 0;
      }
      return true;
    });
    return normalizedSearch
      ? byFilter.filter((item) =>
          [item.manga_id, item.title, item.status, item.manga_status, item.last_error]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(normalizedSearch))
        )
      : byFilter;
  }, [libraryFilter, libraryItems, normalizedSearch]);

  const filteredLogItems = useMemo(() => {
    return normalizedSearch
      ? logItems.filter((item) =>
          [
            item.level,
            item.event,
            item.message,
            item.manga_id,
            item.task_id,
            item.stage,
            JSON.stringify(item.details)
          ]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(normalizedSearch))
        )
      : logItems;
  }, [logItems, normalizedSearch]);

  async function refreshTasks() {
    const data = await api<TaskList>("/api/tasks");
    setTasks(data.items);
    setSelectedTaskId((current) => current ?? data.items[0]?.task_id ?? null);
  }

  async function refreshLibrary() {
    const data = await api<LibraryList>("/api/library");
    setLibraryItems(data.items);
  }

  async function refreshLogs() {
    const data = await api<LogList>("/api/logs?limit=300");
    setLogItems(data.items);
  }

  async function loadLibraryDetail(mangaId: string) {
    setLibraryDetailLoading(true);
    try {
      const data = await api<LibraryItem>(`/api/library/${mangaId}`);
      setSelectedLibraryItem(data);
    } finally {
      setLibraryDetailLoading(false);
    }
  }

  async function openLibraryDetail(item: LibraryItem) {
    setSelectedLibraryId(item.manga_id);
    await loadLibraryDetail(item.manga_id);
  }

  async function refreshConfig() {
    const data = await api<AppConfig>("/api/config");
    setConfig(data);
  }

  async function refreshAll() {
    await Promise.all([refreshTasks(), refreshLibrary(), refreshConfig(), refreshLogs()]);
  }

  async function parseInput() {
    if (!taskInput.trim()) {
      setParseResult(null);
      setMessage("请输入 ID 或详情页链接");
      return;
    }
    setLoading(true);
    try {
      const data = await api<ParseResult>("/api/inputs/parse", {
        method: "POST",
        body: JSON.stringify({ text: taskInput, source: "manual" })
      });
      setParseResult(data);
      setMessage(`解析完成：有效 ${data.summary.valid}，重复 ${data.summary.duplicate}`);
    } finally {
      setLoading(false);
    }
  }

  async function addParsedTasks() {
    const items =
      parseResult?.items
        .filter((item) => item.valid && item.manga_id && ["ready", "partial"].includes(item.status))
        .map((item) => ({ manga_id: item.manga_id as string })) ?? [];
    if (items.length === 0) {
      setMessage("没有可加入队列的项目");
      return;
    }
    setLoading(true);
    try {
      const data = await api<{ created: Task[]; skipped: unknown[] }>("/api/tasks/batch", {
        method: "POST",
        body: JSON.stringify({ items, source: "manual", start_immediately: true })
      });
      setMessage(`已创建 ${data.created.length} 个任务，跳过 ${data.skipped.length} 个`);
      await refreshAll();
      await parseInput();
    } finally {
      setLoading(false);
    }
  }

  async function retrySelectedTask() {
    if (!selectedTask) {
      return;
    }
    await retryTask(selectedTask);
  }

  async function retryTask(task: Task) {
    setLoading(true);
    try {
      await api<Task>(`/api/tasks/${task.task_id}/retry`, {
        method: "POST",
        body: JSON.stringify({ scope: "task" })
      });
      setSelectedTaskId(task.task_id);
      setMessage(`已重试任务 ${task.manga_id}`);
      await refreshAll();
    } finally {
      setLoading(false);
    }
  }

  async function controlSelectedTask(action: "pause" | "resume" | "cancel") {
    if (!selectedTask) {
      return;
    }
    await controlTask(selectedTask, action);
  }

  async function controlTask(task: Task, action: "pause" | "resume" | "cancel") {
    setLoading(true);
    try {
      const updatedTask = await api<Task>(`/api/tasks/${task.task_id}/${action}`, {
        method: "POST"
      });
      const labelMap = { pause: "已暂停", resume: "已继续", cancel: "已取消" };
      setSelectedTaskId(updatedTask.task_id);
      setMessage(`${labelMap[action]}任务 ${updatedTask.manga_id}`);
      await refreshAll();
    } finally {
      setLoading(false);
    }
  }

  async function verifyLibraryItem(item: LibraryItem) {
    setLoading(true);
    try {
      const result = await api<LibraryItem>(`/api/library/${item.manga_id}/verify`, {
        method: "POST"
      });
      setSelectedLibraryId(item.manga_id);
      setSelectedLibraryItem(result);
      setMessage(`已校验 ${item.manga_id}`);
      await refreshLibrary();
    } finally {
      setLoading(false);
    }
  }

  async function zipLibraryItem(item: LibraryItem) {
    setLoading(true);
    try {
      const result = await api<LibraryItem>(`/api/library/${item.manga_id}/zip`, {
        method: "POST"
      });
      setSelectedLibraryId(item.manga_id);
      setSelectedLibraryItem(result);
      setMessage(result.zip_exists ? `已打包 ${item.manga_id}` : `未打包：${result.status}`);
      await refreshLibrary();
    } finally {
      setLoading(false);
    }
  }

  async function retryFailedLibraryFiles(item: LibraryItem) {
    setLoading(true);
    try {
      const result = await api<LibraryRetryFailedResult>(
        `/api/library/${item.manga_id}/retry-failed`,
        { method: "POST" }
      );
      setSelectedLibraryId(item.manga_id);
      setSelectedLibraryItem(result.library);
      if (result.task) {
        setSelectedTaskId(result.task.task_id);
      }
      if (result.status === "no_problem_files") {
        setMessage(`${item.manga_id} 没有需要重试的问题文件`);
      } else if (result.status === "already_active") {
        setMessage(`${item.manga_id} 已有活跃任务，未重复创建`);
      } else {
        setMessage(`已创建问题文件重试任务：${result.problem_files} 个文件`);
      }
      await Promise.all([refreshTasks(), refreshLibrary()]);
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig() {
    if (!config) {
      return;
    }
    setLoading(true);
    try {
      const data = await api<AppConfig & { message: string }>("/api/config", {
        method: "POST",
        body: JSON.stringify({
          download_path: config.download_path,
          is_zip: config.is_zip,
          max_thread: config.max_thread,
          request_delay_ms: config.request_delay_ms,
          timeout_seconds: config.timeout_seconds,
          extension_token: config.extension_token,
          proxy: config.proxy
        })
      });
      setConfig(data);
      setMessage(data.message);
    } finally {
      setLoading(false);
    }
  }

  async function generateExtensionToken() {
    setLoading(true);
    try {
      const data = await api<AppConfig>("/api/config/extension-token", { method: "POST" });
      setConfig(data);
      setMessage("已生成扩展 Token");
    } finally {
      setLoading(false);
    }
  }

  function updateConfig(patch: Partial<AppConfig>) {
    setConfig((current) => (current ? { ...current, ...patch } : current));
  }

  function updateProxy(patch: Partial<AppConfig["proxy"]>) {
    setConfig((current) =>
      current ? { ...current, proxy: { ...current.proxy, ...patch } } : current
    );
  }

  useEffect(() => {
    void refreshAll();
  }, []);

  useEffect(() => {
    if (libraryItems.length === 0) {
      setSelectedLibraryId(null);
      setSelectedLibraryItem(null);
      return;
    }
    if (!selectedLibraryId || !libraryItems.some((item) => item.manga_id === selectedLibraryId)) {
      setSelectedLibraryId(libraryItems[0].manga_id);
    }
  }, [libraryItems, selectedLibraryId]);

  useEffect(() => {
    if (!selectedLibraryId) {
      return;
    }
    void loadLibraryDetail(selectedLibraryId);
  }, [selectedLibraryId]);

  useEffect(() => {
    if (wsStatus === "connected") {
      return undefined;
    }
    const timer = window.setInterval(() => {
      void refreshAll();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [wsStatus]);

  useEffect(() => {
    let closed = false;
    let retryTimer: number | undefined;
    let socket: WebSocket | null = null;

    function connect() {
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${protocol}://${window.location.host}/ws/progress`);
      setWsStatus("connecting");

      socket.onopen = () => {
        setWsStatus("connected");
        setMessage("WebSocket 已连接");
      };

      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data) as TaskProgressMessage;
        if (payload.type !== "task_progress") {
          return;
        }
        setTasks((current) => updateTaskProgress(current, payload));
        setMessage(`${payload.manga_id}：${stageLabel(payload.stage)} ${payload.current}/${payload.total}`);
        if (["completed", "partial", "failed"].includes(payload.status)) {
          void Promise.all([refreshLibrary(), refreshLogs()]);
        }
      };

      socket.onclose = () => {
        if (closed) {
          return;
        }
        setWsStatus("fallback");
        setMessage("WebSocket 断开，已回退轮询");
        retryTimer = window.setTimeout(connect, 3000);
      };

      socket.onerror = () => {
        socket?.close();
      };
    }

    connect();
    return () => {
      closed = true;
      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }
      socket?.close();
    };
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Download size={22} />
          </div>
          <div>
            <strong>WNACG Downloader</strong>
            <span>本地采集工作台</span>
          </div>
        </div>

        <nav className="nav" aria-label="主导航">
          {navSections.map((section) => (
            <div className="nav-group" key={section.label}>
              <span className="nav-label">{section.label}</span>
              {section.items.map(({ key, label, Icon }) => (
                <button
                  key={key}
                  className={`nav-item ${activeView === key ? "active" : ""}`}
                  onClick={() => setActiveView(key)}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                  <span className="pill-count">{navCounts[key]}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <section className="extension-card">
          <div className="connection-row">
            <span className="caption">运行状态</span>
            <span className={`status ${wsStatus === "connected" ? "success" : "warning"}`}>
              {wsStatus === "connected" ? <Wifi size={13} /> : <WifiOff size={13} />}
              {wsStatus === "connected" ? "实时同步" : "轮询中"}
            </span>
          </div>
          <strong>{message}</strong>
          <div className="side-stats">
            <MiniStat label="队列" value={String(queueCounts.active)} />
            <MiniStat label="资料库" value={String(libraryCounts.all)} />
          </div>
        </section>
      </aside>

      <main className="main">
        <header className="toolbar">
          <div className="toolbar-title">
            <span className="eyebrow">本地任务工作台</span>
            <h1>{viewCopy[activeView].title}</h1>
            <p>{viewCopy[activeView].subtitle}</p>
          </div>
          <div className="toolbar-actions">
            <label className="search">
              <Search size={17} />
              <span className="sr-only">搜索</span>
              <input
                placeholder="搜索 ID、标题、状态"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </label>
            <button className="button secondary" onClick={() => setActiveView("settings")}>
              <ShieldCheck size={17} />扩展设置
            </button>
            <button
              className="button primary"
              onClick={activeView === "dashboard" ? parseInput : refreshAll}
              disabled={loading}
            >
              {activeView === "dashboard" ? <Plus size={17} /> : <RefreshCw size={17} />}
              {activeView === "dashboard" ? "解析输入" : "刷新"}
            </button>
          </div>
        </header>

        <section className="content">
          <div className="metrics">
            <Metric
              label="可加入"
              value={String(metrics.actionable)}
              detail="当前预检可执行"
              Icon={Inbox}
              tone="indigo"
            />
            <Metric
              label="队列中"
              value={String(metrics.active)}
              detail="待处理 / 运行 / 暂停"
              Icon={Activity}
              tone="blue"
            />
            <Metric
              label="资料库"
              value={`${metrics.completedLibrary}/${metrics.libraryTotal}`}
              detail="已完成 / 本地条目"
              Icon={Database}
              tone="green"
            />
            <Metric
              label="待修复"
              value={String(metrics.failed)}
              detail="失败任务等待重试"
              Icon={AlertTriangle}
              tone="orange"
            />
          </div>

          {activeView === "dashboard" && (
            <div className="dashboard-grid">
              <section className="panel intake-panel">
                <div className="panel-header">
                  <div>
                    <span className="eyebrow">任务收件箱</span>
                    <h2>批量添加</h2>
                    <p>ID、详情页链接和混合文本都会先进入预检</p>
                  </div>
                  <button className="button secondary" onClick={refreshAll} disabled={loading}>
                    <RefreshCw size={16} />刷新数据
                  </button>
                </div>

                <div className="workflow-strip" aria-label="下载流程">
                  {pipelineSteps.map((step, index) => (
                    <div className="workflow-step" key={step}>
                      <span>{index + 1}</span>
                      <strong>{step}</strong>
                      {index < pipelineSteps.length - 1 && <ArrowRight size={14} />}
                    </div>
                  ))}
                </div>

                <div className="add-area">
                  <label className="field-label" htmlFor="task-input">
                    输入内容
                  </label>
                  <textarea
                    id="task-input"
                    value={taskInput}
                    placeholder={"123456\nhttps://www.wnacg.com/photos-index-page-1-aid-298731.html\n298732, 298733"}
                    onChange={(event) => setTaskInput(event.target.value)}
                  />
                  <div className="actions">
                    <button className="button primary" onClick={parseInput} disabled={loading}>
                      <ListChecks size={17} />{loading ? "处理中" : "解析预检"}
                    </button>
                    <button className="button secondary" onClick={addParsedTasks} disabled={loading}>
                      <Plus size={17} />加入队列
                    </button>
                    <button
                      className="button ghost"
                      onClick={() => {
                        setTaskInput("");
                        setParseResult(null);
                      }}
                      disabled={loading || (!taskInput && !parseResult)}
                    >
                      清空
                    </button>
                  </div>
                </div>

                {parseResult && (
                  <div className="summary-strip">
                    <MiniStat label="总输入" value={String(parseResult.summary.total)} />
                    <MiniStat label="有效" value={String(parseResult.summary.valid)} />
                    <MiniStat label="重复" value={String(parseResult.summary.duplicate)} />
                    <MiniStat label="无效" value={String(parseResult.summary.invalid)} />
                  </div>
                )}

                <div className="table-wrap">
                  <table className="precheck-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>标题</th>
                        <th>图片</th>
                        <th>状态</th>
                        <th>来源</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRows.map((row) => (
                        <tr key={`${row.raw}-${row.manga_id ?? "invalid"}`}>
                          <td className="mono">{row.manga_id ?? "-"}</td>
                          <td>{row.title || row.raw}</td>
                          <td>{row.pic_count || row.page_count || "-"}</td>
                          <td><StatusBadge status={row.status} /></td>
                          <td>{row.source}</td>
                        </tr>
                      ))}
                      {parsedRows.length === 0 && (
                        <tr>
                          <td colSpan={5}>暂无预检结果</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <aside className="side-stack">
                <section className="panel detail task-focus">
                  <div className="panel-header compact">
                    <div>
                      <span className="eyebrow">当前任务</span>
                      <h2>{selectedTask?.manga_id ?? "未选择"}</h2>
                      <p>{selectedTask ? selectedTask.title || "未写入标题" : "加入队列后会显示任务状态"}</p>
                    </div>
                    {selectedTask && <StatusBadge status={selectedTask.status} />}
                  </div>
                  <div className="detail-body">
                    <div className="cover">
                      <Gauge size={28} />
                    </div>
                    <div>
                      <h3>{selectedTask?.title || selectedTask?.manga_id || "等待任务"}</h3>
                      <p>
                        {selectedTask
                          ? `${stageLabel(selectedTask.stage)} · ${selectedTask.source}`
                          : "先解析输入，再把可用项加入队列"}
                      </p>
                    </div>
                  </div>
                  <div className="detail-progress">
                    <ProgressBar
                      value={
                        selectedTask && selectedTask.progress_total > 0
                          ? selectedTask.progress_current / selectedTask.progress_total
                          : 0
                      }
                    />
                    <span>
                      {selectedTask?.progress_current ?? 0}/{selectedTask?.progress_total ?? 0}
                    </span>
                  </div>
                  <div className="detail-grid">
                    <Info label="任务 ID" value={selectedTask?.task_id ?? "-"} />
                    <Info label="重试" value={String(selectedTask?.retry_count ?? 0)} />
                    <Info label="创建时间" value={formatTime(selectedTask?.created_at)} />
                    <Info label="更新时间" value={formatTime(selectedTask?.updated_at)} />
                  </div>
                  {selectedTask?.last_error && (
                    <div className="notice danger">
                      <AlertTriangle size={16} />
                      <span>{selectedTask.last_error}</span>
                    </div>
                  )}
                  <div className="task-actions">
                    <button
                      className="button secondary"
                      disabled={!selectedTask || !canPause(selectedTask) || loading}
                      onClick={() => controlSelectedTask("pause")}
                    >
                      <Pause size={17} />暂停
                    </button>
                    <button
                      className="button secondary"
                      disabled={!selectedTask || !canResume(selectedTask) || loading}
                      onClick={() => controlSelectedTask("resume")}
                    >
                      <Play size={17} />继续
                    </button>
                    <button
                      className="button secondary danger-button"
                      disabled={!selectedTask || !canCancel(selectedTask) || loading}
                      onClick={() => controlSelectedTask("cancel")}
                    >
                      <XCircle size={17} />取消
                    </button>
                    <button
                      className="button primary"
                      disabled={!selectedTask || !canRetry(selectedTask) || loading}
                      onClick={retrySelectedTask}
                    >
                      <RotateCcw size={17} />重试
                    </button>
                  </div>
                </section>

                <section className="panel compact-list">
                  <div className="panel-header compact">
                    <div>
                      <span className="eyebrow">最近队列</span>
                      <h2>任务概览</h2>
                    </div>
                    <button className="icon-button" title="查看下载队列" onClick={() => setActiveView("queue")}>
                      <ArrowRight size={16} />
                    </button>
                  </div>
                  <div className="mini-task-list">
                    {tasks.slice(0, 5).map((task) => (
                      <button
                        className="mini-task"
                        key={task.task_id}
                        onClick={() => {
                          setSelectedTaskId(task.task_id);
                          setActiveView("queue");
                        }}
                      >
                        <span className="mono">{task.manga_id}</span>
                        <strong>{stageLabel(task.stage)}</strong>
                        <StatusBadge status={task.status} />
                      </button>
                    ))}
                    {tasks.length === 0 && <p className="empty-copy">暂无队列任务</p>}
                  </div>
                </section>
              </aside>
            </div>
          )}

          {activeView === "queue" && (
            <div className="queue-grid">
              <section className="panel task-list-panel">
                <div className="panel-header">
                  <div>
                    <span className="eyebrow">队列管理</span>
                    <h2>任务列表</h2>
                    <p>点击任务可查看进度、错误和恢复操作</p>
                  </div>
                  <button className="button secondary" onClick={refreshTasks} disabled={loading}>
                    <RefreshCw size={16} />刷新队列
                  </button>
                </div>
                <div className="segment-group" role="tablist" aria-label="任务状态过滤">
                  {queueFilters.map((filter) => (
                    <button
                      key={filter.key}
                      className={`segment ${taskFilter === filter.key ? "active" : ""}`}
                      onClick={() => setTaskFilter(filter.key)}
                    >
                      {filter.label}
                      <span>{queueCounts[filter.key]}</span>
                    </button>
                  ))}
                </div>
                <div className="table-wrap">
                  <table className="task-table">
                    <thead>
                      <tr>
                        <th>任务</th>
                        <th>阶段</th>
                        <th>进度</th>
                        <th>状态</th>
                        <th>来源</th>
                        <th>更新时间</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTasks.map((task) => (
                        <tr
                          key={task.task_id}
                          className={task.task_id === selectedTask?.task_id ? "selected-row" : ""}
                          onClick={() => setSelectedTaskId(task.task_id)}
                        >
                          <td>
                            <div className="row-title">
                              <strong>{task.title || task.manga_id}</strong>
                              <span className="mono">{task.manga_id}</span>
                            </div>
                          </td>
                          <td>{stageLabel(task.stage)}</td>
                          <td className="progress-cell">
                            <ProgressBar
                              value={
                                task.progress_total > 0
                                  ? task.progress_current / task.progress_total
                                  : 0
                              }
                            />
                            <span>{task.progress_current}/{task.progress_total}</span>
                          </td>
                          <td><StatusBadge status={task.status} /></td>
                          <td>{task.source}</td>
                          <td>{formatTime(task.updated_at)}</td>
                          <td>
                            <div className="row-actions">
                              <button
                                className="icon-button"
                                title="暂停"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void controlTask(task, "pause");
                                }}
                                disabled={!canPause(task) || loading}
                              >
                                <Pause size={15} />
                              </button>
                              <button
                                className="icon-button"
                                title="继续"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void controlTask(task, "resume");
                                }}
                                disabled={!canResume(task) || loading}
                              >
                                <Play size={15} />
                              </button>
                              <button
                                className="icon-button"
                                title="重试"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void retryTask(task);
                                }}
                                disabled={!canRetry(task) || loading}
                              >
                                <RotateCcw size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredTasks.length === 0 && (
                        <tr>
                          <td colSpan={7}>当前分类暂无任务</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <aside className="panel detail queue-detail">
                <div className="panel-header compact">
                  <div>
                    <span className="eyebrow">任务详情</span>
                    <h2>{selectedTask?.manga_id ?? "未选择"}</h2>
                    <p>{selectedTask ? selectedTask.title || "未写入标题" : "从左侧选择一个任务"}</p>
                  </div>
                  {selectedTask && <StatusBadge status={selectedTask.status} />}
                </div>
                <div className="detail-grid">
                  <Info label="阶段" value={selectedTask ? stageLabel(selectedTask.stage) : "-"} />
                  <Info label="进度" value={`${selectedTask?.progress_current ?? 0} / ${selectedTask?.progress_total ?? 0}`} />
                  <Info label="来源" value={selectedTask?.source ?? "-"} />
                  <Info label="更新时间" value={formatTime(selectedTask?.updated_at)} />
                </div>
                <div className="task-actions">
                  <button
                    className="button secondary"
                    disabled={!selectedTask || !canPause(selectedTask) || loading}
                    onClick={() => controlSelectedTask("pause")}
                  >
                    <Pause size={17} />暂停
                  </button>
                  <button
                    className="button secondary"
                    disabled={!selectedTask || !canResume(selectedTask) || loading}
                    onClick={() => controlSelectedTask("resume")}
                  >
                    <Play size={17} />继续
                  </button>
                  <button
                    className="button secondary danger-button"
                    disabled={!selectedTask || !canCancel(selectedTask) || loading}
                    onClick={() => controlSelectedTask("cancel")}
                  >
                    <XCircle size={17} />取消
                  </button>
                  <button
                    className="button primary"
                    disabled={!selectedTask || !canRetry(selectedTask) || loading}
                    onClick={retrySelectedTask}
                  >
                    <RotateCcw size={17} />重试
                  </button>
                </div>
                {selectedTask?.last_error && (
                  <div className="notice danger">
                    <AlertTriangle size={16} />
                    <span>{selectedTask.last_error}</span>
                  </div>
                )}
              </aside>
            </div>
          )}

          {activeView === "library" && (
            <div className="library-layout">
              <section className="panel library-panel">
                <div className="panel-header">
                  <div>
                    <span className="eyebrow">本地归档</span>
                    <h2>资料库</h2>
                    <p>按完整度、ZIP 状态和问题文件组织内容</p>
                  </div>
                  <button className="button secondary" onClick={refreshLibrary} disabled={loading}>
                    <BookOpen size={16} />刷新资料库
                  </button>
                </div>
                <div className="segment-group" role="tablist" aria-label="资料库状态过滤">
                  {libraryFilters.map((filter) => (
                    <button
                      key={filter.key}
                      className={`segment ${libraryFilter === filter.key ? "active" : ""}`}
                      onClick={() => setLibraryFilter(filter.key)}
                    >
                      {filter.label}
                      <span>{libraryCounts[filter.key]}</span>
                    </button>
                  ))}
                </div>
                <div className="library-grid">
                  {filteredLibraryItems.map((item) => (
                    <article
                      key={item.manga_id}
                      className={`library-card ${item.manga_id === selectedLibraryId ? "selected" : ""}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => void openLibraryDetail(item)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          void openLibraryDetail(item);
                        }
                      }}
                    >
                      <div className="library-cover">
                        <BookOpen size={26} />
                      </div>
                      <div className="library-card-body">
                        <div className="library-card-title">
                          <span className="mono">{item.manga_id}</span>
                          <StatusBadge status={item.status} />
                        </div>
                        <h3>{item.title || item.manga_id}</h3>
                        <div className="library-progress-row">
                          <ProgressBar value={item.completeness} />
                          <strong>{Math.round(item.completeness * 100)}%</strong>
                        </div>
                        <div className="library-meta">
                          <span>{item.valid_files}/{item.total_files} 文件</span>
                          <span>{item.zip_exists ? formatBytes(item.zip_size) : "未生成 ZIP"}</span>
                          {item.missing_files > 0 && <span>缺 {item.missing_files}</span>}
                        </div>
                        <div className="row-actions">
                          <button
                            className="icon-button"
                            title="查看文件"
                            onClick={(event) => {
                              event.stopPropagation();
                              void openLibraryDetail(item);
                            }}
                            disabled={libraryDetailLoading}
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            className="icon-button"
                            title="重新校验"
                            onClick={(event) => {
                              event.stopPropagation();
                              void verifyLibraryItem(item);
                            }}
                            disabled={loading}
                          >
                            <ShieldCheck size={15} />
                          </button>
                          <button
                            className="icon-button"
                            title="重新打包"
                            onClick={(event) => {
                              event.stopPropagation();
                              void zipLibraryItem(item);
                            }}
                            disabled={loading || item.total_files === 0}
                          >
                            <Archive size={15} />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                  {filteredLibraryItems.length === 0 && (
                    <div className="empty-state">
                      <HardDrive size={28} />
                      <strong>当前分类暂无资料</strong>
                      <p>完成下载或校验后，条目会出现在这里。</p>
                    </div>
                  )}
                </div>
              </section>

              {selectedLibraryItem && (
                <section className="panel library-detail-panel">
                <div className="library-detail-header">
                  <div>
                    <span className="caption">文件明细</span>
                    <h3>{selectedLibraryItem.title || selectedLibraryItem.manga_id}</h3>
                    <p>
                      {selectedLibraryItem.manga_id} · {selectedLibraryItem.valid_files}/
                      {selectedLibraryItem.total_files} 有效
                    </p>
                  </div>
                  <div className="header-actions">
                    <label className="filter-toggle">
                      <input
                        type="checkbox"
                        checked={showOnlyProblemFiles}
                        onChange={(event) => setShowOnlyProblemFiles(event.target.checked)}
                      />
                      <ListFilter size={15} />
                      <span>只看问题</span>
                    </label>
                    <button
                      className="button secondary"
                      onClick={() => void loadLibraryDetail(selectedLibraryItem.manga_id)}
                      disabled={libraryDetailLoading}
                    >
                      <RefreshCw size={16} />刷新明细
                    </button>
                    <button
                      className="button secondary"
                      onClick={() => void verifyLibraryItem(selectedLibraryItem)}
                      disabled={loading}
                    >
                      <ShieldCheck size={16} />校验
                    </button>
                    <button
                      className="button secondary"
                      onClick={() => void retryFailedLibraryFiles(selectedLibraryItem)}
                      disabled={loading || selectedProblemFileCount === 0}
                    >
                      <RotateCcw size={16} />重试问题
                    </button>
                    <button
                      className="button primary"
                      onClick={() => void zipLibraryItem(selectedLibraryItem)}
                      disabled={loading || selectedLibraryItem.total_files === 0}
                    >
                      <Archive size={16} />打包
                    </button>
                  </div>
                </div>
                <div className="detail-grid library-summary-grid">
                  <Info label="完整度" value={`${Math.round(selectedLibraryItem.completeness * 100)}%`} />
                  <Info label="缺失" value={String(selectedLibraryItem.missing_files)} />
                  <Info label="失败/损坏" value={String(selectedLibraryItem.failed_files)} />
                  <Info label="问题文件" value={String(selectedProblemFileCount)} />
                </div>
                <div className="path-row">
                  <FolderOpen size={16} />
                  <span>{selectedLibraryItem.download_dir}</span>
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
                      {selectedLibraryFiles.map((file) => (
                        <tr key={`${selectedLibraryItem.manga_id}-${file.pic_index}`}>
                          <td className="mono">{file.pic_index}</td>
                          <td className="wrap-cell file-name-cell">
                            <div className="file-meta">
                              <strong><FileText size={14} />{file.file_name}</strong>
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
                      {selectedLibraryFiles.length === 0 && (
                        <tr>
                          <td colSpan={6}>
                            {showOnlyProblemFiles ? "当前没有问题文件" : "暂无文件明细"}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                </section>
              )}
            </div>
          )}

          {activeView === "logs" && (
            <section className="panel logs-panel">
              <div className="panel-header">
                <div>
                  <span className="eyebrow">诊断</span>
                  <h2>日志</h2>
                  <p>失败原因、阶段变化和修复结果会写入 SQLite</p>
                </div>
                <button className="button secondary" onClick={refreshLogs} disabled={loading}>
                  <RefreshCw size={16} />刷新日志
                </button>
              </div>
              <div className="summary-strip">
                <MiniStat label="全部" value={String(logCounts.total)} />
                <MiniStat label="警告" value={String(logCounts.warning)} />
                <MiniStat label="错误" value={String(logCounts.error)} />
              </div>
              <div className="table-wrap">
                <table className="logs-table">
                  <thead>
                    <tr>
                      <th>时间</th>
                      <th>级别</th>
                      <th>ID</th>
                      <th>阶段</th>
                      <th>事件</th>
                      <th>信息</th>
                      <th>任务</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogItems.map((item) => (
                      <tr key={item.id}>
                        <td>{formatTime(item.created_at)}</td>
                        <td><LogLevelBadge level={item.level} /></td>
                        <td className="mono">{item.manga_id ?? "-"}</td>
                        <td>{item.stage ? stageLabel(item.stage) : "-"}</td>
                        <td className="mono">{item.event}</td>
                        <td className="log-message">
                          <strong>{formatLogMessage(item)}</strong>
                          {Object.keys(item.details).length > 0 && (
                            <span>{formatLogDetails(item.details)}</span>
                          )}
                        </td>
                        <td className="mono">{item.task_id ?? "-"}</td>
                      </tr>
                    ))}
                    {filteredLogItems.length === 0 && (
                      <tr>
                        <td colSpan={7}>暂无日志</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeView === "settings" && (
            <section className="panel settings-panel">
              <div className="panel-header">
                <div>
                  <span className="eyebrow">系统配置</span>
                  <h2>下载与扩展</h2>
                  <p>{config ? `配置文件 ${config.config_path}` : "读取后台配置"}</p>
                </div>
                <button className="button secondary" onClick={refreshConfig} disabled={loading}>
                  <Settings size={16} />刷新设置
                </button>
              </div>
              {config ? (
                <div className="settings-layout">
                  <section className="settings-section wide">
                    <div className="settings-section-title">
                      <HardDrive size={18} />
                      <div>
                        <h3>下载存储</h3>
                        <p>控制文件落盘、并发、延迟和 ZIP 打包</p>
                      </div>
                    </div>
                    <div className="settings-form-grid">
                      <label className="field wide">
                        <span>下载目录</span>
                        <input
                          value={config.download_path}
                          onChange={(event) => updateConfig({ download_path: event.target.value })}
                        />
                      </label>
                      <label className="field">
                        <span>图片并发</span>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={config.max_thread}
                          onChange={(event) => updateConfig({ max_thread: Number(event.target.value) })}
                        />
                      </label>
                      <label className="field">
                        <span>请求间隔 ms</span>
                        <input
                          type="number"
                          min={0}
                          max={10000}
                          value={config.request_delay_ms}
                          onChange={(event) =>
                            updateConfig({ request_delay_ms: Number(event.target.value) })
                          }
                        />
                      </label>
                      <label className="field">
                        <span>超时秒数</span>
                        <input
                          type="number"
                          min={5}
                          max={120}
                          value={config.timeout_seconds}
                          onChange={(event) =>
                            updateConfig({ timeout_seconds: Number(event.target.value) })
                          }
                        />
                      </label>
                      <label className="toggle-field">
                        <input
                          type="checkbox"
                          checked={config.is_zip}
                          onChange={(event) => updateConfig({ is_zip: event.target.checked })}
                        />
                        <span>下载完成后生成 ZIP</span>
                      </label>
                    </div>
                  </section>

                  <section className="settings-section">
                    <div className="settings-section-title">
                      <Network size={18} />
                      <div>
                        <h3>代理</h3>
                        <p>按需接入代理访问源站</p>
                      </div>
                    </div>
                    <div className="settings-form-grid compact">
                      <label className="toggle-field full-row">
                        <input
                          type="checkbox"
                          checked={config.proxy.is_proxy}
                          onChange={(event) =>
                            updateProxy({ is_proxy: event.target.checked })
                          }
                        />
                        <span>启用代理</span>
                      </label>
                      <label className="field">
                        <span>代理地址</span>
                        <input
                          value={config.proxy.address}
                          onChange={(event) => updateProxy({ address: event.target.value })}
                        />
                      </label>
                      <label className="field">
                        <span>代理端口</span>
                        <input
                          type="number"
                          min={1}
                          max={65535}
                          value={config.proxy.port}
                          onChange={(event) => updateProxy({ port: Number(event.target.value) })}
                        />
                      </label>
                      <label className="field">
                        <span>代理账号</span>
                        <input
                          value={config.proxy.username}
                          onChange={(event) => updateProxy({ username: event.target.value })}
                        />
                      </label>
                      <label className="field">
                        <span>代理密码</span>
                        <input
                          type="password"
                          value={config.proxy.password}
                          onChange={(event) => updateProxy({ password: event.target.value })}
                        />
                      </label>
                    </div>
                  </section>

                  <section className="settings-section">
                    <div className="settings-section-title">
                      <Server size={18} />
                      <div>
                        <h3>浏览器扩展</h3>
                        <p>管理后台与扩展之间的访问 Token</p>
                      </div>
                    </div>
                    <div className="settings-form-grid compact">
                      <label className="field full-row">
                        <span>扩展 Token</span>
                        <input
                          value={config.extension_token}
                          placeholder={config.extension_token_set ? "已设置" : "未设置"}
                          onChange={(event) => updateConfig({ extension_token: event.target.value })}
                        />
                      </label>
                      <div className="settings-actions full-row">
                        <button className="button secondary" onClick={generateExtensionToken} disabled={loading}>
                          <ShieldCheck size={16} />生成 Token
                        </button>
                        <button className="button primary" onClick={saveConfig} disabled={loading}>
                          <CheckCircle2 size={16} />保存设置
                        </button>
                      </div>
                    </div>
                  </section>
                </div>
              ) : (
                <div className="settings-empty">暂无配置</div>
              )}
            </section>
          )}
        </section>
      </main>
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  Icon,
  tone
}: {
  label: string;
  value: string;
  detail: string;
  Icon: IconComponent;
  tone: "indigo" | "blue" | "green" | "orange";
}) {
  return (
    <article className={`metric ${tone}`}>
      <div className="metric-icon">
        <Icon size={19} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
    </article>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="mini-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="info">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  const width = `${Math.min(Math.max(value, 0), 1) * 100}%`;
  return (
    <div className="progress-bar">
      <span style={{ width }} />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const labelMap: Record<string, string> = {
    ready: "可加入",
    valid: "有效",
    running: "队列中",
    exists: "已存在",
    partial: "部分完成",
    failed: "失败",
    invalid: "无效",
    missing: "缺失",
    pending: "待确认",
    queued: "排队中",
    paused: "暂停",
    completed: "已完成",
    cancelled: "已取消"
  };
  const className =
    status === "partial"
      ? "warning"
      : ["failed", "invalid", "missing", "cancelled"].includes(status)
        ? "danger"
        : ["exists", "completed", "valid"].includes(status)
          ? "success"
          : "";
  return <span className={`status ${className}`}>{labelMap[status] ?? status}</span>;
}

function LogLevelBadge({ level }: { level: string }) {
  const className =
    level === "error" ? "danger" : level === "warning" ? "warning" : "success";
  const labelMap: Record<string, string> = {
    info: "信息",
    warning: "警告",
    error: "错误"
  };
  return <span className={`status ${className}`}>{labelMap[level] ?? level}</span>;
}

function isProblemFile(file: LibraryFile) {
  return file.status !== "valid";
}

function canPause(task: Task) {
  return ["queued", "running"].includes(task.status);
}

function canResume(task: Task) {
  return ["pending", "paused"].includes(task.status);
}

function canCancel(task: Task) {
  return ["pending", "queued", "running", "paused"].includes(task.status);
}

function canRetry(task: Task) {
  return ["failed", "partial", "completed", "cancelled"].includes(task.status);
}

function updateTaskProgress(tasks: Task[], payload: TaskProgressMessage) {
  let matched = false;
  const updated = tasks.map((task) => {
    if (task.task_id !== payload.task_id) {
      return task;
    }
    matched = true;
    return {
      ...task,
      status: payload.status,
      stage: payload.stage,
      progress_current: payload.current,
      progress_total: payload.total,
      last_error: payload.message,
      updated_at: new Date().toISOString()
    };
  });
  return matched
    ? updated
    : [
        {
          id: payload.task_id,
          task_id: payload.task_id,
          manga_id: payload.manga_id,
          title: "",
          source: "websocket",
          status: payload.status,
          stage: payload.stage,
          progress_current: payload.current,
          progress_total: payload.total,
          retry_count: 0,
          last_error: payload.message,
          created_at: null,
          updated_at: new Date().toISOString()
        },
        ...tasks
      ];
}

function stageLabel(stage: string) {
  const labelMap: Record<string, string> = {
    none: "等待",
    fetching_info: "获取信息",
    fetching_pages: "获取目录",
    resolving_images: "解析图片",
    downloading: "下载",
    retrying_failed_images: "修复图片",
    verifying: "校验",
    zipping: "打包",
    done: "完成"
  };
  return labelMap[stage] ?? stage;
}

function formatTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return TIME_FORMATTER.format(date);
}

const TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
});

function formatBytes(value: number) {
  if (value <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const size = value / 1024 ** index;
  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatLogDetails(details: Record<string, unknown>) {
  return Object.entries(details)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ");
}

function formatLogMessage(item: LogItem) {
  const message = item.message.trim();
  if (message) {
    return message;
  }
  const labelMap: Record<string, string> = {
    task_failed: "任务失败，但异常没有返回文本",
    retry_failed_images_failed: "问题图片修复失败，但异常没有返回文本",
    image_download_failed: "图片下载失败，但异常没有返回文本",
    problem_image_retry_failed: "问题图片重试失败，但异常没有返回文本"
  };
  return labelMap[item.event] ?? "无错误信息";
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
