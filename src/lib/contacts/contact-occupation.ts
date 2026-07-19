/** Statut d'occupation du logement (fiche contact, aligné RIO). */
export const STATUTS_OCCUPATION_LOGEMENT = [
  "PROPRIETAIRE",
  "LOCATAIRE",
  "HEBERGE_GRATUIT",
] as const;

export type StatutOccupationLogement = (typeof STATUTS_OCCUPATION_LOGEMENT)[number];

export const STATUT_OCCUPATION_LOGEMENT_LABELS: Record<StatutOccupationLogement, string> = {
  PROPRIETAIRE: "Propriétaire",
  LOCATAIRE: "Locataire",
  HEBERGE_GRATUIT: "Hébergé(e) à titre gratuit",
};

export function isStatutOccupationLogement(value: string): value is StatutOccupationLogement {
  return (STATUTS_OCCUPATION_LOGEMENT as readonly string[]).includes(value);
}

/** Libellé RIO « Statut d'occupation du logement » → valeur fiche contact. */
export function mapRioStatutOccupationLogement(
  label?: string
): StatutOccupationLogement | undefined {
  if (!label?.trim()) return undefined;
  const normalized = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  if (normalized.includes("proprietaire")) return "PROPRIETAIRE";
  if (normalized.includes("locataire")) return "LOCATAIRE";
  if (normalized.includes("heberge") || normalized.includes("titre gratuit")) {
    return "HEBERGE_GRATUIT";
  }
  return undefined;
}

/** Profession indiquant une retraite (checklist R3 immo). */
export function isRetiredProfession(profession?: string | null): boolean {
  const p = profession?.trim().toLowerCase() ?? "";
  if (!p) return false;
  return /\bretrait[eé]?e?\b/.test(p) || /\bretraite\b/.test(p);
}
