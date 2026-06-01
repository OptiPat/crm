import { useEffect, useRef } from "react";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { subscribeRelationChanged } from "@/lib/etiquettes/etiquette-events";

const DEBOUNCE_MS = 120;

/**
 * Rafraîchissement page Contacts : modifs métier + retour sur la fenêtre.
 * Pas de polling périodique (import / fusion peuvent émettre plusieurs événements).
 */
export function useContactsAutoRefresh(
  onContactsRefresh: () => void | Promise<void>,
  onAlertsRefresh: () => void | Promise<void>
): void {
  const contactsRef = useRef(onContactsRefresh);
  const alertsRef = useRef(onAlertsRefresh);
  contactsRef.current = onContactsRefresh;
  alertsRef.current = onAlertsRefresh;
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    const scheduleContactsRefresh = () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        void contactsRef.current();
      }, DEBOUNCE_MS);
    };

    const refreshAlerts = () => void alertsRef.current();

    const unsubContacts = subscribeContactsChanged(scheduleContactsRefresh);
    const unsubRelation = subscribeRelationChanged(refreshAlerts);

    const onWake = () => {
      if (document.hidden) return;
      void contactsRef.current();
      void alertsRef.current();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);

    return () => {
      unsubContacts();
      unsubRelation();
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    };
  }, []);
}
