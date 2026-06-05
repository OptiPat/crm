/** Libellés et types de conditions — alignés sur le moteur Rust. */

export type ConditionType =
  | "EVENEMENT_SOUSCRIPTION"
  | "DELAI_SANS_CONTACT"
  | "DATE_APPROCHE"
  | "PERIODE_ANNEE"
  | "TYPE_PRODUIT"
  | "DATE_APPROCHE_INVESTISSEMENT"
  | "AGE_APPROCHE"
  | "JAMAIS_CONTACT"
  | "A_ETIQUETTE"
  | "CHAMP_PERSO"
  | "RULE_TREE";

export const CONDITION_TYPE_LABELS: Record<ConditionType, string> = {
  EVENEMENT_SOUSCRIPTION: "Événement : nouvelle souscription",
  DELAI_SANS_CONTACT: "Délai sans contact",
  DATE_APPROCHE: "Date sur la fiche contact",
  PERIODE_ANNEE: "Période de l'année",
  TYPE_PRODUIT: "Détient un type de produit",
  DATE_APPROCHE_INVESTISSEMENT: "Date sur un investissement",
  AGE_APPROCHE: "Âge approchant",
  JAMAIS_CONTACT: "Jamais contacté (catégories cochées)",
  A_ETIQUETTE: "Possède une étiquette",
  CHAMP_PERSO: "Champ personnalisé",
  RULE_TREE: "Règle combinée",
};

export function getConditionTypeLabel(type: string | null | undefined): string {
  if (!type) return "Manuel";
  return CONDITION_TYPE_LABELS[type as ConditionType] ?? type.replace(/_/g, " ");
}

/** Regroupe les liaisons contact–étiquette par contact_id. */
export function groupEtiquettesByContactId(
  rows: { contact_id: number }[]
): Record<number, typeof rows> {
  const map: Record<number, typeof rows> = {};
  for (const row of rows) {
    if (!map[row.contact_id]) map[row.contact_id] = [];
    map[row.contact_id].push(row);
  }
  return map;
}
