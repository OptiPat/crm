export const ESPACE_CLIENT_CHANGED_EVENT = "espace-client-changed";

export function notifyEspaceClientChanged(): void {
  window.dispatchEvent(new CustomEvent(ESPACE_CLIENT_CHANGED_EVENT));
}
