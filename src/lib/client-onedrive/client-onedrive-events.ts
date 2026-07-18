const EVENT = "client-onedrive-changed";

export function notifyClientOneDriveChanged(): void {
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function subscribeClientOneDriveChanged(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
