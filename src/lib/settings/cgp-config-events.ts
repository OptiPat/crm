/** Émis après l'enregistrement du profil conseiller (Paramètres) : nom, coordonnées, etc. */
export const CGP_CONFIG_CHANGED_EVENT = "crm-cgp-config-changed";

export function notifyCgpConfigChanged(): void {
  window.dispatchEvent(new CustomEvent(CGP_CONFIG_CHANGED_EVENT));
}

export function subscribeCgpConfigChanged(handler: () => void): () => void {
  window.addEventListener(CGP_CONFIG_CHANGED_EVENT, handler);
  return () => window.removeEventListener(CGP_CONFIG_CHANGED_EVENT, handler);
}
