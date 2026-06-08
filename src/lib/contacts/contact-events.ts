import type { Contact } from "@/lib/api/tauri-contacts";

/** Liste / fiches contacts — recharger quand les données contact ou patrimoine changent. */
export const CONTACTS_CHANGED_EVENT = "crm:contacts-changed";

export type ContactsChangedDetail = {
  /** Mise à jour unitaire — patch local sans reload liste. */
  patchedContact?: Contact;
  /** Suppression unitaire — retrait optimiste de la liste. */
  removedContactId?: number;
};

let suppressNotifyDepth = 0;

/** Bloque les notify pendant import / fusion (transaction) — un seul refresh à la fin. */
export function suppressContactsChangedNotify(): () => void {
  suppressNotifyDepth += 1;
  return () => {
    suppressNotifyDepth = Math.max(0, suppressNotifyDepth - 1);
  };
}

export function notifyContactsChanged(detail?: ContactsChangedDetail): void {
  if (suppressNotifyDepth > 0) return;
  window.dispatchEvent(
    new CustomEvent<ContactsChangedDetail>(CONTACTS_CHANGED_EVENT, {
      detail: detail ?? {},
    })
  );
}

export function subscribeContactsChanged(
  handler: (detail: ContactsChangedDetail) => void
): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<ContactsChangedDetail>).detail ?? {};
    handler(detail);
  };
  window.addEventListener(CONTACTS_CHANGED_EVENT, listener);
  return () => window.removeEventListener(CONTACTS_CHANGED_EVENT, listener);
}
