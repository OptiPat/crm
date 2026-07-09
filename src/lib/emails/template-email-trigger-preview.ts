import {
  parseConditionConfig,
  type ConditionAgeApproche,
  type ConditionDateApproche,
  type ConditionDateApprocheInvestissement,
  type ConditionDelaiSansContact,
  type ConditionPeriodeAnnee,
  type ConditionTypeProduit,
} from "@/lib/api/tauri-etiquettes";
import type { TemplateEmailTriggerConfig } from "@/lib/emails/template-email-trigger";
import {
  isTriggerRuleTree,
  parseTriggerRuleTree,
} from "@/lib/emails/template-email-trigger-rule-tree";
import { buildEtiquetteRulePreviewJson } from "@/lib/etiquettes/etiquette-rule-preview";
import {
  parseConditionIrNetConfig,
  parseConditionRevenusAnnuelsConfig,
  parseConditionTmiConfig,
  type IrNetOperator,
} from "@/lib/etiquettes/fiscal-tmi";
import { isRuleLeafValidForPreview } from "@/lib/etiquettes/rule-leaf-validation";
import { stringifyRuleTree } from "@/lib/etiquettes/rule-ast";

/** JSON rule_tree v1 pour SegmentRulePreview, ou null si non calculable. */
export function buildTemplateEmailTriggerPreviewJson(
  trigger: TemplateEmailTriggerConfig
): string | null {
  if (!trigger.enabled || !trigger.condition_type?.trim()) return null;

  if (isTriggerRuleTree(trigger.condition_type)) {
    const tree = parseTriggerRuleTree(trigger.condition_config);
    if (!tree || tree.children.length === 0) return null;
    if (tree.children.some((leaf) => !isRuleLeafValidForPreview(leaf))) return null;
    return stringifyRuleTree(tree);
  }

  const type = trigger.condition_type;
  const categories = trigger.categories;

  let delaiJours = 365;
  let inclureSansDate = true;
  let ageCible = 69;
  let ageJoursAvant = 30;
  let champDate = "date_prochain_suivi";
  let joursAvant = 30;
  let moisDebut = 4;
  let moisFin = 5;
  let typesProduitSelectionnes: string[] = [];
  let nomsProduitSelectionnes: string[] = [];
  let invChampDate = "date_fin_demembrement";
  let invJoursAvant = 180;
  let invTypesProduit: string[] = [];
  let tmiTranchesSelectionnees: number[] = [];
  let irNetOperator: IrNetOperator = "gte";
  let irNetMontant: number | "" = "";
  let revenusAnnuelsOperator: IrNetOperator = "gte";
  let revenusAnnuelsMontant: number | "" = "";

  if (type === "DELAI_SANS_CONTACT") {
    const config = parseConditionConfig<ConditionDelaiSansContact>(trigger.condition_config);
    if (config) {
      delaiJours = config.jours;
      inclureSansDate = config.inclure_sans_date !== false;
    }
  } else if (type === "AGE_APPROCHE") {
    const config = parseConditionConfig<ConditionAgeApproche>(trigger.condition_config);
    if (config) {
      ageCible = config.age;
      ageJoursAvant = config.jours_avant;
    }
  } else if (type === "DATE_APPROCHE") {
    const config = parseConditionConfig<ConditionDateApproche>(trigger.condition_config);
    if (config) {
      champDate = config.champ;
      joursAvant = config.jours_avant;
    }
  } else if (type === "PERIODE_ANNEE") {
    const config = parseConditionConfig<ConditionPeriodeAnnee>(trigger.condition_config);
    if (config) {
      moisDebut = config.mois_debut;
      moisFin = config.mois_fin;
    }
  } else if (type === "TYPE_PRODUIT") {
    const config = parseConditionConfig<ConditionTypeProduit>(trigger.condition_config);
    typesProduitSelectionnes = config?.types ?? [];
    nomsProduitSelectionnes = config?.noms_produit ?? [];
  } else if (type === "DATE_APPROCHE_INVESTISSEMENT") {
    const config = parseConditionConfig<ConditionDateApprocheInvestissement>(
      trigger.condition_config
    );
    if (config) {
      invChampDate = config.champ;
      invJoursAvant = config.jours_avant;
      invTypesProduit = config.types_produit ?? [];
    }
  } else if (type === "TMI") {
    const config = parseConditionTmiConfig(trigger.condition_config);
    tmiTranchesSelectionnees = config?.tranches ?? [];
  } else if (type === "IR_NET") {
    const config = parseConditionIrNetConfig(trigger.condition_config);
    if (config) {
      irNetOperator = config.operator;
      irNetMontant = config.montant;
    }
  } else if (type === "REVENUS_ANNUELS") {
    const config = parseConditionRevenusAnnuelsConfig(trigger.condition_config);
    if (config) {
      revenusAnnuelsOperator = config.operator;
      revenusAnnuelsMontant = config.montant;
    }
  }

  return buildEtiquetteRulePreviewJson({
    isAuto: true,
    segmentId: null,
    useComboRule: false,
    ruleOp: "and",
    ruleChildren: [],
    conditionType: type,
    categoriesSelectionnees: categories,
    delaiJours,
    inclureSansDate,
    ageCible,
    ageJoursAvant,
    champDate,
    joursAvant,
    moisDebut,
    moisFin,
    typesProduitSelectionnes,
    nomsProduitSelectionnes,
    invChampDate,
    invJoursAvant,
    invTypesProduit,
    tmiTranchesSelectionnees,
    irNetOperator,
    irNetMontant,
    revenusAnnuelsOperator,
    revenusAnnuelsMontant,
  });
}
