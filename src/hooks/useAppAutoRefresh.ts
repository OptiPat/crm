import { useEffect, useRef } from "react";
import {
  subscribeEtiquettesChanged,
  subscribeRelationChanged,
} from "@/lib/etiquettes/etiquette-events";

const DEFAULT_INTERVAL_MS = 90_000;

/**
 * Rafraîchissement silencieux : événements métier, retour sur la fenêtre, intervalle léger.
 */
export function useAppAutoRefresh(
  onRefresh: () => void | Promise<void>,
  options?: { intervalMs?: number; enabled?: boolean }
): void {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const enabled = options?.enabled ?? true;
  const intervalMs = options?.intervalMs ?? DEFAULT_INTERVAL_MS;

  useEffect(() => {
    if (!enabled) return;

    const run = () => {
      void onRefreshRef.current();
    };

    const unsubRelation = subscribeRelationChanged(run);
    const unsubEtiquettes = subscribeEtiquettesChanged(run);

    const onVisibility = () => {
      if (!document.hidden) run();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", run);

    const intervalId = window.setInterval(() => {
      if (!document.hidden) run();
    }, intervalMs);

    return () => {
      unsubRelation();
      unsubEtiquettes();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", run);
      window.clearInterval(intervalId);
    };
  }, [enabled, intervalMs]);
}
