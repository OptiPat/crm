/** Libellés d’aide du panneau mode équipe (sans React). */

export function assistantFicheCopyBlockedReason(
  siteId: string | null | undefined,
): string | null {
  if (!siteId?.trim() || siteId.trim() === "—") {
    return "Tester SharePoint, puis Enregistrer encore une fois pour garder l’ID site — ensuite seulement Copier la fiche.";
  }
  return null;
}

export function teamJoinBlockedReason(input: {
  connected: boolean;
  teamConfigured: boolean;
  siteId?: string | null;
}): string | null {
  if (!input.connected) {
    return "Connectez d’abord le compte Microsoft de cette personne.";
  }
  if (!input.teamConfigured) {
    return "Enregistrez d’abord la configuration équipe.";
  }
  if (!input.siteId?.trim()) {
    return "Collez l’ID site Graph de la fiche Tony, puis Enregistrer — avant Rejoindre.";
  }
  return null;
}
