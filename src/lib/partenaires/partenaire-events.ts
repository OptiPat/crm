/** Partenaires — recharger après CRUD partenaire. */
export const PARTENAIRES_CHANGED_EVENT = "crm:partenaires-changed";

export function notifyPartenairesChanged(): void {
  window.dispatchEvent(new CustomEvent(PARTENAIRES_CHANGED_EVENT));
}

export function subscribePartenairesChanged(handler: () => void): () => void {
  window.addEventListener(PARTENAIRES_CHANGED_EVENT, handler);
  return () => window.removeEventListener(PARTENAIRES_CHANGED_EVENT, handler);
}
