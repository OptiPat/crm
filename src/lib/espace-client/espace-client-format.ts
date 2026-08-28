export const ESPACE_ACCES_STATUT = {
  INACTIF: "inactif",
  ACTIF: "actif",
  REVOQUE: "revoque",
} as const;

export type EspaceAccesStatut =
  (typeof ESPACE_ACCES_STATUT)[keyof typeof ESPACE_ACCES_STATUT];

export const ESPACE_DEMANDE_STATUT = {
  EN_ATTENTE: "en_attente",
  RECU: "recu",
  IMPORT_EN_COURS: "import_en_cours",
  VALIDE: "valide",
  ANNULE: "annule",
} as const;

export function formatEspaceDemandeStatut(statut: string): string {
  switch (statut) {
    case ESPACE_DEMANDE_STATUT.EN_ATTENTE:
      return "En attente";
    case ESPACE_DEMANDE_STATUT.RECU:
      return "Reçu (portail)";
    case ESPACE_DEMANDE_STATUT.IMPORT_EN_COURS:
      return "Import en cours";
    case ESPACE_DEMANDE_STATUT.VALIDE:
      return "Importé";
    case ESPACE_DEMANDE_STATUT.ANNULE:
      return "Annulée";
    default:
      return statut;
  }
}

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
  new_device: "Nouvel appareil",
};

export function formatEspaceConnexionEvent(event: string): string {
  return CONNEXION_EVENT_LABELS[event] ?? event;
}

/** Compteurs d'un import portail → CRM, pour les toasts fiche et Paramètres. */
export function formatEspaceImportSummaryParts(result: {
  imported: number;
  scpiDeclarationsImported: number;
  avoirsImported: number;
  avoirsRetires: number;
  declareClientPromoted: number;
}): string[] {
  const parts: string[] = [];
  if (result.imported > 0) {
    parts.push(`${result.imported} document(s) importé(s) dans la GED`);
  }
  if (result.scpiDeclarationsImported > 0) {
    parts.push(`${result.scpiDeclarationsImported} mise(s) à jour importée(s)`);
  }
  if (result.avoirsImported > 0) {
    parts.push(`${result.avoirsImported} avoir(s) déclaré(s) importé(s)`);
  }
  if (result.declareClientPromoted > 0) {
    parts.push(`${result.declareClientPromoted} déclaration(s) reprise(s) à côté`);
  }
  if (result.avoirsRetires > 0) {
    parts.push(`${result.avoirsRetires} avoir(s) retiré(s)`);
  }
  return parts;
}
