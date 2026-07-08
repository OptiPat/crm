const NOTES_CHANGED_EVENT = "crm-notes-changed";

export function notifyNotesChanged(): void {
  window.dispatchEvent(new CustomEvent(NOTES_CHANGED_EVENT));
}

export function subscribeNotesChanged(listener: () => void): () => void {
  window.addEventListener(NOTES_CHANGED_EVENT, listener);
  return () => window.removeEventListener(NOTES_CHANGED_EVENT, listener);
}
