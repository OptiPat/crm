import { useEffect, useRef } from "react";
import { subscribeAlertesChanged } from "@/lib/alertes/alert-events";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import {
  subscribeEtiquettesChanged,
  subscribeRelationChanged,
} from "@/lib/etiquettes/etiquette-events";

const DEBOUNCE_MS = 120;

type SuiviAutoRefreshHandlers = {
  /** Regénération segments + relecture liste (contacts / investissements modifiés). */
  onRegenerateAlertes: () => void | Promise<void>;
  /** Relecture liste seule (alerte traitée / supprimée). */
  onFetchAlertes: () => void | Promise<void>;
  onRefreshEtiquettes: () => void | Promise<void>;
  onRefreshEmailQueue: () => void | Promise<void>;
};

/**
 * Rafraîchissement page Suivi : événements métier + retour fenêtre.
 * Pas de polling périodique.
 */
export function useSuiviAutoRefresh(handlers: SuiviAutoRefreshHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const debounceRef = useRef<number | null>(null);
  const needsRegenRef = useRef(false);

  useEffect(() => {
    const flushAlertRefresh = () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        const regen = needsRegenRef.current;
        needsRegenRef.current = false;
        if (regen) {
          void handlersRef.current.onRegenerateAlertes();
        } else {
          void handlersRef.current.onFetchAlertes();
        }
      }, DEBOUNCE_MS);
    };

    const scheduleAlertRefresh = (regenerate: boolean) => {
      needsRegenRef.current = needsRegenRef.current || regenerate;
      flushAlertRefresh();
    };

    const unsubContacts = subscribeContactsChanged(() => scheduleAlertRefresh(true));
    const unsubAlertes = subscribeAlertesChanged(() => scheduleAlertRefresh(false));
    const unsubEtiquettes = subscribeEtiquettesChanged(() => {
      void handlersRef.current.onRefreshEtiquettes();
    });
    const unsubRelation = subscribeRelationChanged(() => {
      scheduleAlertRefresh(false);
      void handlersRef.current.onRefreshEmailQueue();
    });

    const onWake = () => {
      if (document.hidden) return;
      scheduleAlertRefresh(true);
      void handlersRef.current.onRefreshEtiquettes();
      void handlersRef.current.onRefreshEmailQueue();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);

    return () => {
      unsubContacts();
      unsubAlertes();
      unsubEtiquettes();
      unsubRelation();
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    };
  }, []);
}
