import { useCallback, useEffect, useRef } from "react";
import { syncEmailCampaignResponses } from "@/lib/api/tauri-email";
import { getEmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import { notifyRelationChanged } from "@/lib/etiquettes/etiquette-events";
import { useWakeIntervalRefresh } from "@/hooks/useWakeIntervalRefresh";

const SYNC_INTERVAL_MS = 120_000;

/**
 * Détection Gmail + Agenda en arrière-plan (toute l'app, Google connecté).
 * Le bouton « Vérifier maintenant » dans Envois reste un déclenchement immédiat optionnel.
 */
export function useEmailCampaignAutoSync(enabled = true): void {
  const runningRef = useRef(false);

  const runSync = useCallback(async () => {
    if (!enabled || runningRef.current) return;
    runningRef.current = true;
    try {
      const status = await getEmailConnectionStatus();
      if (status.provider !== "google" || !status.connected) return;

      const result = await syncEmailCampaignResponses();
      if (result.mail_detected > 0 || result.rdv_detected > 0) {
        notifyRelationChanged();
      }
      if (result.errors.length > 0) {
        console.warn("Sync campagnes email:", result.errors.join(" ; "));
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (
        msg.includes("Connectez Google") ||
        msg.includes("reconnectez") ||
        msg.includes("Agenda")
      ) {
        console.warn("Sync campagnes email:", msg);
      } else {
        console.warn("Sync campagnes email:", msg);
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
