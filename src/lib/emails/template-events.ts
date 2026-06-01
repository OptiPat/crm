/** Bibliothèque Templates email — recharger après CRUD modèle ou liaisons étiquettes. */
export const TEMPLATES_EMAIL_CHANGED_EVENT = "crm:templates-email-changed";

export function notifyTemplatesEmailChanged(): void {
  window.dispatchEvent(new CustomEvent(TEMPLATES_EMAIL_CHANGED_EVENT));
}

export function subscribeTemplatesEmailChanged(handler: () => void): () => void {
  window.addEventListener(TEMPLATES_EMAIL_CHANGED_EVENT, handler);
  return () => window.removeEventListener(TEMPLATES_EMAIL_CHANGED_EVENT, handler);
}
