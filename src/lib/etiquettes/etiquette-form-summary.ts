import { MOIS_LABELS } from "@/lib/api/tauri-etiquettes";
import { CONDITION_TYPE_LABELS, type ConditionType } from "@/lib/etiquettes/etiquette-condition-labels";

const CATEGORY_LABELS: Record<string, string> = {
  CLIENT: "Clients",
  PROSPECT_CLIENT: "Prospects client",
  PROSPECT_FILLEUL: "Prospects filleul",
  SUSPECT_CLIENT: "Suspects client",
  SUSPECT_FILLEUL: "Suspects filleul",
};

export interface EtiquetteRuleSummaryInput {
  isAuto: boolean;
  conditionType: string;
  delaiJours: number;
  inclureSansDate: boolean;
  ageCible: number;
  ageJoursAvant: number;
  champDate: string;
  joursAvant: number;
  moisDebut: number;
  moisFin: number;
  typesProduitCount: number;
  nomsProduitCount?: number;
  /** Types produit pour EVENEMENT_SOUSCRIPTION (sinon `typesProduitCount`). */
  eventTypesProduitCount?: number;
  /** Pose de l'étiquette à chaque investissement (événement souscription). */
  aChaqueSouscription?: boolean;
  invChampDate: string;
  invJoursAvant: number;
  invTypesProduitCount: number;
  tmiTranches: number[];
  irNetOperator: string;
  irNetMontant: number | null;
  categories: string[];
}

const CHAMP_DATE_LABELS: Record<string, string> = {
  date_prochain_suivi: "prochain suivi client",
  date_prochain_suivi_filleul: "prochain suivi filleul",
  date_dernier_contact_filleul: "dernier contact filleul",
  date_naissance: "date de naissance",
};

const INV_CHAMP_LABELS: Record<string, string> = {
  date_fin_demembrement: "fin de démembrement",
  date_fin_pret: "fin de prêt",
  date_souscription: "souscription",
};

function monthLabel(m: number): string {
  return MOIS_LABELS.find((x) => x.value === m)?.label ?? `mois ${m}`;
}

function formatCategories(categories: string[]): string {
  if (categories.length === 0) return "aucune catégorie";
  return categories.map((c) => CATEGORY_LABELS[c] ?? c).join(", ");
}

export function formatEtiquetteRuleSummary(input: EtiquetteRuleSummaryInput): string {
  if (!input.isAuto) {
    return "Attribution manuelle uniquement — vous posez l'étiquette sur chaque fiche.";
  }

  const typeLabel =
    CONDITION_TYPE_LABELS[input.conditionType as ConditionType] ??
    input.conditionType.replace(/_/g, " ").toLowerCase();

  let detail = "";
  switch (input.conditionType) {
    case "EVENEMENT_SOUSCRIPTION": {
      const count = input.eventTypesProduitCount ?? input.typesProduitCount;
      const types =
        count > 0
          ? ` (${count} type${count > 1 ? "s" : ""} de produit)`
          : " (tous produits)";
      const repeat =
        input.aChaqueSouscription === false
          ? " — étiquette une seule fois par contact"
          : " — étiquette à chaque investissement";
      detail = `souscription enregistrée sur la fiche${types}${repeat}`;
      break;
    }
    case "DELAI_SANS_CONTACT":
      detail = `sans contact depuis ${input.delaiJours} jour${input.delaiJours > 1 ? "s" : ""}${
        input.inclureSansDate ? " (y compris sans date renseignée)" : ""
      }`;
      break;
    case "AGE_APPROCHE":
      detail = `à ${input.ageCible} ans dans les ${input.ageJoursAvant} prochains jours`;
      break;
    case "DATE_APPROCHE":
      detail = `${CHAMP_DATE_LABELS[input.champDate] ?? input.champDate} dans les ${input.joursAvant} prochains jours`;
      break;
    case "PERIODE_ANNEE":
      detail = `de ${monthLabel(input.moisDebut)} à ${monthLabel(input.moisFin)} (chaque année)`;
      break;
    case "TYPE_PRODUIT": {
      const parts: string[] = [];
      if (input.typesProduitCount > 0) {
        parts.push(
          `${input.typesProduitCount} type${input.typesProduitCount > 1 ? "s" : ""}`
        );
      }
      const nomsCount = input.nomsProduitCount ?? 0;
      if (nomsCount > 0) {
        parts.push(`${nomsCount} nom${nomsCount > 1 ? "s" : ""} de produit`);
      }
      detail =
        parts.length > 0
          ? `détient au moins un investissement (${parts.join(" + ")})`
          : "aucun type ni nom de produit sélectionné";
      break;
    }
    case "DATE_APPROCHE_INVESTISSEMENT": {
      const types =
        input.invTypesProduitCount > 0
          ? ` (${input.invTypesProduitCount} type${input.invTypesProduitCount > 1 ? "s" : ""} limités)`
          : "";
      detail = `${INV_CHAMP_LABELS[input.invChampDate] ?? input.invChampDate} dans les ${input.invJoursAvant} prochains jours${types} — contact ou foyer`;
      break;
    }
    case "TMI":
      detail =
        input.tmiTranches.length > 0
          ? input.tmiTranches.map((r) => `${r} %`).join(" ou ")
          : "aucune tranche sélectionnée";
      break;
    case "IR_NET": {
      const op =
        input.irNetOperator === "lte"
          ? "≤"
          : input.irNetOperator === "eq"
            ? "="
            : "≥";
      const m =
        input.irNetMontant != null
          ? new Intl.NumberFormat("fr-FR", {
              style: "currency",
              currency: "EUR",
              maximumFractionDigits: 0,
            }).format(input.irNetMontant)
          : "…";
      detail = `IR net ${op} ${m}`;
      break;
    }
    default:
      detail = "paramètres à compléter";
  }

  return `${typeLabel} : ${detail}. Catégories : ${formatCategories(input.categories)}.`;
}
