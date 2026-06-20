import { useCallback, useEffect, useRef } from "react";
import { getEmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import {
  notifyStelliumExceltisChanged,
  scanStelliumExceltisEmails,
} from "@/lib/api/tauri-stellium-exceltis";
import { beginBackgroundActivity } from "@/lib/background-activity";
import { runRelationAutoSync } from "@/lib/emails/relation-auto-sync";
import { toast } from "sonner";

export const RELATION_INTERVAL_MS = 3 * 60_000;
export const STELLIUM_INTERVAL_MS = 60 * 60_000;
export const RELATION_COOLDOWN_MS = 90_000;
export const STELLIUM_COOLDOWN_MS = 60 * 60_000;
const WAKE_DEBOUNCE_MS = 300;

/**
 * Sync Gmail/Agenda (3 min) + scan Stellium (1 h) — une tâche à la fois.
 * Stellium au focus uniquement si la dernière passe date de > 1 h (cooldown).
 */
export function useBackgroundSync(enabled = true): void {
  const runningRef = useRef(false);
  const lastRelationSyncRef = useRef(0);
  const lastStelliumScanRef = useRef(0);

  const runRelationSync = useCallback(
    async (options?: { force?: boolean; reason?: string }) => {
      if (!enabled) return;
      const now = Date.now();
      if (!options?.force && now - lastRelationSyncRef.current < RELATION_COOLDOWN_MS) {
        return;
      }
      const endActivity = beginBackgroundActivity("relation-sync");
      try {
        const result = await runRelationAutoSync();
        if (result.skipped) return;
        lastRelationSyncRef.current = Date.now();
        if (result.errors.length > 0) {
          console.warn("Sync relation:", result.errors.join(" ; "));
        }
      } finally {
        endActivity();
      }
    },
    [enabled]
  );

  const runStelliumScan = useCallback(
    async (options?: { force?: boolean }) => {
      if (!enabled) return;
      const now = Date.now();
      if (!options?.force && now - lastStelliumScanRef.current < STELLIUM_COOLDOWN_MS) {
        return;
      }
      const endActivity = beginBackgroundActivity("stellium-scan");
      try {
        const status = await getEmailConnectionStatus();
        if (status.provider !== "google" || !status.connected) {
          lastStelliumScanRef.current = Date.now();
          return;
        }

        const result = await scanStelliumExceltisEmails();
        lastStelliumScanRef.current = Date.now();
        notifyStelliumExceltisChanged();
        if (result.new_signals > 0) {
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
        endActivity();
      }
    },
    [enabled]
  );

  const runSequential = useCallback(
    async (options?: { relation?: boolean; stellium?: boolean; force?: boolean }) => {
      if (!enabled || runningRef.current) return;
      runningRef.current = true;
      try {
        if (options?.relation !== false) {
          await runRelationSync({ force: options?.force });
        }
        if (options?.stellium) {
          await runStelliumScan({ force: options?.force });
        }
      } finally {
        runningRef.current = false;
      }
    },
    [enabled, runRelationSync, runStelliumScan]
  );

  useEffect(() => {
    if (!enabled) return;

    let wakeTimer: number | null = null;

    const onWake = () => {
      if (document.hidden) return;
      if (wakeTimer != null) globalThis.clearTimeout(wakeTimer);
      wakeTimer = globalThis.setTimeout(() => {
        wakeTimer = null;
        void runSequential({ relation: true, stellium: true });
      }, WAKE_DEBOUNCE_MS) as unknown as number;
    };

    const relationInterval = globalThis.setInterval(() => {
      if (!document.hidden) void runSequential({ relation: true, stellium: false });
    }, RELATION_INTERVAL_MS);

    const stelliumInterval = globalThis.setInterval(() => {
      if (!document.hidden) void runSequential({ relation: false, stellium: true });
    }, STELLIUM_INTERVAL_MS);

    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);

    void runSequential({ relation: true, stellium: true, force: true });

    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      globalThis.clearInterval(relationInterval);
      globalThis.clearInterval(stelliumInterval);
      if (wakeTimer != null) globalThis.clearTimeout(wakeTimer);
    };
  }, [enabled, runSequential]);
}
