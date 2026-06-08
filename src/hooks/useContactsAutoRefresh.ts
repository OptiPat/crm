import { useEffect, useRef } from "react";
import {
  subscribeContactsChanged,
  type ContactsChangedDetail,
} from "@/lib/contacts/contact-events";
import { subscribeFoyersChanged } from "@/lib/foyers/foyer-events";
import { subscribeRelationChanged } from "@/lib/etiquettes/etiquette-events";

const DEBOUNCE_MS = 120;
const WAKE_DEBOUNCE_MS = 300;

export type ContactsRefreshOptions = {
  silent?: boolean;
  detail?: ContactsChangedDetail;
};

/**
 * Rafraîchissement page Contacts : modifs métier + retour sur la fenêtre.
 * Les saves utilisateur passent par notifyContactsChanged → patch ou refresh (debouncé).
 */
export function useContactsAutoRefresh(
  onContactsRefresh: (options?: ContactsRefreshOptions) => void | Promise<void>,
  onAlertsRefresh: () => void | Promise<void>
): void {
  const contactsRef = useRef(onContactsRefresh);
  const alertsRef = useRef(onAlertsRefresh);
  contactsRef.current = onContactsRefresh;
  alertsRef.current = onAlertsRefresh;
  const debounceRef = useRef<number | null>(null);
  const wakeDebounceRef = useRef<number | null>(null);

  useEffect(() => {
    const scheduleContactsRefresh = (detail?: ContactsChangedDetail) => {
      const isPatch =
        detail?.patchedContact != null || detail?.removedContactId != null;
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        void contactsRef.current({ silent: isPatch, detail });
      }, DEBOUNCE_MS);
    };

    const refreshAlerts = () => void alertsRef.current();

    const unsubContacts = subscribeContactsChanged((detail) =>
      scheduleContactsRefresh(detail)
    );
    const unsubFoyers = subscribeFoyersChanged(() => scheduleContactsRefresh());
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
      unsubFoyers();
      unsubRelation();
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
      if (wakeDebounceRef.current != null) window.clearTimeout(wakeDebounceRef.current);
    };
  }, []);
}
