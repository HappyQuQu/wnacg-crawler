import { AlertTriangle, XCircle } from "lucide-react";
import type { ReactNode } from "react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  children?: ReactNode;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "确认",
  variant = "default",
  onConfirm,
  onCancel,
  loading = false,
  children,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="dialog-overlay" onClick={() => { if (!loading) onCancel(); }}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="dialog-header">
          <div className={`dialog-icon ${variant === "danger" ? "danger" : "info"}`}>
            {variant === "danger" ? <XCircle size={20} /> : <AlertTriangle size={20} />}
          </div>
          <h3>{title}</h3>
        </div>
        <p className="dialog-message">{message}</p>
        {children}
        <div className="dialog-actions">
          <button className="button secondary" onClick={onCancel} disabled={loading}>取消</button>
          <button className={`button ${variant === "danger" ? "primary danger-confirm" : "primary"}`} onClick={onConfirm} disabled={loading}>
            {loading ? "处理中…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
