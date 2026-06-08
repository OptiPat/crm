const DEFAULT_DEBOUNCE_MS = 300;

/** Regroupe plusieurs signaux en un seul rafraîchissement (file Envois). */
export function createDebouncedEnvoisReload(
  onReload: () => void,
  debounceMs = DEFAULT_DEBOUNCE_MS
): () => void {
  let timeout: number | null = null;

  return () => {
    if (timeout != null) globalThis.clearTimeout(timeout);
    timeout = globalThis.setTimeout(() => {
      timeout = null;
      onReload();
    }, debounceMs) as unknown as number;
  };
}
