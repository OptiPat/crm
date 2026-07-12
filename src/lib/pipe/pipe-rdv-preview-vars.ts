const PIPE_RDV_VAR_KEYS = [
  "date_rdv",
  "heure_rdv",
  "heure_fin_rdv",
  "lien_visio",
  "lieu_rdv",
  "co_contact",
  "co_contact_prenom",
  "co_contact_nom",
  "co_contact_et_prenom",
] as const;

/** Valeurs fictives pour l'aperçu des modèles Pipe RDV (Paramètres → Modèles email). */
export const SAMPLE_PIPE_RDV_PREVIEW_VARS: Record<string, string> = {
  date_rdv: "lundi 14 juillet 2026",
  heure_rdv: "14h00",
  heure_fin_rdv: "15h00",
  lien_visio: "https://meet.google.com/abc-defg-hij",
  lieu_rdv: "12 rue des Acacias, 75001 Paris",
  co_contact: "DUPONT Jean",
  co_contact_prenom: "Jean",
  co_contact_nom: "DUPONT",
  co_contact_et_prenom: " et Jean",
};

function haystack(...parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join("\n");
}

export function templateUsesPipeRdvVariables(
  sujet: string,
  corps: string,
  corpsHtml?: string | null
): boolean {
  const hay = haystack(sujet, corps, corpsHtml);
  return PIPE_RDV_VAR_KEYS.some((key) => hay.includes(`{{${key}}}`));
}
