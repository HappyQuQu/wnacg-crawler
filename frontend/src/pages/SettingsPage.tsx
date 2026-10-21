import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle, Archive, ArrowRight, Check, CheckCircle2, ChevronRight, Copy,
  Eye, EyeOff, HardDrive, Image, KeyRound, Monitor, Moon, Network,
  RefreshCw, RotateCcw, Save, Search, ShieldCheck, Sun, Trash2, type LucideIcon,
} from "lucide-react";
import type { AppConfig, ThemePreference, WsStatus } from "../types";
import { configFields, validateConfig, type ConfigErrors, type ConfigPath } from "../configUtils";
import { Skeleton } from "../components/Skeleton";
import { useToast } from "../components/Toast";

const sections = [
  { id: "appearance", label: "外观与显示", description: "主题与本机封面显示偏好", keywords: "theme appearance 隐私 无图 模糊 封面", Icon: Monitor },
  { id: "download", label: "下载与存储", description: "文件位置、下载节奏与自动归档", keywords: "download zip 并发 请求 间隔 超时 目录 打包", Icon: HardDrive },
  { id: "compression", label: "图片压缩", description: "新下载图片的大小与原图保留", keywords: "image compression kb 分辨率 质量 原图", Icon: Image },
  { id: "network", label: "网络代理", description: "源站访问方式与代理认证", keywords: "proxy 端口 地址 账号 密码", Icon: Network },
  { id: "extension", label: "浏览器扩展", description: "后台地址与扩展访问 Token", keywords: "token extension 配对 令牌 生成 复制", Icon: KeyRound },
] as const;
const themes: { value: ThemePreference; label: string; Icon: LucideIcon }[] = [
  { value: "light", label: "浅色", Icon: Sun }, { value: "dark", label: "深色", Icon: Moon }, { value: "system", label: "跟随系统", Icon: Monitor },
];
type DirtyField = typeof configFields[number];

export function SettingsPage({
  config, savedConfig, loading, initialLoading, loadError, saveError, saveFeedback,
  dirtyFields, noImageMode, wsStatus, searchQuery, onClearSearch, onRefresh,
  onSave, onDiscard, onGenerateToken, onToggleNoImage, updateConfig, updateProxy,
}: {
  config: AppConfig | null;
  savedConfig: AppConfig | null;
  loading: boolean;
  initialLoading: boolean;
  loadError: string;
  saveError: string;
  saveFeedback: { message: string; overridden: string[] } | null;
  dirtyFields: DirtyField[];
  noImageMode: boolean;
  wsStatus: WsStatus;
  searchQuery: string;
  onClearSearch: () => void;
  onRefresh: () => Promise<void>;
  onSave: () => Promise<void>;
  onDiscard: () => void;
  onGenerateToken: () => Promise<void>;
  onToggleNoImage: (value: boolean) => void;
  updateConfig: (patch: Partial<AppConfig>) => void;
  updateProxy: (patch: Partial<AppConfig["proxy"]>) => void;
}) {
  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied] = useState<"address" | "token" | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { showToast } = useToast();
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);
  const errors: ConfigErrors = config ? validateConfig(config) : {};
  const errorKeys = Object.keys(errors) as ConfigPath[];
  const dirty = dirtyFields.length > 0;
  const canSave = !!config && dirty && !loading && !errorKeys.length;
  const query = searchQuery.trim().toLowerCase();
  const visible = new Set(sections.filter((section) => !query || [section.label, section.description, section.keywords, ...configFields.filter((field) => field.section === section.id).map((field) => field.label)].some((value) => value.toLowerCase().includes(query))).map((section) => section.id));
  const backendUrl = window.location.origin;
  const summary = savedConfig;
  const summaryCards = [
    { label: "图片并发", value: summary ? `${summary.max_thread} 线程` : "—", detail: summary ? `间隔 ${summary.request_delay_ms} ms · 超时 ${summary.timeout_seconds} 秒` : "正在读取…", Icon: HardDrive, section: "download", tone: "blue" },
    { label: "ZIP 归档", value: summary ? summary.is_zip ? "自动打包" : "未开启" : "—", detail: "下载完成后的归档方式", Icon: Archive, section: "download", tone: "green" },
    { label: "网络代理", value: summary ? summary.proxy.is_proxy ? "已启用" : "未启用" : "—", detail: summary?.proxy.is_proxy ? `${summary.proxy.address}:${summary.proxy.port}` : "直接访问源站", Icon: Network, section: "network", tone: "neutral" },
    { label: "扩展访问", value: summary ? summary.extension_token_set ? "已配置" : "未配置" : "—", detail: summary?.extension_token_set ? "后台已保存扩展 Token" : "可在下方生成访问 Token", Icon: KeyRound, section: "extension", tone: summary?.extension_token_set ? "green" : "neutral" },
  ];
  const saveStatus = errorKeys.length ? `请修正 ${errorKeys.length} 项设置` : saveError ? "保存失败，可重试" : dirty ? `${dirtyFields.length} 项更改尚未保存` : saveFeedback ? "配置已更新" : "与后台配置一致";

  function jumpTo(section: string) {
    onClearSearch();
    requestAnimationFrame(() => {
      const element = document.getElementById(`preferences-${section}`);
      element?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      element?.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true });
    });
  }
  async function copy(value: string, target: "address" | "token") {
    try {
      await navigator.clipboard.writeText(value);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      setCopied(target);
      copyTimer.current = setTimeout(() => setCopied(null), 1800);
    } catch { showToast("复制失败，请手动选择内容复制", "error"); }
  }
  function save() { if (canSave) void onSave(); }
  const saveButton = <button type="button" className="button primary" disabled={!canSave} onClick={save}><Save size={15} />{loading ? "处理中…" : "保存更改"}</button>;

  return <div className="preferences-workbench" aria-busy={initialLoading}>
    <header className="overview-heading"><div><div className="overview-heading-topline"><h2>设置</h2><span className={`overview-connection ${wsStatus === "connected" ? "live" : ""}`}><span />{wsStatus === "connected" ? "实时同步" : wsStatus === "connecting" ? "正在连接" : "定时刷新"}</span></div><p>调整下载与界面偏好，保存后由后台热重载生效。</p></div><div className="overview-heading-actions"><button type="button" className="button secondary overview-refresh" aria-label="刷新设置" title="重新读取后台配置，保留未保存的编辑" disabled={loading} onClick={() => void onRefresh()}><RefreshCw size={16} className={loading ? "spin" : ""} /></button>{saveButton}</div></header>
    <section className="overview-metrics preferences-metrics" aria-label="当前生效配置">{summaryCards.map(({ label, value, detail, Icon, section, tone }) => <button type="button" key={label} className={`overview-metric ${tone}`} disabled={!config || initialLoading} onClick={() => jumpTo(section)} aria-label={`${label} ${initialLoading ? "加载中" : value}`}><div className="overview-metric-top"><span>{label}</span><Icon size={17} /></div>{initialLoading ? <Skeleton width="80px" height="30px" borderRadius="5px" /> : <strong>{value}</strong>}<div className="overview-metric-bottom"><span title={detail}>{detail}</span><ArrowRight size={14} /></div></button>)}</section>
    {loadError && <div className="preferences-notice warning" role="alert"><AlertTriangle size={17} /><div><strong>读取配置失败</strong><p>{config ? "当前保留已读取的配置和未保存编辑。" : "暂时无法读取后台配置。"}{loadError}</p></div><button type="button" className="button secondary" disabled={loading} onClick={() => void onRefresh()}><RefreshCw size={14} />重试</button></div>}
    {saveError && <div className="preferences-notice preferences-save-notice" role="alert"><AlertTriangle size={17} /><div><strong>保存失败，更改已保留</strong><p>{saveError}。请重试保存。</p></div></div>}
    {saveFeedback && saveFeedback.overridden.length > 0 && <div className="preferences-notice warning" role="status"><AlertTriangle size={17} /><div><strong>部分设置仍由环境变量控制</strong><p>本次保存后，{saveFeedback.overridden.map((key) => configFields.find((field) => field.key === key)?.label || (key === "proxy" ? "网络代理" : key)).join("、")}继续使用环境配置。表单已显示实际生效值。</p></div></div>}
    {config ? <div className="preferences-workspace">
      <form id="preferences-form" className="preferences-panels" noValidate onSubmit={(event) => { event.preventDefault(); save(); }}>
        <fieldset className="preferences-form-fields" disabled={loading}>
          {visible.has("appearance") && <PreferenceSection section="appearance" title="外观与显示" description="主题立即预览，保存后保留偏好。" Icon={Monitor}>
            <fieldset className="preferences-theme-options" aria-label="界面主题"><legend className="sr-only">界面主题</legend>{themes.map(({ value, label, Icon }) => <label className={`preferences-theme ${value}`} key={value}><input type="radio" name="theme" value={value} checked={config.theme === value} onChange={() => updateConfig({ theme: value })} /><span><span className={`preferences-theme-preview ${value}`} aria-hidden="true"><span /><span><i /><i /><i /></span></span><span><Icon size={14} />{label}{config.theme === value && <CheckCircle2 size={14} />}</span></span></label>)}</fieldset>
            <Toggle label="模糊封面" description="此浏览器立即生效；封面模糊显示，不影响下载文件。" checked={noImageMode} onChange={onToggleNoImage} badge="本机偏好" />
          </PreferenceSection>}
          {visible.has("download") && <PreferenceSection section="download" title="下载与存储" description="设置保存位置、图片并发与请求节奏。" Icon={HardDrive}>
            <ConfigInput label="下载目录" id="download_path" value={config.download_path} error={errors.download_path} onChange={(value) => updateConfig({ download_path: value })} hint="这是后台使用的路径。Docker 部署请填写容器内目录。" />
            <div className="preferences-number-grid"><ConfigInput label="图片并发" id="max_thread" value={config.max_thread} type="number" min={1} max={20} unit="线程" error={errors.max_thread} onChange={(value) => updateConfig({ max_thread: Number(value) })} hint="1–20 个图片请求" /><ConfigInput label="请求间隔" id="request_delay_ms" value={config.request_delay_ms} type="number" min={0} max={10000} unit="ms" error={errors.request_delay_ms} onChange={(value) => updateConfig({ request_delay_ms: Number(value) })} hint="0–10000 毫秒" /><ConfigInput label="请求超时" id="timeout_seconds" value={config.timeout_seconds} type="number" min={5} max={120} unit="秒" error={errors.timeout_seconds} onChange={(value) => updateConfig({ timeout_seconds: Number(value) })} hint="5–120 秒" /></div>
            <Toggle label="自动打包 ZIP" description="完成下载与完整性检查后，生成此作品的独立归档。" checked={config.is_zip} onChange={(value) => updateConfig({ is_zip: value })} />
          </PreferenceSection>}
          {visible.has("compression") && <PreferenceSection section="compression" title="图片压缩" description="仅处理新下载图片，按需控制单张文件大小。" Icon={Image}>
            <Toggle label="启用图片压缩" description="优先调整编码质量；处理失败时保存原图。" checked={config.enable_image_compression} onChange={(value) => updateConfig({ enable_image_compression: value })} />
            <ConfigInput label="每张图片大小上限" id="image_max_size_kb" value={config.image_max_size_kb} type="number" min={1} max={102400} unit="KB" disabled={!config.enable_image_compression && !errors.image_max_size_kb} error={errors.image_max_size_kb} hint="1–102400 KB，无法达到上限时会在日志中提示。" onChange={(value) => updateConfig({ image_max_size_kb: Number(value) })} />
            <Toggle label="保留压缩前的原图" description="发生压缩时，将副本保存在 Original 文件夹。" checked={config.keep_original_images} disabled={!config.enable_image_compression} onChange={(value) => updateConfig({ keep_original_images: value })} />
            <Toggle label="允许缩小分辨率" description="编码质量调整后仍超出上限时，允许缩小图片尺寸。" checked={config.allow_image_resize} disabled={!config.enable_image_compression} onChange={(value) => updateConfig({ allow_image_resize: value })} />
            <p className="preferences-hint">动画保持原样，已有有效文件不会自动重新压缩。</p>
          </PreferenceSection>}
          {visible.has("network") && <PreferenceSection section="network" title="网络代理" description="控制后台访问源站时使用的代理。" Icon={Network}>
            <Toggle label="启用网络代理" description="关闭时由后台直接访问源站。" checked={config.proxy.is_proxy} onChange={(value) => updateProxy({ is_proxy: value })} />
            <div className="preferences-proxy-grid"><ConfigInput label="代理地址" id="proxy.address" value={config.proxy.address} error={errors["proxy.address"]} disabled={!config.proxy.is_proxy} onChange={(value) => updateProxy({ address: value })} hint="主机名或 IP 地址" /><ConfigInput label="代理端口" id="proxy.port" value={config.proxy.port} type="number" min={1} max={65535} disabled={!config.proxy.is_proxy && !errors["proxy.port"]} error={errors["proxy.port"]} onChange={(value) => updateProxy({ port: Number(value) })} hint="1–65535" /></div>
            <details className="preferences-auth"><summary>代理认证（可选）<ChevronRight size={14} /></summary><div className="preferences-two-fields"><ConfigInput label="代理账号" id="proxy.username" value={config.proxy.username} disabled={!config.proxy.is_proxy} onChange={(value) => updateProxy({ username: value })} /><ConfigInput label="代理密码" id="proxy.password" value={config.proxy.password} type="password" disabled={!config.proxy.is_proxy} onChange={(value) => updateProxy({ password: value })} /></div></details>
          </PreferenceSection>}
          {visible.has("extension") && <PreferenceSection section="extension" title="浏览器扩展" description="将后台地址与 Token 填入扩展的连接设置。" Icon={KeyRound}>
            <div className="preferences-field"><label htmlFor="preferences-backend-url">后台地址</label><div className="preferences-secret-row"><input id="preferences-backend-url" value={backendUrl} readOnly /><button type="button" className="icon-button" title="复制后台地址" aria-label="复制后台地址" onClick={() => void copy(backendUrl, "address")}>{copied === "address" ? <Check size={15} /> : <Copy size={15} />}</button></div></div>
            <div className="preferences-field"><div className="preferences-field-heading"><label htmlFor="preferences-extension_token">扩展 Token</label><span className={`preferences-field-badge ${config.extension_token !== savedConfig?.extension_token ? "pending" : !savedConfig?.extension_token_set ? "empty" : ""}`}>{config.extension_token !== savedConfig?.extension_token ? "待保存" : savedConfig?.extension_token_set ? "已配置" : "未配置"}</span></div><div className="preferences-secret-row"><input id="preferences-extension_token" type={showToken ? "text" : "password"} value={config.extension_token} autoComplete="off" spellCheck={false} maxLength={256} placeholder="尚未设置 Token" aria-invalid={!!errors.extension_token} aria-describedby={errors.extension_token ? "preferences-extension_token-error" : undefined} onChange={(event) => updateConfig({ extension_token: event.target.value })} /><button type="button" className="icon-button" title={showToken ? "隐藏扩展 Token" : "显示扩展 Token"} aria-label={showToken ? "隐藏扩展 Token" : "显示扩展 Token"} onClick={() => setShowToken(!showToken)}>{showToken ? <EyeOff size={15} /> : <Eye size={15} />}</button><button type="button" className="icon-button" title="复制扩展 Token" aria-label="复制扩展 Token" disabled={!config.extension_token} onClick={() => void copy(config.extension_token, "token")}>{copied === "token" ? <Check size={15} /> : <Copy size={15} />}</button></div>{errors.extension_token && <span id="preferences-extension_token-error" className="preferences-field-error" role="alert">{errors.extension_token}</span>}</div>
            <div className="preferences-token-actions"><button type="button" className="button secondary" onClick={() => void onGenerateToken()}><ShieldCheck size={14} />生成新 Token</button><button type="button" className="overview-text-link danger-button" disabled={!config.extension_token} onClick={() => updateConfig({ extension_token: "" })}><Trash2 size={14} />清除 Token</button></div>
            <p className="preferences-hint">生成新 Token 会立即保存并替换旧 Token。手动编辑或清除后，请点击“保存更改”。</p>
          </PreferenceSection>}
        </fieldset>
        {!visible.size && <section className="panel overview-empty overview-empty-large"><Search size={28} /><strong>没有匹配的设置</strong><p>试试“代理”“压缩”或“Token”。</p><button type="button" className="button secondary" onClick={onClearSearch}>显示全部设置</button></section>}
      </form>
      <aside className="preferences-side-stack" aria-label="设置导航与保存状态">
        <section className="panel preferences-navigation"><div className="overview-panel-heading"><div><span className="overview-eyebrow">按用途查找</span><h3>设置目录</h3></div><Monitor size={17} /></div><nav aria-label="设置目录">{sections.map(({ id, label, Icon }) => <button type="button" key={id} onClick={() => jumpTo(id)}><Icon size={15} /><span>{label}</span>{dirtyFields.some((field) => field.section === id) ? <span className="preferences-changed-dot" aria-label="有未保存的更改" /> : <ChevronRight size={13} />}</button>)}</nav></section>
        <section className="panel preferences-save-panel" aria-label="保存状态"><div className="overview-panel-heading"><div><span className="overview-eyebrow">后台配置</span><h3>保存状态</h3></div>{dirty || errorKeys.length ? <span className="preferences-unsaved-mark" /> : <CheckCircle2 size={17} className="icon-success" />}</div><div className="preferences-save-body"><strong className={errorKeys.length ? "preferences-invalid" : ""} role="status">{saveStatus}</strong><p>{dirty ? "保存后应用到后台；顶部卡片展示当前生效值。" : "更改配置后，在这里统一保存。"}</p>{dirty && <ul className="preferences-change-list">{dirtyFields.map((field) => <li key={field.key}><button type="button" onClick={() => jumpTo(field.section)}>{errors[field.key] ? <AlertTriangle size={12} /> : <span />}<span>{field.label}</span><ChevronRight size={12} /></button></li>)}</ul>}{errorKeys.length > 0 && <button type="button" className="preferences-error-link" onClick={() => jumpTo(configFields.find((field) => field.key === errorKeys[0])!.section)}>查看需要修正的设置<ArrowRight size={13} /></button>}<div className="preferences-save-actions">{saveButton}<button type="button" className="button secondary" disabled={loading || !dirty} onClick={onDiscard}><RotateCcw size={14} />撤销更改</button></div><p className="preferences-save-note">保存后热重载，无需重启后台。</p></div></section>
        <section className="panel preferences-source"><div><HardDrive size={15} /><strong>配置来源</strong></div><span>{savedConfig?.config_path || config.config_path}</span><p>模糊封面仅保存在当前浏览器，其余设置保存到后台。</p></section>
      </aside>
    </div> : initialLoading ? <div className="preferences-loading"><Skeleton width="100%" height="210px" borderRadius="12px" /><Skeleton width="100%" height="310px" borderRadius="12px" /></div> : !loadError && <div className="panel overview-empty overview-empty-large"><HardDrive size={28} /><strong>暂无可用配置</strong><button type="button" className="button secondary" onClick={() => void onRefresh()}>重新读取</button></div>}
    {config && <div className="preferences-mobile-save">{errorKeys.length ? <button type="button" className="preferences-error-link" onClick={() => jumpTo(configFields.find((field) => field.key === errorKeys[0])!.section)}>{saveStatus}<ArrowRight size={13} /></button> : <span role="status">{saveStatus}</span>}<div className="preferences-mobile-actions"><button type="button" className="icon-button" aria-label="撤销未保存更改" title="撤销未保存更改" disabled={loading || !dirty} onClick={onDiscard}><RotateCcw size={15} /></button>{saveButton}</div></div>}
  </div>;
}

function PreferenceSection({ section, title, description, Icon, children }: { section: string; title: string; description: string; Icon: LucideIcon; children: ReactNode }) {
  return <section id={`preferences-${section}`} className="panel preferences-section" aria-labelledby={`preferences-${section}-heading`}><div className="overview-panel-heading"><span className="preferences-section-icon"><Icon size={18} /></span><div><h3 tabIndex={-1} id={`preferences-${section}-heading`}>{title}</h3><p>{description}</p></div></div><div className="preferences-section-body">{children}</div></section>;
}

function Toggle({ label, description, checked, onChange, disabled = false, badge }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; badge?: string }) {
  return <label className={`preferences-toggle ${disabled ? "disabled" : ""}`}><span><span>{label}{badge && <small>{badge}</small>}</span><span>{description}</span></span><input type="checkbox" role="switch" aria-label={label} checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><span className="preferences-switch-track" aria-hidden="true" /></label>;
}

function ConfigInput({ label, id, value, onChange, type = "text", disabled = false, error, hint, min, max, unit }: { label: string; id: string; value: string | number; onChange: (value: string) => void; type?: "text" | "number" | "password"; disabled?: boolean; error?: string; hint?: string; min?: number; max?: number; unit?: string }) {
  return <div className={`preferences-field ${disabled ? "disabled" : ""}`}><label htmlFor={`preferences-${id}`}>{label}</label><div className="preferences-input-wrap"><input id={`preferences-${id}`} value={value} type={type} autoComplete="off" disabled={disabled} min={min} max={max} step={type === "number" ? 1 : undefined} aria-invalid={!!error} aria-describedby={error ? `preferences-${id}-error` : hint ? `preferences-${id}-hint` : undefined} onChange={(event) => onChange(event.target.value)} />{unit && <span>{unit}</span>}</div>{error ? <span id={`preferences-${id}-error`} className="preferences-field-error" role="alert">{error}</span> : hint && <span id={`preferences-${id}-hint`} className="preferences-hint">{hint}</span>}</div>;
}
