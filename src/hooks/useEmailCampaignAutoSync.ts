import { useCallback, useEffect, useRef } from "react";
import { runRelationAutoSync } from "@/lib/emails/relation-auto-sync";
import { useWakeIntervalRefresh } from "@/hooks/useWakeIntervalRefresh";

const SYNC_INTERVAL_MS = 120_000;

/**
 * Sync Gmail + Agenda en arrière-plan (toute l'app, Google connecté).
 * Les boutons « Vérifier maintenant » restent un déclenchement immédiat optionnel.
 */
export function useEmailCampaignAutoSync(enabled = true): void {
  const runningRef = useRef(false);

  const runSync = useCallback(async () => {
    if (!enabled || runningRef.current) return;
    runningRef.current = true;
    try {
      const result = await runRelationAutoSync();
      if (result.skipped) return;
      if (result.errors.length > 0) {
        console.warn("Sync relation:", result.errors.join(" ; "));
      }
    } finally {
      runningRef.current = false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void runSync();
  }, [enabled, runSync]);

  useWakeIntervalRefresh(() => runSync(), {
    enabled,
    intervalMs: SYNC_INTERVAL_MS,
  });
}
