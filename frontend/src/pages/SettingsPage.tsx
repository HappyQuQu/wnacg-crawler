import {
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  HardDrive,
  Image,
  Network,
  Server,
  Settings,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useState } from "react";
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
  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied] = useState(false);
  const compressionLimitInvalid = config !== null && (
    !Number.isInteger(config.image_max_size_kb)
    || config.image_max_size_kb < 1
    || config.image_max_size_kb > 102400
  );

  function copyToken() {
    if (!config?.extension_token) return;
    void navigator.clipboard.writeText(config.extension_token).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {
      // clipboard write failed, ignore
    });
  }
  return (
    <section className="panel settings-panel">
      <div className="panel-header">
        <div>
          <span className="eyebrow">系统配置</span>
          <h2>设置</h2>
          <p>{config ? `配置文件 ${config.config_path}` : "读取后台配置"}</p>
        </div>
        <button className="button secondary" onClick={() => void onRefresh()} disabled={loading}>
          <Settings size={15} />刷新
        </button>
      </div>

      {config ? (
        <div className="settings-stack">
          {/* ---- 下载存储 ---- */}
          <section className="settings-card">
            <div className="settings-card-header">
              <div className="settings-card-icon"><HardDrive size={18} /></div>
              <div>
                <h3>下载存储</h3>
                <p>控制文件落盘、并发、延迟和 ZIP 打包</p>
              </div>
            </div>

            <label className="field">
              <span>下载目录</span>
              <input
                value={config.download_path}
                onChange={(e) => updateConfig({ download_path: e.target.value })}
              />
            </label>

            <div className="settings-row">
              <label className="field">
                <span>图片并发</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={config.max_thread}
                  onChange={(e) => updateConfig({ max_thread: Number(e.target.value) })}
                />
              </label>
              <label className="field">
                <span>请求间隔 (ms)</span>
                <input
                  type="number"
                  min={0}
                  max={10000}
                  value={config.request_delay_ms}
                  onChange={(e) => updateConfig({ request_delay_ms: Number(e.target.value) })}
                />
              </label>
              <label className="field">
                <span>超时 (秒)</span>
                <input
                  type="number"
                  min={5}
                  max={120}
                  value={config.timeout_seconds}
                  onChange={(e) => updateConfig({ timeout_seconds: Number(e.target.value) })}
                />
              </label>
            </div>

            <label className="toggle-field">
              <input
                type="checkbox"
                checked={config.is_zip}
                onChange={(e) => updateConfig({ is_zip: e.target.checked })}
              />
              <span>下载完成后自动打包 ZIP</span>
            </label>
          </section>

          <section className="settings-card">
            <div className="settings-card-header">
              <div className="settings-card-icon"><Image size={18} /></div>
              <div>
                <h3>图片压缩</h3>
                <p>控制新下载图片的大小和原图保留</p>
              </div>
              <label className="toggle-field compact-toggle">
                <input
                  type="checkbox"
                  checked={config.enable_image_compression}
                  disabled={loading}
                  onChange={(e) => updateConfig({ enable_image_compression: e.target.checked })}
                />
                <span>启用压缩</span>
              </label>
            </div>

            <label className="field">
              <span>每张图片大小上限（KB）</span>
              <input
                type="number"
                min={1}
                max={102400}
                step={1}
                value={config.image_max_size_kb}
                disabled={loading || !config.enable_image_compression}
                aria-invalid={compressionLimitInvalid}
                onChange={(e) => updateConfig({ image_max_size_kb: Number(e.target.value) })}
              />
            </label>
            {compressionLimitInvalid && (
              <p className="settings-hint" role="alert">大小上限请输入 1 至 102400 的整数。</p>
            )}

            <label className="toggle-field">
              <input
                type="checkbox"
                checked={config.keep_original_images}
                disabled={loading || !config.enable_image_compression}
                onChange={(e) => updateConfig({ keep_original_images: e.target.checked })}
              />
              <span>保留压缩前的原图</span>
            </label>
            <label className="toggle-field">
              <input
                type="checkbox"
                checked={config.allow_image_resize}
                disabled={loading || !config.enable_image_compression}
                onChange={(e) => updateConfig({ allow_image_resize: e.target.checked })}
              />
              <span>允许缩小分辨率</span>
            </label>
            <p className="settings-hint">
              默认关闭压缩。开启后先降低编码质量，只有允许缩小分辨率时才改变尺寸。
              无法达到上限时保留较小的有效文件并在日志中提示，压缩失败则保存原图。
            </p>
            <p className="settings-hint">
              原图保存在下载目录的 Original 文件夹，仅为发生压缩的图片保留副本。
              动画保持原样，已有有效文件不会自动重压。
            </p>
          </section>

          {/* ---- 网络 & 代理 ---- */}
          <section className="settings-card">
            <div className="settings-card-header">
              <div className="settings-card-icon"><Network size={18} /></div>
              <div>
                <h3>网络代理</h3>
                <p>按需接入代理访问源站</p>
              </div>
              <label className="toggle-field compact-toggle">
                <input
                  type="checkbox"
                  checked={config.proxy.is_proxy}
                  onChange={(e) => updateProxy({ is_proxy: e.target.checked })}
                />
                <span>启用</span>
              </label>
            </div>

            {config.proxy.is_proxy && (
              <div className="settings-row">
                <label className="field grow">
                  <span>代理地址</span>
                  <input
                    value={config.proxy.address}
                    onChange={(e) => updateProxy({ address: e.target.value })}
                  />
                </label>
                <label className="field shrink">
                  <span>端口</span>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={config.proxy.port}
                    onChange={(e) => updateProxy({ port: Number(e.target.value) })}
                  />
                </label>
              </div>
            )}

            {config.proxy.is_proxy && (
              <div className="settings-row">
                <label className="field">
                  <span>账号</span>
                  <input
                    value={config.proxy.username}
                    onChange={(e) => updateProxy({ username: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>密码</span>
                  <input
                    type="password"
                    value={config.proxy.password}
                    onChange={(e) => updateProxy({ password: e.target.value })}
                  />
                </label>
              </div>
            )}
          </section>

          {/* ---- 隐私 ---- */}
          <section className="settings-card">
            <div className="settings-card-header">
              <div className="settings-card-icon"><Image size={18} /></div>
              <div>
                <h3>隐私</h3>
                <p>控制界面中的图片显示</p>
              </div>
              <label className="toggle-field compact-toggle">
                <input
                  type="checkbox"
                  checked={noImageMode}
                  onChange={(e) => onToggleNoImage(e.target.checked)}
                />
                <span>无图模式</span>
              </label>
            </div>
            <p className="settings-hint">
              开启后资料库封面将模糊显示，适合在公共场合或屏幕共享时使用。
            </p>
          </section>

          {/* ---- 浏览器扩展 ---- */}
          <section className="settings-card">
            <div className="settings-card-header">
              <div className="settings-card-icon"><Server size={18} /></div>
              <div>
                <h3>浏览器扩展</h3>
                <p>管理后台与扩展之间的访问 Token</p>
              </div>
            </div>

            <label className="field">
              <span>扩展配置地址（复制到扩展设置）</span>
              <div className="token-input-row">
                <input
                  value={`${window.location.protocol}//${window.location.hostname}:${window.location.port || "8080"}`}
                  readOnly
                  style={{ fontFamily: "monospace", fontSize: "12px" }}
                />
                <button
                  className="button secondary"
                  onClick={() => {
                    void navigator.clipboard.writeText(`${window.location.protocol}//${window.location.hostname}:${window.location.port || "8080"}`).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }).catch(() => {
                      // clipboard write failed, ignore
                    });
                  }}
                  title="复制后台地址"
                >
                  {copied ? <CheckCircle2 size={15} /> : <Copy size={15} />}
                </button>
              </div>
            </label>

            <label className="field">
              <span>扩展 Token</span>
              <div className="token-input-row">
                <input
                  type={showToken ? "text" : "password"}
                  value={config.extension_token}
                  placeholder={config.extension_token_set ? "已设置" : "未设置"}
                  onChange={(e) => updateConfig({ extension_token: e.target.value })}
                />
                <button
                  className="button secondary"
                  onClick={() => setShowToken(!showToken)}
                  title={showToken ? "隐藏" : "显示"}
                >
                  {showToken ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
                <button
                  className="button secondary"
                  onClick={copyToken}
                  disabled={!config.extension_token}
                  title="复制到剪贴板"
                >
                  {copied ? <CheckCircle2 size={15} /> : <Copy size={15} />}
                </button>
                <button
                  className="button secondary"
                  onClick={() => void onGenerateToken()}
                  disabled={loading}
                >
                  <ShieldCheck size={15} />生成
                </button>
                <button
                  className="button secondary danger-button"
                  onClick={() => updateConfig({ extension_token: "" })}
                  disabled={!config.extension_token_set && !config.extension_token}
                  title="清除 Token"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </label>
          </section>

          {/* ---- 保存 ---- */}
          <div className="settings-footer">
            <span className="settings-footer-status">
              {config.extension_token_set ? "✓ Token 已设置" : "⚠ Token 未设置"}
            </span>
            <button
              className="button primary"
              onClick={() => void onSave()}
              disabled={loading || compressionLimitInvalid}
            >
              <CheckCircle2 size={15} />保存所有设置
            </button>
          </div>
        </div>
      ) : (
        <div className="settings-empty">暂无配置</div>
      )}
    </section>
  );
}
