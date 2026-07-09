import type { ConditionType } from "@/lib/etiquettes/etiquette-condition-labels";

/** Types de règle proposés (alignés moteur Rust — comme une étiquette auto). */
export const AUTO_RULE_CONDITION_TYPES: ConditionType[] = [
  "EVENEMENT_SOUSCRIPTION",
  "DELAI_SANS_CONTACT",
  "DATE_APPROCHE",
  "PERIODE_ANNEE",
  "TYPE_PRODUIT",
  "DATE_APPROCHE_INVESTISSEMENT",
  "AGE_APPROCHE",
  "TMI",
  "IR_NET",
  "REVENUS_ANNUELS",
];

export type AutoRuleConditionState = {
  conditionType: string;
  conditionConfig: string | null;
  categories: string[];
};
