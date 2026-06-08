/** Documents — recharger Ctrl+K et listes après CRUD document. */
export const DOCUMENTS_CHANGED_EVENT = "crm:documents-changed";

export function notifyDocumentsChanged(): void {
  window.dispatchEvent(new CustomEvent(DOCUMENTS_CHANGED_EVENT));
}

export function subscribeDocumentsChanged(handler: () => void): () => void {
  window.addEventListener(DOCUMENTS_CHANGED_EVENT, handler);
  return () => window.removeEventListener(DOCUMENTS_CHANGED_EVENT, handler);
}
