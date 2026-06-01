import { useCallback, useEffect, useRef } from "react";
import { getEmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import {
  notifyStelliumExceltisChanged,
  scanStelliumExceltisEmails,
} from "@/lib/api/tauri-stellium-exceltis";
import { useWakeIntervalRefresh } from "@/hooks/useWakeIntervalRefresh";
import { toast } from "sonner";

const SCAN_INTERVAL_MS = 300_000;

/**
 * Scan Gmail Stellium (Remboursement Exceltis) — CRM ouvert, compte Google connecté.
 */
export function useStelliumExceltisScan(enabled = true): void {
  const runningRef = useRef(false);

  const runScan = useCallback(async () => {
    if (!enabled || runningRef.current) return;
    runningRef.current = true;
    try {
      const status = await getEmailConnectionStatus();
      if (status.provider !== "google" || !status.connected) return;

      const result = await scanStelliumExceltisEmails();
      if (result.new_signals > 0) {
        notifyStelliumExceltisChanged();
        const label =
          result.signals[result.signals.length - 1]?.millesime_label ?? "millésime";
        toast.info(
          `Stellium : remboursement Exceltis détecté (${label}). Voir les notifications.`
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (
        !msg.includes("Aucun compte") &&
        !msg.includes("connectez Google") &&
        !msg.includes("nécessite")
      ) {
        console.warn("Scan Stellium Exceltis:", msg);
      }
    } finally {
      runningRef.current = false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void runScan();
  }, [enabled, runScan]);

  useWakeIntervalRefresh(() => runScan(), {
    enabled,
    intervalMs: SCAN_INTERVAL_MS,
  });
}
