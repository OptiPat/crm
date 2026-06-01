/** Liste / fiches contacts — recharger quand les données contact ou patrimoine changent. */
export const CONTACTS_CHANGED_EVENT = "crm:contacts-changed";

let suppressNotifyDepth = 0;

/** Bloque les notify pendant import / fusion (transaction) — un seul refresh à la fin. */
export function suppressContactsChangedNotify(): () => void {
  suppressNotifyDepth += 1;
  return () => {
    suppressNotifyDepth = Math.max(0, suppressNotifyDepth - 1);
  };
}

export function notifyContactsChanged(): void {
  if (suppressNotifyDepth > 0) return;
  window.dispatchEvent(new CustomEvent(CONTACTS_CHANGED_EVENT));
}

export function subscribeContactsChanged(handler: () => void): () => void {
  window.addEventListener(CONTACTS_CHANGED_EVENT, handler);
  return () => window.removeEventListener(CONTACTS_CHANGED_EVENT, handler);
}
