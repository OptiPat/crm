import {
  AFFAIRE_STELLIUM_SOUSCRIPTION_LABEL,
  normalizeStelliumBoxPlacementLabel,
  SCPI_STELLIUM_SOUSCRIPTION_LABEL,
  stelliumBoxPlacementLabelsMatch,
} from "@/lib/placement/stellium-box-placement-labels";
import { VERSEMENT_COMPLEMENTAIRE_ACT_LABEL } from "@/lib/pipe/pipe-suivi";

/** Libellé client pour mails Box Placement (modèle unique, phrase naturelle). */
export const PLACEMENT_STELLIUM_CLIENT_LABELS: Record<string, string> = {
  "Arbitrage libre": "l'arbitrage",
  "Arbitrages programmés : Mise en place": "la mise en place d'arbitrages programmés",
  "Arbitrages programmés : Modification": "la modification des arbitrages programmés",
  "Arbitrages programmés : Arrêt": "l'arrêt des arbitrages programmés",

  "Rachat partiel": "le rachat partiel",
  "Rachat total/clôture": "le rachat total / la clôture du contrat",
  "Rachats programmés : Mise en place": "la mise en place de rachats programmés",
  "Rachats programmés : Modification": "la modification des rachats programmés",
  "Rachats programmés : Arrêt": "l'arrêt des rachats programmés",

  [VERSEMENT_COMPLEMENTAIRE_ACT_LABEL]: "le versement complémentaire",
  "Versements programmés : Mise en place": "la mise en place de versements programmés",
  "Versements programmés : Modification": "la modification des versements programmés",
  "Versements programmés : Arrêt": "l'arrêt des versements programmés",

  "Avance : Mise en place": "la mise en place d'une avance",
  "Avance : Remboursement": "le remboursement d'une avance",

  "Modification administrative : adresse": "la modification de l'adresse",
  "Modification administrative : nom": "la modification du nom",
  "Modification administrative : RIB": "la modification des coordonnées bancaires",
  "Modification clause bénéficiaire": "la modification de la clause bénéficiaire",
  "Changement mode de gestion": "le changement de mode de gestion",

  "Nantissement : Mise en place": "la mise en place d'un nantissement",
  "Nantissement : Arrêt": "la levée du nantissement",
  "Garantie décès : Arrêt": "l'arrêt de la garantie décès",

  "Dénouement partiel": "le dénouement partiel",
  "Dénouement total": "le dénouement total",
  Renonciation: "la renonciation",
  Décès: "les démarches suite à décès",

  "Ordre de remplacement": "l'ordre de remplacement",
  "Transfert entrant": "le transfert",

  [AFFAIRE_STELLIUM_SOUSCRIPTION_LABEL]: "la souscription",
  [SCPI_STELLIUM_SOUSCRIPTION_LABEL]: "la souscription de parts",
  "Cession de parts": "la cession de parts",
  "Retrait de parts": "le retrait de parts",
  Donation: "la donation de parts",
  "Modification administrative : adresse / nom / RIB":
    "la modification des coordonnées (adresse, identité ou RIB)",
  "Réinvestissements des dividendes : Mise en place":
    "la mise en place du réinvestissement des dividendes",
  "Réinvestissements des dividendes : Modification":
    "la modification du réinvestissement des dividendes",
  "Réinvestissements des dividendes : Arrêt":
    "l'arrêt du réinvestissement des dividendes",
};

const CLIENT_LABEL_ENTRIES = Object.entries(PLACEMENT_STELLIUM_CLIENT_LABELS);

export function formatPlacementStelliumClientLabel(
  stelliumLabel: string | null | undefined
): string {
  const raw = stelliumLabel?.trim() ?? "";
  if (!raw) return "";
  const match = CLIENT_LABEL_ENTRIES.find(([key]) => stelliumBoxPlacementLabelsMatch(key, raw));
  if (match) return match[1];
  const normalized = normalizeStelliumBoxPlacementLabel(raw);
  const fallback = CLIENT_LABEL_ENTRIES.find(
    ([key]) => normalizeStelliumBoxPlacementLabel(key) === normalized
  );
  return fallback?.[1] ?? raw;
}
