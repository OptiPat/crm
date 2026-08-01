/** Nom d'étiquette par défaut associé à un type d'alerte (convergence Suivi). */
export const ALERTE_ETIQUETTE_NOM: Record<string, string> = {
  SUIVI_CLIENT_1AN: "Suivi > 1 an",
  SUIVI_CLIENT_ANNUEL: "Suivi > 1 an",
  CLIENT_JAMAIS_SUIVI: "Jamais suivi",
  LEAD_SUIVI_6MOIS: "Suivi > 6 mois",
  SUIVI_PROSPECT_6MOIS: "Suivi > 6 mois",
  LEAD_JAMAIS_CONTACTE: "Prospect jamais contacté",
  SUIVI_FILLEUL_1AN: "Filleul suivi > 1 an",
  FILLEUL_SUIVI_6MOIS: "Filleul suivi > 6 mois",
  FILLEUL_JAMAIS_CONTACTE: "Filleul jamais contacté",
  FIN_DEMEMBREMENT: "Fin démembrement",
  ANNIVERSAIRE: "Alerte 69 ans",
};

export function getEtiquetteNomForAlerte(typeAlerte: string): string | null {
  return ALERTE_ETIQUETTE_NOM[typeAlerte] ?? null;
}

export const ALERTE_ETIQUETTE_EXPLICATION =
  "Les alertes et les étiquettes partagent la même logique via des segments (ex. suivi > 1 an). Les alertes = à traiter ; les étiquettes = badges et campagnes.";
