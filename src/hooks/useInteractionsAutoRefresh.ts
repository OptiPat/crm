import { useEffect, useRef } from "react";
import { subscribeInteractionsChanged } from "@/lib/interactions/interaction-events";
import {
  subscribeEtiquettesChangedDebounced,
  subscribeRelationChanged,
} from "@/lib/etiquettes/etiquette-events";

const DEBOUNCE_MS = 120;

/** Rafraîchissement page Historique : modifs interactions / relation + retour fenêtre. */
export function useInteractionsAutoRefresh(
  onRefresh: () => void | Promise<void>
): void {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    const schedule = () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        void onRefreshRef.current();
      }, DEBOUNCE_MS);
    };

    const unsubInteractions = subscribeInteractionsChanged(schedule);
    const unsubRelation = subscribeRelationChanged(schedule);
    const unsubEtiquettes = subscribeEtiquettesChangedDebounced(schedule);

    const onWake = () => {
      if (!document.hidden) void onRefreshRef.current();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);

    return () => {
      unsubInteractions();
      unsubRelation();
      unsubEtiquettes();
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    };
  }, []);
}
