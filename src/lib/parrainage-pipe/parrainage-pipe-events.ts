const PARRAINAGE_PIPE_CHANGED_EVENT = "crm:parrainage-pipe-changed";

export function notifyParrainagePipeChanged(): void {
  window.dispatchEvent(new CustomEvent(PARRAINAGE_PIPE_CHANGED_EVENT));
}

export function subscribeParrainagePipeChanged(listener: () => void): () => void {
  const handler = () => listener();
  window.addEventListener(PARRAINAGE_PIPE_CHANGED_EVENT, handler);
  return () => window.removeEventListener(PARRAINAGE_PIPE_CHANGED_EVENT, handler);
}
