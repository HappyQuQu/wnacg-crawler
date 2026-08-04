import { AlertTriangle, Ban, ShieldAlert, X } from "lucide-react";
import type { BlockAlert } from "../hooks/useBlockAlerts";

const ICONS: Record<string, typeof AlertTriangle> = {
  cloudflare: ShieldAlert,
  rate_limit: Ban,
  access_denied: AlertTriangle,
};

const SEVERITY_CLASS: Record<string, string> = {
  cloudflare: "block-banner-error",
  rate_limit: "block-banner-warning",
  access_denied: "block-banner-error",
};

export function BlockAlertBanner({
  alerts,
  onDismiss,
}: {
  alerts: BlockAlert[];
  onDismiss: (domain: string, block_type: string) => void;
}) {
  if (alerts.length === 0) return null;

  return (
    <div className="block-banner-container">
      {alerts.map((alert) => {
        const Icon = ICONS[alert.block_type] ?? AlertTriangle;
        const cls = SEVERITY_CLASS[alert.block_type] ?? "block-banner-warning";
        return (
          <div key={`${alert.domain}-${alert.block_type}`} className={`block-banner ${cls}`}>
            <div className="block-banner-icon">
              <Icon size={18} />
            </div>
            <div className="block-banner-body">
              <div className="block-banner-title">
                {alert.message}
                <span className="block-banner-domain">{alert.domain}</span>
              </div>
              <div className="block-banner-guidance">{alert.guidance}</div>
            </div>
            <button
              className="block-banner-close"
              onClick={() => onDismiss(alert.domain, alert.block_type)}
              aria-label="关闭"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
