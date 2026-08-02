import { useEffect } from "react";
import { runAlertesGenerationCycle } from "@/lib/alertes/run-alertes-generation";

const WAKE_DEBOUNCE_MS = 300;

/**
 * Génération d'alertes hors chemin critique UI : au montage (post-déverrouillage)
 * puis au focus / retour sur la fenêtre (avec cooldown côté runner).
 */
export function useAlertesBackgroundGeneration(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    let wakeTimer: number | null = null;

    void runAlertesGenerationCycle({ force: true });

    const onWake = () => {
      if (document.hidden) return;
      if (wakeTimer != null) window.clearTimeout(wakeTimer);
      wakeTimer = window.setTimeout(() => {
        wakeTimer = null;
        void runAlertesGenerationCycle();
      }, WAKE_DEBOUNCE_MS);
    };

    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);

    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      if (wakeTimer != null) window.clearTimeout(wakeTimer);
    };
  }, [enabled]);
}
