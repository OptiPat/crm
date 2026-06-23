import {
  buildRuleTree,
  leafFromLegacy,
  stringifyRuleTree,
  type RuleLeaf,
  type RuleOp,
} from "@/lib/etiquettes/rule-ast";
import { buildTypeProduitConditionConfig } from "@/lib/etiquettes/type-produit-condition";
import { isRuleLeafValidForPreview } from "@/lib/etiquettes/rule-leaf-validation";
import type { IrNetOperator } from "@/lib/etiquettes/fiscal-tmi";

export interface EtiquetteRulePreviewInput {
  isAuto: boolean;
  segmentId: number | null;
  segmentRuleJson?: string | null;
  useComboRule: boolean;
  ruleOp: RuleOp;
  ruleChildren: RuleLeaf[];
  conditionType: string;
  categoriesSelectionnees: string[];
  delaiJours: number;
  inclureSansDate: boolean;
  ageCible: number;
  ageJoursAvant: number;
  champDate: string;
  joursAvant: number;
  moisDebut: number;
  moisFin: number;
  typesProduitSelectionnes: string[];
  nomsProduitSelectionnes: string[];
  invChampDate: string;
  invJoursAvant: number;
  invTypesProduit: string[];
  tmiTranchesSelectionnees: number[];
  irNetOperator: IrNetOperator;
  irNetMontant: number | "";
}

/** JSON rule_tree v1 pour previewSegmentRuleCount, ou null si non calculable. */
export function buildEtiquetteRulePreviewJson(input: EtiquetteRulePreviewInput): string | null {
  if (!input.isAuto) return null;

  if (input.segmentId != null && input.segmentRuleJson?.trim()) {
    return input.segmentRuleJson;
  }

  if (input.useComboRule && input.ruleChildren.length > 0) {
    if (input.ruleChildren.some((c) => !isRuleLeafValidForPreview(c))) return null;
    return stringifyRuleTree(buildRuleTree(input.ruleChildren, input.ruleOp));
  }

  if (input.conditionType === "EVENEMENT_SOUSCRIPTION") {
    return null;
  }

  if (input.categoriesSelectionnees.length === 0) return null;

  let config: Record<string, unknown> = {};
  switch (input.conditionType) {
    case "DELAI_SANS_CONTACT":
      config = { jours: input.delaiJours, inclure_sans_date: input.inclureSansDate };
      break;
    case "AGE_APPROCHE":
      config = { age: input.ageCible, jours_avant: input.ageJoursAvant };
      break;
    case "DATE_APPROCHE":
      config = { champ: input.champDate, jours_avant: input.joursAvant };
      break;
    case "PERIODE_ANNEE":
      config = { mois_debut: input.moisDebut, mois_fin: input.moisFin };
      break;
    case "TYPE_PRODUIT":
      config = buildTypeProduitConditionConfig(
        input.typesProduitSelectionnes,
        input.nomsProduitSelectionnes
      );
      if (
        input.typesProduitSelectionnes.length === 0 &&
        input.nomsProduitSelectionnes.length === 0
      ) {
        return null;
      }
      break;
    case "DATE_APPROCHE_INVESTISSEMENT":
      config = {
        champ: input.invChampDate,
        jours_avant: input.invJoursAvant,
        types_produit: input.invTypesProduit.length > 0 ? input.invTypesProduit : undefined,
      };
      break;
    case "TMI":
      if (input.tmiTranchesSelectionnees.length === 0) return null;
      config = { tranches: input.tmiTranchesSelectionnees };
      break;
    case "IR_NET":
      if (input.irNetMontant === "" || !Number.isFinite(Number(input.irNetMontant))) return null;
      config = { operator: input.irNetOperator, montant: Number(input.irNetMontant) };
      break;
    default:
      return null;
  }

  const leaf = leafFromLegacy(input.conditionType, config, input.categoriesSelectionnees);
  return stringifyRuleTree(buildRuleTree([leaf], "and"));
}
