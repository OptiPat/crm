/** Événement émis après modification des définitions de champs personnalisés. */
export const CUSTOM_FIELDS_CHANGED_EVENT = "crm:custom-fields-changed";

export function notifyCustomFieldsChanged(): void {
  window.dispatchEvent(new CustomEvent(CUSTOM_FIELDS_CHANGED_EVENT));
}

export function subscribeCustomFieldsChanged(handler: () => void): () => void {
  window.addEventListener(CUSTOM_FIELDS_CHANGED_EVENT, handler);
  return () => window.removeEventListener(CUSTOM_FIELDS_CHANGED_EVENT, handler);
}
