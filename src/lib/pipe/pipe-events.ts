/** Rafraîchissement ciblé de la page Pipe. */
export const PIPE_CHANGED_EVENT = "crm:pipe-changed";

let suppressNotifyDepth = 0;

/** Bloque les notify pendant import bulk — un seul refresh à la fin. */
export function suppressPipeChangedNotify(): () => void {
  suppressNotifyDepth += 1;
  return () => {
    suppressNotifyDepth = Math.max(0, suppressNotifyDepth - 1);
  };
}

export function notifyPipeChanged(): void {
  if (suppressNotifyDepth > 0) return;
  window.dispatchEvent(new CustomEvent(PIPE_CHANGED_EVENT));
}

export function subscribePipeChanged(handler: () => void): () => void {
  window.addEventListener(PIPE_CHANGED_EVENT, handler);
  return () => window.removeEventListener(PIPE_CHANGED_EVENT, handler);
}
