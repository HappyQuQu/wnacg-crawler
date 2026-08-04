import { useCallback, useState } from "react";
import type { SystemAlertMessage } from "../types";
import { useWsSystemAlert } from "./useWebSocket";

export type BlockAlert = {
  domain: string;
  block_type: string;
  message: string;
  guidance: string;
  first_seen: number;
};

/** Delay between duplicate toasts for the same domain+type (ms). */
const TOAST_DEDUP_MS = 60_000;

const _recentToasts: Map<string, number> = new Map();

function _toastKey(domain: string, block_type: string): string {
  return `${domain}::${block_type}`;
}

/**
 * Manages real-time IP block alerts.
 *
 * - Maintains a list of currently-active block alerts (for the banner).
 * - Shows a toast on each new block event (with dedup).
 * - Shows a toast when a block is cleared.
 */
export function useBlockAlerts(
  showToast: (msg: string, type?: "success" | "error" | "warning" | "info", duration?: number) => void,
) {
  const [alerts, setAlerts] = useState<BlockAlert[]>([]);

  const handleAlert = useCallback((msg: SystemAlertMessage) => {
    const { domain, block_type, message, guidance, action } = msg;

    if (action === "blocked") {
      // Update the persistent alert list
      setAlerts((prev) => {
        const exists = prev.some((a) => a.domain === domain && a.block_type === block_type);
        if (exists) {
          return prev.map((a) =>
            a.domain === domain && a.block_type === block_type
              ? { ...a, message, guidance }
              : a,
          );
        }
        return [...prev, { domain, block_type, message, guidance, first_seen: Date.now() }];
      });

      // Show toast with dedup
      const key = _toastKey(domain, block_type);
      const lastShown = _recentToasts.get(key) ?? 0;
      if (Date.now() - lastShown > TOAST_DEDUP_MS) {
        _recentToasts.set(key, Date.now());
        showToast(`⛔ ${message}`, "error", 8000);
      }
    } else if (action === "cleared") {
      // Remove from active alerts
      setAlerts((prev) => prev.filter((a) => a.domain !== domain));
      _recentToasts.delete(_toastKey(domain, "cloudflare"));
      _recentToasts.delete(_toastKey(domain, "rate_limit"));
      _recentToasts.delete(_toastKey(domain, "access_denied"));

      showToast(`✅ ${domain} 封锁已解除`, "success", 5000);
    }
  }, [showToast]);

  useWsSystemAlert(handleAlert);

  const dismissAlert = useCallback((domain: string, block_type: string) => {
    setAlerts((prev) =>
      prev.filter((a) => !(a.domain === domain && a.block_type === block_type)),
    );
  }, []);

  return { alerts, dismissAlert };
}
