export const ESPACE_ACCES_STATUT = {
  INACTIF: "inactif",
  ACTIF: "actif",
  REVOQUE: "revoque",
} as const;

export type EspaceAccesStatut =
  (typeof ESPACE_ACCES_STATUT)[keyof typeof ESPACE_ACCES_STATUT];

export function formatEspaceAccesStatut(statut: string): string {
  switch (statut) {
    case ESPACE_ACCES_STATUT.ACTIF:
      return "Actif";
    case ESPACE_ACCES_STATUT.REVOQUE:
      return "Révoqué";
    default:
      return "Inactif";
  }
}

export function formatEspaceSyncLabel(
  derniereSynchroAt?: number | null
): string | null {
  if (derniereSynchroAt == null || derniereSynchroAt <= 0) return null;
  return new Date(derniereSynchroAt * 1000).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function formatEspaceTimestamp(ts?: number | null): string | null {
  if (ts == null || ts <= 0) return null;
  return new Date(ts * 1000).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

const CONNEXION_EVENT_LABELS: Record<string, string> = {
  first_login: "Première connexion",
  login_success: "Connexion",
  login_failed: "Échec de connexion",
};

export function formatEspaceConnexionEvent(event: string): string {
  return CONNEXION_EVENT_LABELS[event] ?? event;
}
