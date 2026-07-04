/**
 * Catégories contact pour règles auto (étiquettes, déclencheurs modèle email, campagnes éphémères).
 * Aligné sur fiche contact / onglets Contacts. Le moteur Rust matche `categorie` OU `filleul_categorie`.
 */

export type ContactAutoRuleCategory = {
  value: string;
  label: string;
};

export const CONTACT_AUTO_RULE_CATEGORIES: readonly ContactAutoRuleCategory[] = [
  { value: "CLIENT", label: "Client" },
  { value: "PROSPECT_CLIENT", label: "Prospect client" },
  { value: "SUSPECT_CLIENT", label: "Suspect client" },
  { value: "PRESCRIPTEUR", label: "Prescripteur" },
  { value: "FILLEUL", label: "Filleul" },
  { value: "PROSPECT_FILLEUL", label: "Prospect filleul" },
  { value: "SUSPECT_FILLEUL", label: "Suspect filleul" },
  { value: "FILLEUL_DESINSCRIT", label: "Filleul désinscrit" },
] as const;

export const CONTACT_AUTO_RULE_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CONTACT_AUTO_RULE_CATEGORIES.map((c) => [c.value, c.label])
);
