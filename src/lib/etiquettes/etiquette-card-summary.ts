import type { Etiquette } from "@/lib/api/tauri-etiquettes";
import {
  parseCategories,
  parseConditionConfig,
  type ConditionAgeApproche,
  type ConditionDateApproche,
  type ConditionDateApprocheInvestissement,
  type ConditionDelaiSansContact,
  type ConditionEvenementSouscription,
  type ConditionPeriodeAnnee,
  type ConditionTypeProduit,
} from "@/lib/api/tauri-etiquettes";
import { getConditionTypeLabel } from "@/lib/etiquettes/etiquette-condition-labels";
import {
  formatEtiquetteRuleSummary,
  type EtiquetteRuleSummaryInput,
} from "@/lib/etiquettes/etiquette-form-summary";
import { etiquetteHasAutoRule } from "@/lib/etiquettes/etiquette-auto-rule";
import {
  parseConditionIrNetConfig,
  parseConditionTmiConfig,
} from "@/lib/etiquettes/fiscal-tmi";
import { parseRuleTree } from "@/lib/etiquettes/rule-ast";

export type SegmentLookup = Map<number, { nom: string; rule_json?: string }>;

export function buildSegmentLookup(
  segments: { id: number; nom: string; rule_json?: string }[]
): SegmentLookup {
  return new Map(segments.map((s) => [s.id, { nom: s.nom, rule_json: s.rule_json }]));
}

/** Libellé court pour le badge « auto » sur une carte liste. */
export function formatEtiquetteAutoBadgeLabel(
  etiquette: Pick<Etiquette, "segment_id" | "auto_condition_type">,
  segments: SegmentLookup
): string {
  if (etiquette.segment_id != null) {
    const name = segments.get(etiquette.segment_id)?.nom;
    return name ? `Groupe · ${name}` : "Groupe de contacts";
  }
  if (etiquette.auto_condition_type === "RULE_TREE") {
    return "Règle combinée";
  }
  return getConditionTypeLabel(etiquette.auto_condition_type);
}

/** Résumé d'une règle combinée (RULE_TREE ou segment). */
export function formatRuleTreeBrief(ruleJson: string | null | undefined): string | null {
  const tree = parseRuleTree(ruleJson);
  if (!tree || tree.children.length === 0) return null;
  const op = tree.op === "and" ? "ET" : "OU";
  const n = tree.children.length;
  if (n === 1) {
    return getConditionTypeLabel(tree.children[0].type);
  }
  return `${n} conditions (${op})`;
}

function storedToSummaryInput(
  etiquette: Pick<Etiquette, "auto_condition_type" | "auto_condition_config" | "auto_categories">
): EtiquetteRuleSummaryInput | null {
  const type = etiquette.auto_condition_type;
  if (!type || type === "RULE_TREE") return null;

  const categories = parseCategories(etiquette.auto_categories);
  const base: EtiquetteRuleSummaryInput = {
    isAuto: true,
    conditionType: type,
    delaiJours: 365,
    inclureSansDate: true,
    ageCible: 69,
    ageJoursAvant: 30,
    champDate: "date_prochain_suivi",
    joursAvant: 30,
    moisDebut: 4,
    moisFin: 5,
    typesProduitCount: 0,
    invChampDate: "date_fin_demembrement",
    invJoursAvant: 180,
    invTypesProduitCount: 0,
    tmiTranches: [],
    irNetOperator: "gte",
    irNetMontant: null,
    categories,
  };

  if (type === "DELAI_SANS_CONTACT") {
    const config = parseConditionConfig<ConditionDelaiSansContact>(etiquette.auto_condition_config);
    if (config) {
      base.delaiJours = config.jours;
      base.inclureSansDate = config.inclure_sans_date !== false;
    }
  } else if (type === "AGE_APPROCHE") {
    const config = parseConditionConfig<ConditionAgeApproche>(etiquette.auto_condition_config);
    if (config) {
      base.ageCible = config.age;
      base.ageJoursAvant = config.jours_avant;
    }
  } else if (type === "DATE_APPROCHE") {
    const config = parseConditionConfig<ConditionDateApproche>(etiquette.auto_condition_config);
    if (config) {
      base.champDate = config.champ;
      base.joursAvant = config.jours_avant;
    }
  } else if (type === "PERIODE_ANNEE") {
    const config = parseConditionConfig<ConditionPeriodeAnnee>(etiquette.auto_condition_config);
    if (config) {
      base.moisDebut = config.mois_debut;
      base.moisFin = config.mois_fin;
    }
  } else if (type === "TYPE_PRODUIT") {
    const config = parseConditionConfig<ConditionTypeProduit>(etiquette.auto_condition_config);
    base.typesProduitCount = config?.types?.length ?? 0;
  } else if (type === "DATE_APPROCHE_INVESTISSEMENT") {
    const config = parseConditionConfig<ConditionDateApprocheInvestissement>(
      etiquette.auto_condition_config
    );
    if (config) {
      base.invChampDate = config.champ;
      base.invJoursAvant = config.jours_avant;
      base.invTypesProduitCount = config.types_produit?.length ?? 0;
    }
  } else if (type === "EVENEMENT_SOUSCRIPTION") {
    const config = parseConditionConfig<ConditionEvenementSouscription>(
      etiquette.auto_condition_config
    );
    base.eventTypesProduitCount = config?.types?.length ?? 0;
    base.aChaqueSouscription = config?.a_chaque_souscription ?? true;
  } else if (type === "TMI") {
    const config = parseConditionTmiConfig(etiquette.auto_condition_config);
    base.tmiTranches = config?.tranches ?? [];
  } else if (type === "IR_NET") {
    const config = parseConditionIrNetConfig(etiquette.auto_condition_config);
    if (config) {
      base.irNetOperator = config.operator;
      base.irNetMontant = config.montant;
    }
  }

  return base;
}

/** Une ligne lisible sous la carte (règle ou segment). */
export function formatEtiquetteRuleHint(
  etiquette: Pick<
    Etiquette,
    "segment_id" | "auto_condition_type" | "auto_condition_config" | "auto_categories"
  >,
  segments: SegmentLookup
): string | null {
  if (!etiquetteHasAutoRule(etiquette)) return null;

  if (etiquette.segment_id != null) {
    const seg = segments.get(etiquette.segment_id);
    if (!seg) return "Liste définie par un groupe de contacts";
    const brief = formatRuleTreeBrief(seg.rule_json);
    return brief ? `Groupe « ${seg.nom} » — ${brief}` : `Groupe « ${seg.nom} »`;
  }

  if (etiquette.auto_condition_type === "RULE_TREE") {
    const brief = formatRuleTreeBrief(etiquette.auto_condition_config);
    return brief ?? "Règle combinée";
  }

  const input = storedToSummaryInput(etiquette);
  if (!input) return null;
  return formatEtiquetteRuleSummary(input);
}

/** Résumé court d'un segment pour sa carte. */
export function formatSegmentRuleHint(ruleJson: string): string {
  return formatRuleTreeBrief(ruleJson) ?? "Règle à configurer";
}
