export type ApiResponse<T> = {
  ok: boolean;
  data: T;
  error: unknown;
};

export type ParsedItem = {
  raw: string;
  manga_id: string | null;
  url?: string;
  valid: boolean;
  status: string;
  title: string;
  cover_url: string;
  page_count: number;
  pic_count: number;
  source: string;
  task_id?: string | null;
};

export type ParseResult = {
  items: ParsedItem[];
  summary: {
    total: number;
    valid: number;
    duplicate: number;
    invalid: number;
  };
};

export type Task = {
  id: string;
  task_id: string;
  manga_id: string;
  title: string;
  cover_url: string;
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

export type TaskList = {
  items: Task[];
  total: number;
};

export type LibraryFile = {
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

export type LibraryItem = {
  manga_id: string;
  title: string;
  cover_url: string;
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

export type LibraryList = {
  items: LibraryItem[];
  total: number;
};

export type LibraryRetryFailedResult = {
  status: string;
  problem_files: number;
  task: Task | null;
  library: LibraryItem;
};

export type TaskProgressMessage = {
  type: "task_progress";
  task_id: string;
  manga_id: string;
  title: string;
  cover_url: string;
  status: string;
  stage: string;
  current: number;
  total: number;
  message: string | null;
};

export type SystemAlertMessage = {
  type: "system_alert";
  alert_type: string;
  domain: string;
  block_type: string;
  message: string;
  guidance: string;
  action: "blocked" | "cleared";
  blocked_domains: string[];
};

export type TaskLogMessage = { type: "task_log"; item: LogItem };
export type WsMessage = TaskProgressMessage | SystemAlertMessage | TaskLogMessage;

export type WsStatus = "connecting" | "connected" | "fallback";
export type ViewKey = "dashboard" | "tasks" | "library" | "settings";
export type QueueFilter = "all" | "active" | "failed" | "partial" | "completed";
export type LibraryFilter = "all" | "completed" | "partial" | "failed" | "missing" | "zipped" | "unzipped";
export type LibrarySortKey = "updated_at" | "title" | "completeness" | "pic_count" | "zip_size";
export type LibraryViewMode = "card" | "list";

export type LogItem = {
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

export type LogList = {
  items: LogItem[];
  total: number;
};

export type ThemePreference = "light" | "dark" | "system";

export type AppConfig = {
  theme: ThemePreference;
  download_path: string;
  is_zip: boolean;
  enable_image_compression: boolean;
  image_max_size_kb: number;
  keep_original_images: boolean;
  allow_image_resize: boolean;
  max_thread: number;
  request_delay_ms: number;
  timeout_seconds: number;
  extension_token: string;
  extension_token_set: boolean;
  overridden_fields?: string[];
  config_path: string;
  proxy: {
    is_proxy: boolean;
    address: string;
    port: number;
    username: string;
    password: string;
  };
};
