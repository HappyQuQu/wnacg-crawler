import {
  CheckCircle2,
  HardDrive,
  Image,
  Network,
  Server,
  Settings,
  ShieldCheck,
} from "lucide-react";
import type { AppConfig } from "../types";

export function SettingsPage({
  config,
  loading,
  noImageMode,
  onRefresh,
  onSave,
  onGenerateToken,
  onToggleNoImage,
  updateConfig,
  updateProxy,
}: {
  config: AppConfig | null;
  loading: boolean;
  noImageMode: boolean;
  onRefresh: () => Promise<void>;
  onSave: () => Promise<void>;
  onGenerateToken: () => Promise<void>;
  onToggleNoImage: (v: boolean) => void;
  updateConfig: (patch: Partial<AppConfig>) => void;
  updateProxy: (patch: Partial<AppConfig["proxy"]>) => void;
}) {
  return (
    <section className="panel settings-panel">
      <div className="panel-header">
        <div>
          <span className="eyebrow">系统配置</span>
          <h2>下载与扩展</h2>
          <p>{config ? `配置文件 ${config.config_path}` : "读取后台配置"}</p>
        </div>
        <button className="button secondary" onClick={() => void onRefresh()} disabled={loading}>
          <Settings size={15} />刷新
        </button>
      </div>
      {config ? (
        <div className="settings-layout">
          <section className="settings-section wide">
            <div className="settings-section-title">
              <HardDrive size={18} />
              <div><h3>下载存储</h3><p>控制文件落盘、并发、延迟和 ZIP 打包</p></div>
            </div>
            <div className="settings-form-grid">
              <label className="field wide">
                <span>下载目录</span>
                <input value={config.download_path} onChange={(e) => updateConfig({ download_path: e.target.value })} />
              </label>
              <label className="field">
                <span>图片并发</span>
                <input type="number" min={1} max={20} value={config.max_thread} onChange={(e) => updateConfig({ max_thread: Number(e.target.value) })} />
              </label>
              <label className="field">
                <span>请求间隔 ms</span>
                <input type="number" min={0} max={10000} value={config.request_delay_ms} onChange={(e) => updateConfig({ request_delay_ms: Number(e.target.value) })} />
              </label>
              <label className="field">
                <span>超时秒数</span>
                <input type="number" min={5} max={120} value={config.timeout_seconds} onChange={(e) => updateConfig({ timeout_seconds: Number(e.target.value) })} />
              </label>
              <label className="toggle-field">
                <input type="checkbox" checked={config.is_zip} onChange={(e) => updateConfig({ is_zip: e.target.checked })} />
                <span>下载完成后生成 ZIP</span>
              </label>
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-title">
              <Image size={18} />
              <div><h3>隐私</h3><p>控制界面中的图片显示</p></div>
            </div>
            <div className="settings-form-grid compact">
              <label className="toggle-field full-row">
                <input
                  type="checkbox"
                  checked={noImageMode}
                  onChange={(e) => onToggleNoImage(e.target.checked)}
                />
                <span>无图模式（模糊封面）</span>
              </label>
              <p className="settings-hint full-row">
                开启后资料库封面将模糊显示，适合在公共场合或屏幕共享时使用。
              </p>
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-title">
              <Network size={18} />
              <div><h3>代理</h3><p>按需接入代理访问源站</p></div>
            </div>
            <div className="settings-form-grid compact">
              <label className="toggle-field full-row">
                <input type="checkbox" checked={config.proxy.is_proxy} onChange={(e) => updateProxy({ is_proxy: e.target.checked })} />
                <span>启用代理</span>
              </label>
              <label className="field"><span>代理地址</span><input value={config.proxy.address} onChange={(e) => updateProxy({ address: e.target.value })} /></label>
              <label className="field"><span>代理端口</span><input type="number" min={1} max={65535} value={config.proxy.port} onChange={(e) => updateProxy({ port: Number(e.target.value) })} /></label>
              <label className="field"><span>代理账号</span><input value={config.proxy.username} onChange={(e) => updateProxy({ username: e.target.value })} /></label>
              <label className="field"><span>代理密码</span><input type="password" value={config.proxy.password} onChange={(e) => updateProxy({ password: e.target.value })} /></label>
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-title">
              <Server size={18} />
              <div><h3>浏览器扩展</h3><p>管理后台与扩展之间的访问 Token</p></div>
            </div>
            <div className="settings-form-grid compact">
              <label className="field full-row">
                <span>扩展 Token</span>
                <input type="password" value={config.extension_token} placeholder={config.extension_token_set ? "已设置" : "未设置"} onChange={(e) => updateConfig({ extension_token: e.target.value })} />
              </label>
              <div className="settings-actions full-row">
                <button className="button secondary" onClick={() => void onGenerateToken()} disabled={loading}><ShieldCheck size={15} />生成 Token</button>
                <button className="button primary" onClick={() => void onSave()} disabled={loading}><CheckCircle2 size={15} />保存设置</button>
              </div>
            </div>
          </section>
        </div>
      ) : (
        <div className="settings-empty">暂无配置</div>
      )}
    </section>
  );
}
