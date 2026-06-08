import { useEffect, useRef } from "react";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { subscribeRelationChanged } from "@/lib/etiquettes/etiquette-events";

const DEBOUNCE_MS = 120;
const WAKE_DEBOUNCE_MS = 300;

/**
 * Rafraîchissement page Contacts : modifs métier + retour sur la fenêtre.
 * Les saves utilisateur passent par notifyContactsChanged → refresh immédiat (debouncé).
 */
export function useContactsAutoRefresh(
  onContactsRefresh: (options?: { silent?: boolean }) => void | Promise<void>,
  onAlertsRefresh: () => void | Promise<void>
): void {
  const contactsRef = useRef(onContactsRefresh);
  const alertsRef = useRef(onAlertsRefresh);
  contactsRef.current = onContactsRefresh;
  alertsRef.current = onAlertsRefresh;
  const debounceRef = useRef<number | null>(null);
  const wakeDebounceRef = useRef<number | null>(null);

  useEffect(() => {
    const scheduleContactsRefresh = (silent = false) => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        void contactsRef.current({ silent });
      }, DEBOUNCE_MS);
    };

    const refreshAlerts = () => void alertsRef.current();

    const unsubContacts = subscribeContactsChanged(() => scheduleContactsRefresh(false));
    const unsubRelation = subscribeRelationChanged(refreshAlerts);

    const onWake = () => {
      if (document.hidden) return;
      if (wakeDebounceRef.current != null) window.clearTimeout(wakeDebounceRef.current);
      wakeDebounceRef.current = window.setTimeout(() => {
        wakeDebounceRef.current = null;
        void contactsRef.current({ silent: true });
        void alertsRef.current();
      }, WAKE_DEBOUNCE_MS);
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);

    return () => {
      unsubContacts();
      unsubRelation();
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
      if (wakeDebounceRef.current != null) window.clearTimeout(wakeDebounceRef.current);
    };
  }, []);
}
